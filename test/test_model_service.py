from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from services.channel_service import ChannelService
from services.model_service import FIXED_BILLING_MODE, ModelService, normalize_model_pricing
from services.storage.json_storage import JSONStorageBackend
from utils.model_catalog import DEFAULT_INTERNAL_MODELS


class FakeConfigStore:
    def __init__(self):
        self.data: dict[str, object] = {}

    def get(self) -> dict[str, object]:
        return dict(self.data)

    def update(self, data: dict[str, object]) -> dict[str, object]:
        self.data.update(data)
        return self.get()


class ModelServiceTest(unittest.TestCase):
    def test_extract_model_ids_accepts_openai_and_compatible_shapes(self) -> None:
        payload = {
            "data": [
                {"id": "gpt-5-5"},
                {"model": "gpt-image-2"},
                "codex-gpt-image-2",
                {"slug": "custom-model"},
                {"id": "gpt-5-5"},
            ]
        }

        self.assertEqual(
            ChannelService.extract_model_ids(payload),
            ["gpt-5-5", "gpt-image-2", "codex-gpt-image-2", "custom-model"],
        )

    def test_catalog_merges_channel_models_with_default_pricing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            storage.save_channels(
                [
                    {
                        "id": "channel-a",
                        "name": "2api",
                        "base_url": "https://example.test",
                        "api_key": "sk-test",
                        "models": ["gpt-5-5", "gpt-image-2"],
                        "enabled": True,
                    }
                ]
            )
            service = ModelService(ChannelService(storage), FakeConfigStore())

            catalog = service.list_catalog()
            by_model = {item["model"]: item for item in catalog["items"]}

            self.assertIn("gpt-5-5", by_model)
            self.assertIn("codex-gpt-image-2", by_model)
            self.assertEqual(by_model["gpt-5-5"]["channel_count"], 2)
            self.assertFalse(by_model["gpt-5-5"]["configured"])
            self.assertEqual(by_model["gpt-5-5"]["pricing"]["billing_mode"], "tokens")

    def test_internal_pool_uses_new_api_default_models(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            service = ModelService(ChannelService(storage), FakeConfigStore())

            catalog = service.list_catalog()
            by_model = {item["model"]: item for item in catalog["items"]}

            for model in DEFAULT_INTERNAL_MODELS:
                self.assertIn(model, by_model)
                self.assertGreaterEqual(by_model[model]["channel_count"], 1)

    def test_internal_pool_enabled_state_is_configurable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            config_store = FakeConfigStore()
            service = ChannelService(storage, config_store)

            self.assertTrue(service.get_channel("internal_pool")["enabled"])

            item = service.update_channel("internal_pool", {"enabled": False})

            self.assertIsNotNone(item)
            self.assertFalse(item["enabled"])
            self.assertFalse(service.is_internal_pool_enabled())
            self.assertFalse(service.list_channels()[0]["enabled"])

    def test_channel_model_test_reports_status_without_persisting_models(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            storage.save_channels(
                [
                    {
                        "id": "channel-a",
                        "name": "A",
                        "base_url": "https://a.example",
                        "api_key": "sk-test",
                        "models": ["configured-model"],
                    }
                ]
            )
            service = ChannelService(storage, FakeConfigStore())

            service._fetch_external_channel_models = lambda channel: ["remote-model", "other-model"]  # type: ignore[method-assign]
            result = service.test_channel_models("channel-a", ["remote-model"])

            self.assertIsNotNone(result)
            self.assertTrue(result["ok"])
            self.assertEqual(result["models"], ["remote-model", "other-model"])
            self.assertEqual(result["tested_models"], ["remote-model"])
            self.assertEqual(result["missing_models"], [])
            self.assertEqual(service.get_channel("channel-a")["models"], ["configured-model"])

            missing = service.test_channel_models("channel-a", ["missing-model"])

            self.assertIsNotNone(missing)
            self.assertFalse(missing["ok"])
            self.assertEqual(missing["tested_models"], ["missing-model"])
            self.assertEqual(missing["missing_models"], ["missing-model"])

            def fail_fetch(channel):
                raise RuntimeError("models unavailable")

            service._fetch_external_channel_models = fail_fetch  # type: ignore[method-assign]
            failed = service.test_channel_models("channel-a", ["remote-model"])

            self.assertIsNotNone(failed)
            self.assertFalse(failed["ok"])
            self.assertEqual(failed["tested_models"], ["remote-model"])
            self.assertIn("models unavailable", failed["error"])

    def test_channel_urls_accept_base_url_with_or_without_v1(self) -> None:
        self.assertEqual(
            ChannelService._openai_compatible_url({"base_url": "https://api.example.test"}, "/v1/models"),
            "https://api.example.test/v1/models",
        )
        self.assertEqual(
            ChannelService._openai_compatible_url({"base_url": "https://api.example.test/v1"}, "/v1/models"),
            "https://api.example.test/v1/models",
        )

    def test_model_list_unsupported_status_gets_helpful_error(self) -> None:
        class FakeResponse:
            ok = False
            status_code = 405
            text = "Method Not Allowed"

        class FakeSession:
            def get(self, url, timeout):
                return FakeResponse()

        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            storage.save_channels(
                [
                    {
                        "id": "channel-a",
                        "name": "A",
                        "base_url": "https://a.example",
                        "api_key": "sk-test",
                        "models": ["configured-model"],
                    }
                ]
            )
            service = ChannelService(storage, FakeConfigStore())
            service._session = lambda channel: FakeSession()  # type: ignore[method-assign]

            result = service.test_channel_models("channel-a", ["configured-model"])

            self.assertIsNotNone(result)
            self.assertFalse(result["ok"])
            self.assertIn("渠道模型列表接口不可用", result["error"])
            self.assertIn("GET /v1/models", result["error"])
            self.assertIn("HTTP 405", result["error"])

    def test_external_channel_matches_mapped_image_model(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            storage.save_channels(
                [
                    {
                        "id": "channel-a",
                        "name": "A",
                        "base_url": "https://a.example",
                        "api_key": "sk-test",
                        "models": ["gpt-5-5"],
                    }
                ]
            )
            service = ChannelService(storage, FakeConfigStore())

            self.assertTrue(service.has_external_channels("gpt-image-2"))

    def test_generation_uses_mapped_channel_model(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            storage.save_channels(
                [
                    {
                        "id": "channel-a",
                        "name": "A",
                        "base_url": "https://a.example",
                        "api_key": "sk-test",
                        "models": ["gpt-5-5"],
                    }
                ]
            )
            service = ChannelService(storage, FakeConfigStore())
            seen: dict[str, object] = {}

            def fake_generation(channel, payload):
                seen["channel"] = channel.get("id")
                seen["model"] = payload.get("model")
                return {"created": 1, "data": [{"url": "https://a.example/image.png"}]}

            service._call_generation = fake_generation  # type: ignore[method-assign]
            routed = service.call_generation({"prompt": "draw", "model": "gpt-image-2", "n": 1})

            self.assertIsNotNone(routed)
            self.assertEqual(seen["channel"], "channel-a")
            self.assertEqual(seen["model"], "gpt-5-5")
            self.assertEqual(routed[1], "A")

    def test_generation_prefers_external_image_alias_before_internal_mapping(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            storage.save_channels(
                [
                    {
                        "id": "channel-a",
                        "name": "A",
                        "base_url": "https://a.example",
                        "api_key": "sk-test",
                        "models": ["gpt-5-5", "codex-gpt-image-2"],
                    }
                ]
            )
            service = ChannelService(storage, FakeConfigStore())
            seen: dict[str, object] = {}

            def fake_generation(channel, payload):
                seen["model"] = payload.get("model")
                return {"created": 1, "data": [{"url": "https://a.example/image.png"}]}

            service._call_generation = fake_generation  # type: ignore[method-assign]
            routed = service.call_generation({"prompt": "draw", "model": "gpt-image-2", "n": 1})

            self.assertIsNotNone(routed)
            self.assertEqual(seen["model"], "codex-gpt-image-2")

    def test_personal_generation_channel_precedes_global_channels(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            storage.save_channels(
                [
                    {
                        "id": "channel-a",
                        "name": "Global",
                        "base_url": "https://global.example",
                        "api_key": "sk-global",
                        "models": ["gpt-image-2"],
                    }
                ]
            )
            service = ChannelService(storage, FakeConfigStore())
            calls: list[str] = []

            def fake_generation(channel, payload):
                calls.append(str(channel.get("id")))
                return {"created": 1, "data": [{"url": "https://personal.example/image.png"}]}

            service._call_generation = fake_generation  # type: ignore[method-assign]
            routed = service.call_generation(
                {
                    "prompt": "draw",
                    "model": "gpt-image-2",
                    "n": 1,
                    "_owner_user_id": "user-a",
                    "_personal_image_channel": {
                        "enabled": True,
                        "name": "Mine",
                        "base_url": "https://personal.example",
                        "api_key": "sk-personal",
                        "models": ["gpt-image-2"],
                    },
                }
            )

            self.assertIsNotNone(routed)
            self.assertEqual(calls, ["personal_image_channel:user-a"])
            self.assertEqual(routed[1], "个人渠道/Mine")

    def test_personal_generation_channel_does_not_fall_back_to_global_channel(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            storage.save_channels(
                [
                    {
                        "id": "channel-a",
                        "name": "Global",
                        "base_url": "https://global.example",
                        "api_key": "sk-global",
                        "models": ["gpt-image-2"],
                    }
                ]
            )
            service = ChannelService(storage, FakeConfigStore())
            calls: list[str] = []
            payload = {
                "prompt": "draw",
                "model": "gpt-image-2",
                "n": 1,
                "_owner_user_id": "user-a",
                "_personal_image_channel": {
                    "enabled": True,
                    "name": "Mine",
                    "base_url": "https://personal.example",
                    "api_key": "sk-personal",
                    "models": ["gpt-image-2"],
                },
            }

            def fake_generation(channel, payload):
                channel_id = str(channel.get("id"))
                calls.append(channel_id)
                if channel_id.startswith("personal_image_channel:"):
                    raise RuntimeError("Failed to perform, curl: (35) Recv failure: Connection was reset.")
                return {"created": 1, "data": [{"url": "https://global.example/image.png"}]}

            service._call_generation = fake_generation  # type: ignore[method-assign]
            routed = service.call_generation(payload)

            self.assertIsNone(routed)
            self.assertEqual(calls, ["personal_image_channel:user-a"])
            self.assertIn("个人渠道/Mine: 连接被上游重置", payload["_personal_channel_error"])

    def test_external_generation_channel_normalizes_aspect_ratio_for_upstream(self) -> None:
        class FakeResponse:
            ok = True
            status_code = 200
            text = ""

            def json(self):
                return {"created": 1, "data": [{"url": "https://a.example/image.png"}]}

        calls: dict[str, object] = {}

        class FakeSession:
            def post(self, url, **kwargs):
                calls["url"] = url
                calls["kwargs"] = kwargs
                return FakeResponse()

        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            storage.save_channels(
                [
                    {
                        "id": "channel-a",
                        "name": "A",
                        "base_url": "https://a.example",
                        "api_key": "sk-test",
                        "models": ["gpt-image-2"],
                    }
                ]
            )
            service = ChannelService(storage, FakeConfigStore())
            service._session = lambda channel: FakeSession()  # type: ignore[method-assign]

            routed = service.call_generation({
                "prompt": "draw",
                "model": "gpt-image-2",
                "n": 1,
                "size": "9:16",
                "response_format": "url",
            })

        self.assertIsNotNone(routed)
        self.assertEqual(calls["url"], "https://a.example/v1/images/generations")
        body = calls["kwargs"]["json"]
        self.assertEqual(body["size"], "1024x1536")
        self.assertEqual(body["prompt"], "draw\n\n输出为 9:16 竖屏构图，适合竖版画幅展示。")

    def test_personal_edit_channel_does_not_fall_back_to_global_channel(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            storage.save_channels(
                [
                    {
                        "id": "channel-a",
                        "name": "Global",
                        "base_url": "https://global.example",
                        "api_key": "sk-global",
                        "models": ["gpt-image-2"],
                    }
                ]
            )
            service = ChannelService(storage, FakeConfigStore())
            calls: list[str] = []
            payload = {
                "prompt": "draw",
                "model": "gpt-image-2",
                "n": 1,
                "_owner_user_id": "user-a",
                "_personal_image_channel": {
                    "enabled": True,
                    "name": "Mine",
                    "base_url": "https://personal.example",
                    "api_key": "sk-personal",
                    "models": ["gpt-image-2"],
                },
            }

            def fake_edit(channel, routed_payload):
                channel_id = str(channel.get("id"))
                calls.append(channel_id)
                if channel_id.startswith("personal_image_channel:"):
                    raise RuntimeError("Failed to perform, curl: (35) Recv failure: Connection was reset.")
                return {"created": 1, "data": [{"url": "https://global.example/image.png"}]}

            service._call_edit = fake_edit  # type: ignore[method-assign]
            routed = service.call_edit(payload)

            self.assertIsNone(routed)
            self.assertEqual(calls, ["personal_image_channel:user-a"])
            self.assertIn("个人渠道/Mine: 连接被上游重置", payload["_personal_channel_error"])

    def test_external_edit_channel_uses_curl_mime_multipart(self) -> None:
        class FakeResponse:
            ok = True
            status_code = 200
            text = ""

            def json(self):
                return {"created": 1, "data": [{"url": "https://a.example/image.png"}]}

        calls: dict[str, object] = {}

        class FakeSession:
            def post(self, url, **kwargs):
                calls["url"] = url
                calls["kwargs"] = kwargs
                return FakeResponse()

        mime_instances = []

        class FakeCurlMime:
            def __init__(self):
                self.parts = []
                self.closed = False
                mime_instances.append(self)

            def addpart(self, name, **kwargs):
                self.parts.append({"name": name, **kwargs})

            def close(self):
                self.closed = True

        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            storage.save_channels(
                [
                    {
                        "id": "channel-a",
                        "name": "A",
                        "base_url": "https://a.example",
                        "api_key": "sk-test",
                        "models": ["gpt-image-2"],
                    }
                ]
            )
            service = ChannelService(storage, FakeConfigStore())
            service._session = lambda channel: FakeSession()  # type: ignore[method-assign]

            with mock.patch("services.channel_service.CurlMime", FakeCurlMime):
                routed = service.call_edit({
                    "prompt": "draw",
                    "model": "gpt-image-2",
                    "n": 2,
                    "size": "1024x1024",
                    "response_format": "url",
                    "images": [(b"image-bytes", "input.png", "image/png")],
                })

        self.assertIsNotNone(routed)
        self.assertEqual(calls["url"], "https://a.example/v1/images/edits")
        kwargs = calls["kwargs"]
        self.assertNotIn("files", kwargs)
        self.assertNotIn("data", kwargs)
        self.assertIs(kwargs["multipart"], mime_instances[0])
        self.assertTrue(mime_instances[0].closed)
        parts = mime_instances[0].parts
        self.assertIn({"name": "prompt", "data": b"draw"}, parts)
        self.assertIn({"name": "model", "data": b"gpt-image-2"}, parts)
        self.assertIn({"name": "n", "data": b"2"}, parts)
        self.assertIn({"name": "size", "data": b"1024x1024"}, parts)
        self.assertIn({"name": "response_format", "data": b"url"}, parts)
        self.assertIn(
            {"name": "image", "filename": "input.png", "content_type": "image/png", "data": b"image-bytes"},
            parts,
        )

    def test_external_edit_channel_normalizes_aspect_ratio_for_upstream(self) -> None:
        class FakeResponse:
            ok = True
            status_code = 200
            text = ""

            def json(self):
                return {"created": 1, "data": [{"url": "https://a.example/image.png"}]}

        calls: dict[str, object] = {}

        class FakeSession:
            def post(self, url, **kwargs):
                calls["url"] = url
                calls["kwargs"] = kwargs
                return FakeResponse()

        mime_instances = []

        class FakeCurlMime:
            def __init__(self):
                self.parts = []
                self.closed = False
                mime_instances.append(self)

            def addpart(self, name, **kwargs):
                self.parts.append({"name": name, **kwargs})

            def close(self):
                self.closed = True

        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            storage.save_channels(
                [
                    {
                        "id": "channel-a",
                        "name": "A",
                        "base_url": "https://a.example",
                        "api_key": "sk-test",
                        "models": ["gpt-image-2"],
                    }
                ]
            )
            service = ChannelService(storage, FakeConfigStore())
            service._session = lambda channel: FakeSession()  # type: ignore[method-assign]

            with mock.patch("services.channel_service.CurlMime", FakeCurlMime):
                routed = service.call_edit({
                    "prompt": "draw",
                    "model": "gpt-image-2",
                    "n": 2,
                    "size": "9:16",
                    "response_format": "url",
                    "images": [(b"image-bytes", "input.png", "image/png")],
                })

        self.assertIsNotNone(routed)
        self.assertEqual(calls["url"], "https://a.example/v1/images/edits")
        parts = mime_instances[0].parts
        self.assertIn(
            {"name": "prompt", "data": "draw\n\n输出为 9:16 竖屏构图，适合竖版画幅展示。".encode("utf-8")},
            parts,
        )
        self.assertIn({"name": "size", "data": b"1024x1536"}, parts)

    def test_channel_model_test_accepts_mapped_requested_model(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            storage.save_channels(
                [
                    {
                        "id": "channel-a",
                        "name": "A",
                        "base_url": "https://a.example",
                        "api_key": "sk-test",
                        "models": ["gpt-5-5"],
                    }
                ]
            )
            service = ChannelService(storage, FakeConfigStore())

            service._fetch_external_channel_models = lambda channel: ["gpt-5-5"]  # type: ignore[method-assign]
            result = service.test_channel_models("channel-a", ["gpt-image-2"])

            self.assertIsNotNone(result)
            self.assertTrue(result["ok"])
            self.assertEqual(result["missing_models"], [])

    def test_update_pricing_persists_and_estimates_token_cost(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            service = ModelService(ChannelService(storage), FakeConfigStore())

            pricing = service.update_pricing(
                "gpt-5-5",
                {"input_price_per_million": 5, "output_price_per_million": 40, "currency": "usd"},
            )
            estimate = service.estimate_cost("gpt-5-5", prompt_tokens=1_000_000, completion_tokens=1_000_000)

            self.assertEqual(pricing["completion_ratio"], 8)
            self.assertEqual(estimate["amount"], 45)
            self.assertEqual(estimate["unit"], "usd")
            self.assertTrue(service.list_catalog()["pricing"]["gpt-5-5"]["enabled"])

    def test_fixed_price_mode_estimates_per_request_cost(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = JSONStorageBackend(Path(tmp_dir) / "accounts.json")
            service = ModelService(ChannelService(storage), FakeConfigStore())

            service.update_pricing(
                "image-model",
                {"billing_mode": FIXED_BILLING_MODE, "model_price": 0.02, "currency": "USD"},
            )
            estimate = service.estimate_cost("image-model", prompt_tokens=999, completion_tokens=999, group_ratio=2)

            self.assertEqual(estimate["amount"], 0.04)
            self.assertEqual(estimate["unit"], "usd")

    def test_completion_ratio_can_derive_output_price(self) -> None:
        pricing = normalize_model_pricing("gpt-test", {"input_price_per_million": 5, "completion_ratio": 8})

        self.assertEqual(pricing["output_price_per_million"], 40)
        self.assertEqual(pricing["completion_ratio"], 8)


if __name__ == "__main__":
    unittest.main()
