from __future__ import annotations

import unittest
from unittest import mock

from services.channel_service import ChannelService


class FakeImageResponse:
    ok = True
    status_code = 200
    text = ""

    def __init__(self, payload: dict[str, object]):
        self.payload = payload

    def json(self) -> dict[str, object]:
        return self.payload


class ChannelImageResponseTests(unittest.TestCase):
    def test_empty_image_response_is_rejected(self) -> None:
        for data in ([], [{}], [{"url": ""}], [None]):
            with self.subTest(data=data):
                response = FakeImageResponse({"data": data})
                with self.assertRaisesRegex(RuntimeError, "no image"):
                    ChannelService._normalize_response(response, {})

    def test_upstream_error_in_success_response_is_preserved(self) -> None:
        for error in ({"message": "image capacity exhausted"}, "image capacity exhausted"):
            with self.subTest(error=error):
                response = FakeImageResponse({"data": [], "error": error})
                with self.assertRaisesRegex(RuntimeError, "image capacity exhausted"):
                    ChannelService._normalize_response(response, {})

    def test_data_url_in_url_field_is_uploaded_to_webdav(self) -> None:
        response = FakeImageResponse({
            "created": 123,
            "data": [{
                "url": "data:image/png;base64,aW1hZ2UtYnl0ZXM=",
                "revised_prompt": "drawn",
            }],
        })

        with (
            mock.patch(
                "services.webdav_service.upload_generated_image_bytes",
                return_value={
                    "url": "https://cdn.example/YanAI/generated.png",
                    "synced_at": "2026-07-08 10:00:00",
                },
            ) as upload,
            mock.patch("services.protocol.conversation.save_image_bytes") as save_image,
        ):
            result = ChannelService._normalize_response(
                response,
                {
                    "prompt": "draw",
                    "response_format": "url",
                    "_image_storage_identity": {"id": "admin", "role": "admin"},
                },
            )

        upload.assert_called_once_with({"id": "admin", "role": "admin"}, b"image-bytes")
        save_image.assert_not_called()
        self.assertEqual(result["data"][0]["url"], "https://cdn.example/YanAI/generated.png")
        self.assertEqual(result["data"][0]["webdav_url"], "https://cdn.example/YanAI/generated.png")
        self.assertEqual(result["data"][0]["webdav_status"], "synced")
        self.assertNotIn("b64_json", result["data"][0])


if __name__ == "__main__":
    unittest.main()
