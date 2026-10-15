from __future__ import annotations

import json
import tempfile
import unittest
from contextlib import ExitStack
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.ai as api_ai
import api.users as api_users
from services.channel_service import ChannelService
from services.storage.json_storage import JSONStorageBackend


class ExternalImageChannelApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.requests: list[dict[str, object]] = []
        self.upstream_status = 200
        self.upstream_payload: dict[str, object] = {
            "created": 123,
            "data": [{"url": "https://images.example/result.png"}],
        }
        test_case = self

        class UpstreamHandler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                test_case.requests.append({
                    "path": self.path,
                    "authorization": self.headers.get("Authorization"),
                    "content_type": self.headers.get("Content-Type"),
                    "body": self.rfile.read(int(self.headers.get("Content-Length", "0"))),
                })
                body = json.dumps(test_case.upstream_payload).encode("utf-8")
                self.send_response(test_case.upstream_status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, format: str, *args: object) -> None:
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), UpstreamHandler)
        self.stack.callback(server.server_close)
        thread = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        thread.start()
        self.stack.callback(thread.join)
        self.stack.callback(server.shutdown)
        tmp_dir = self.stack.enter_context(tempfile.TemporaryDirectory())
        storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
        storage.save_channels([{
            "id": "external",
            "name": "External",
            "base_url": f"http://127.0.0.1:{server.server_port}/v1",
            "api_key": "test-local-key",
            "models": ["codex-gpt-image-2"],
        }])
        config_store = mock.Mock()
        config_store.get.return_value = {"internal_pool_enabled": False}
        config_store.image_model_mappings = {}
        self.channels = ChannelService(storage, config_store)
        identity = {"id": "admin", "name": "Admin", "role": "admin"}
        self.stack.enter_context(mock.patch.object(api_ai, "require_identity", return_value=identity))
        self.stack.enter_context(mock.patch.object(api_users, "require_admin", return_value=identity))
        self.stack.enter_context(mock.patch.object(api_ai, "channel_service", self.channels))
        self.stack.enter_context(mock.patch.object(api_users, "channel_service", self.channels))
        self.stack.enter_context(mock.patch.object(api_users.audit_service, "add"))
        self.stack.enter_context(mock.patch.object(api_ai, "record_image_result"))
        self.log = self.stack.enter_context(mock.patch.object(api_ai.LoggedCall, "log"))
        self.stack.enter_context(mock.patch(
            "services.channel_service.proxy_settings.build_session_kwargs",
            return_value={"verify": True, "trust_env": False},
        ))
        self.internal_generation = self.stack.enter_context(mock.patch.object(
            api_ai.openai_v1_image_generations, "handle", side_effect=AssertionError("internal pool called"),
        ))
        self.internal_edit = self.stack.enter_context(mock.patch.object(
            api_ai.openai_v1_image_edit, "handle", side_effect=AssertionError("internal pool called"),
        ))
        app = FastAPI()
        app.include_router(api_ai.create_router())
        app.include_router(api_users.create_router())
        self.client = self.stack.enter_context(TestClient(app))

    def image_request(self, mode: str, *, stream: bool = False, model: str = "gpt-image-2"):
        payload = {"model": model, "prompt": "draw", "n": 1, "size": "1:1", "stream": stream}
        if mode == "generations":
            return self.client.post("/v1/images/generations", json=payload)
        return self.client.post(
            "/v1/images/edits",
            data={**payload, "stream": str(stream).lower()},
            files={"image": ("input.png", b"image-bytes", "image/png")},
        )

    def test_images_use_external_http_with_internal_pool_disabled(self) -> None:
        for mode in ("generations", "edits"):
            for stream in (False, True):
                with self.subTest(mode=mode, stream=stream):
                    response = self.image_request(mode, stream=stream)
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertIn("https://images.example/result.png", response.text)
                    upstream = self.requests[-1]
                    self.assertEqual(upstream["path"], f"/v1/images/{mode}")
                    self.assertEqual(upstream["authorization"], "Bearer test-local-key")
                    if mode == "generations":
                        body = json.loads(upstream["body"])
                        self.assertEqual(body["model"], "codex-gpt-image-2")
                        self.assertEqual(body["size"], "1024x1024")
                        self.assertNotIn("stream", body)
                    else:
                        self.assertTrue(str(upstream["content_type"]).startswith("multipart/form-data"))
                        self.assertIn(b"codex-gpt-image-2", upstream["body"])
                        self.assertIn(b"image-bytes", upstream["body"])
        self.internal_generation.assert_not_called()
        self.internal_edit.assert_not_called()

    def test_channel_test_makes_real_generation_request(self) -> None:
        response = self.client.post(
            "/api/admin/channels/external/models/test", json={"models": ["gpt-image-2"]},
        )
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["results"][0]["image_count"], 1)
        self.assertEqual(result["results"][0]["request_model"], "codex-gpt-image-2")
        self.assertEqual([item["path"] for item in self.requests], ["/v1/images/generations"])
        self.assertNotIn("api_key", result["channel"])

    def test_upstream_failure_is_reported_by_images_and_channel_test(self) -> None:
        self.upstream_status = 503
        self.upstream_payload = {"error": {"message": "image capacity exhausted"}}
        for mode in ("generations", "edits"):
            with self.subTest(mode=mode):
                response = self.image_request(mode)
                self.assertEqual(response.status_code, 502, response.text)
                message = response.json()["detail"]["error"]
                self.assertIn("External", message)
                self.assertIn("HTTP 503", message)
                self.assertIn("image capacity exhausted", message)
        tested = self.client.post(
            "/api/admin/channels/external/models/test", json={"models": ["gpt-image-2"]},
        ).json()
        self.assertFalse(tested["ok"])
        self.assertIn("HTTP 503", tested["error"])
        self.assertEqual(self.log.call_count, 2)
        self.assertEqual(self.log.call_args.kwargs["status"], "failed")
        self.internal_generation.assert_not_called()
        self.internal_edit.assert_not_called()

    def test_empty_upstream_result_is_not_a_success(self) -> None:
        self.upstream_payload = {"data": []}
        for mode in ("generations", "edits"):
            with self.subTest(mode=mode):
                response = self.image_request(mode)
                self.assertEqual(response.status_code, 502, response.text)
                self.assertIn("no image", response.json()["detail"]["error"])
        tested = self.client.post(
            "/api/admin/channels/external/models/test", json={"models": ["gpt-image-2"]},
        ).json()
        self.assertFalse(tested["ok"])
        self.assertIn("no image", tested["error"])

    def test_unmatched_model_reports_unavailable_channel(self) -> None:
        for mode in ("generations", "edits"):
            with self.subTest(mode=mode):
                response = self.image_request(mode, model="missing-model")
                self.assertEqual(response.status_code, 503, response.text)
                self.assertIn("missing-model", response.json()["detail"]["error"])
        self.assertEqual(self.requests, [])
        self.internal_generation.assert_not_called()
        self.internal_edit.assert_not_called()

    def test_channel_test_uses_friendly_connection_error(self) -> None:
        with mock.patch.object(self.channels, "_session", side_effect=RuntimeError("curl: (35) Recv failure")):
            result = self.client.post(
                "/api/admin/channels/external/models/test", json={"models": ["gpt-image-2"]},
            ).json()
        self.assertFalse(result["ok"])
        self.assertIn("连接被上游重置", result["error"])


if __name__ == "__main__":
    unittest.main()
