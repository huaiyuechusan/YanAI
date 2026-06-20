from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from services.protocol.conversation import (
    ConversationRequest,
    ImageGenerationError,
    assistant_message_text,
    iter_conversation_payloads,
    stream_image_outputs,
)


class ConversationTextParsingTests(unittest.TestCase):
    def test_assistant_message_text_reads_object_parts(self) -> None:
        message = {
            "author": {"role": "assistant"},
            "content": {
                "content_type": "text",
                "parts": [
                    {"type": "text", "text": "你好"},
                    {"content_type": "text", "text": "，有什么可以帮你？"},
                ],
            },
        }

        self.assertEqual(assistant_message_text(message), "你好，有什么可以帮你？")

    def test_iter_payloads_reads_nested_text_patch_path(self) -> None:
        payloads = iter([
            json.dumps({"p": "/message/content/parts/0/text", "o": "append", "v": "你"}, ensure_ascii=False),
            json.dumps({"p": "/message/content/parts/0/text", "o": "append", "v": "好"}, ensure_ascii=False),
            "[DONE]",
        ])

        events = list(iter_conversation_payloads(payloads))
        deltas = [event.get("delta") for event in events if event.get("type") == "conversation.delta"]

        self.assertEqual(deltas, ["你", "好"])

    def test_iter_payloads_reads_deep_text_patch_path(self) -> None:
        payloads = iter([
            json.dumps({"p": "/message/content/parts/0/content/text", "o": "append", "v": "深层文本"}, ensure_ascii=False),
            "[DONE]",
        ])

        events = list(iter_conversation_payloads(payloads))
        deltas = [event.get("delta") for event in events if event.get("type") == "conversation.delta"]

        self.assertEqual(deltas, ["深层文本"])

    def test_iter_payloads_reads_append_operation_without_path(self) -> None:
        payloads = iter([
            json.dumps({"o": "append", "v": "无路径文本"}, ensure_ascii=False),
            "[DONE]",
        ])

        events = list(iter_conversation_payloads(payloads))
        deltas = [event.get("delta") for event in events if event.get("type") == "conversation.delta"]

        self.assertEqual(deltas, ["无路径文本"])

    def test_iter_payloads_reads_message_carried_directly_in_v(self) -> None:
        payloads = iter([
            json.dumps({
                "v": {
                    "author": {"role": "assistant"},
                    "content": {"content_type": "text", "parts": [{"text": "可以正常输出"}]},
                },
            }, ensure_ascii=False),
            "[DONE]",
        ])

        events = list(iter_conversation_payloads(payloads))
        deltas = [event.get("delta") for event in events if event.get("type") == "conversation.delta"]

        self.assertEqual(deltas, ["可以正常输出"])

    def test_iter_payloads_ignores_image_tool_argument_text(self) -> None:
        payloads = iter([
            json.dumps({
                "v": json.dumps({
                    "prompt": None,
                    "size": "1024x1024",
                    "n": 1,
                    "referenced_image_ids": ["file_00000000000000000000000000000000"],
                })
            }),
            "[DONE]",
        ])

        events = list(iter_conversation_payloads(payloads))
        deltas = [event.get("delta") for event in events if event.get("type") == "conversation.delta"]

        self.assertEqual(deltas, [])

    def test_image_stream_polls_prepared_conversation_after_skipped_mainline(self) -> None:
        class FakeBackend:
            resolved_conversation_id = ""

            def stream_conversation(self, **kwargs):
                yield json.dumps({"type": "image_prepare", "conversation_id": "conv-prepared"})
                yield json.dumps({"skipped_mainline": True}, separators=(",", ":"))
                yield "[DONE]"

            def resolve_conversation_image_urls(self, conversation_id, file_ids, sediment_ids):
                self.resolved_conversation_id = conversation_id
                return ["https://example.test/generated.png"] if conversation_id == "conv-prepared" else []

            def download_image_bytes(self, urls):
                return [b"image-bytes"]

        backend = FakeBackend()
        with patch("services.protocol.conversation.save_image_bytes", return_value="http://local/images/generated.png"):
            outputs = list(stream_image_outputs(backend, ConversationRequest(prompt="draw", model="gpt-image-2")))

        results = [output for output in outputs if output.kind == "result"]
        self.assertEqual(backend.resolved_conversation_id, "conv-prepared")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].data[0]["b64_json"], "aW1hZ2UtYnl0ZXM=")

    def test_image_stream_polls_when_image_gen_reports_tool_not_invoked(self) -> None:
        class FakeBackend:
            resolved_conversation_id = ""

            def stream_conversation(self, **kwargs):
                yield json.dumps({"type": "image_prepare", "conversation_id": "conv-prepared"})
                yield json.dumps({
                    "v": {
                        "message": {
                            "author": {"role": "assistant"},
                            "content": {"content_type": "text", "parts": ["图片生成中"]},
                        },
                        "conversation_id": "conv-prepared",
                    }
                }, ensure_ascii=False)
                yield json.dumps({
                    "type": "server_ste_metadata",
                    "conversation_id": "conv-prepared",
                    "metadata": {"tool_invoked": False, "turn_use_case": "image gen"},
                })
                yield "[DONE]"

            def resolve_conversation_image_urls(self, conversation_id, file_ids, sediment_ids):
                self.resolved_conversation_id = conversation_id
                return ["https://example.test/generated.png"] if conversation_id == "conv-prepared" else []

            def download_image_bytes(self, urls):
                return [b"image-bytes"]

        backend = FakeBackend()
        with patch("services.protocol.conversation.save_image_bytes", return_value="http://local/images/generated.png"):
            outputs = list(stream_image_outputs(backend, ConversationRequest(prompt="draw", model="gpt-image-2")))

        results = [output for output in outputs if output.kind == "result"]
        self.assertEqual(backend.resolved_conversation_id, "conv-prepared")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].data[0]["b64_json"], "aW1hZ2UtYnl0ZXM=")

    def test_image_stream_times_out_without_result_or_message(self) -> None:
        class FakeBackend:
            def stream_conversation(self, **kwargs):
                yield json.dumps({"type": "image_prepare", "conversation_id": "conv-prepared"})
                yield json.dumps({
                    "v": json.dumps({
                        "prompt": None,
                        "size": "1024x1024",
                        "n": 1,
                        "referenced_image_ids": ["file_00000000000000000000000000000000"],
                    })
                })
                yield "[DONE]"

            def resolve_conversation_image_urls(self, conversation_id, file_ids, sediment_ids):
                return []

        with self.assertRaises(ImageGenerationError) as raised:
            list(stream_image_outputs(FakeBackend(), ConversationRequest(prompt="draw", model="gpt-image-2")))

        self.assertEqual(raised.exception.code, "image_generation_timeout")


if __name__ == "__main__":
    unittest.main()
