from __future__ import annotations

import unittest

from services.protocol import openai_v1_chat_complete, openai_v1_response
from services.protocol.conversation import ImageOutput
from services.protocol.usage import openai_usage


class UsageMetadataTest(unittest.TestCase):
    def assert_new_api_usage(self, usage: dict[str, object]) -> None:
        self.assertGreater(int(usage.get("input_tokens") or 0), 0)
        self.assertIn("output_tokens", usage)
        self.assertEqual(
            int(usage.get("total_tokens") or 0),
            int(usage.get("input_tokens") or 0) + int(usage.get("output_tokens") or 0),
        )
        self.assertEqual(usage.get("prompt_tokens"), usage.get("input_tokens"))
        self.assertEqual(usage.get("completion_tokens"), usage.get("output_tokens"))
        self.assertIsInstance(usage.get("input_tokens_details"), dict)

    def test_openai_usage_exposes_chat_and_responses_token_fields(self) -> None:
        usage = openai_usage(12, 5)

        self.assertEqual(usage["prompt_tokens"], 12)
        self.assertEqual(usage["completion_tokens"], 5)
        self.assertEqual(usage["input_tokens"], 12)
        self.assertEqual(usage["output_tokens"], 5)
        self.assertEqual(usage["total_tokens"], 17)
        self.assertEqual(usage["usage_source"], "local_estimate")

    def test_chat_completion_response_includes_billable_usage(self) -> None:
        payload = openai_v1_chat_complete.completion_response(
            "gpt-5-5",
            "hello",
            messages=[{"role": "user", "content": "hi"}],
        )

        self.assert_new_api_usage(payload["usage"])
        self.assertGreater(int(payload["usage"]["output_tokens"]), 0)

    def test_responses_text_stream_completed_event_includes_usage(self) -> None:
        original = openai_v1_response.stream_text_deltas
        openai_v1_response.stream_text_deltas = lambda backend, request: iter(["hello"])
        try:
            events = list(openai_v1_response.stream_text_response(
                object(),
                {"model": "gpt-5-5", "input": "hi"},
            ))
        finally:
            openai_v1_response.stream_text_deltas = original

        completed = next(event for event in events if event.get("type") == "response.completed")
        usage = completed["response"]["usage"]
        self.assert_new_api_usage(usage)
        self.assertGreater(int(usage["output_tokens"]), 0)

    def test_responses_image_call_includes_input_usage_and_tool_shape(self) -> None:
        events = list(openai_v1_response.stream_image_response(
            [
                ImageOutput(
                    kind="result",
                    model="gpt-5-5",
                    index=1,
                    total=1,
                    data=[{"b64_json": "aGVsbG8="}],
                )
            ],
            "draw a poster",
            "gpt-5-5",
        ))

        completed = next(event for event in events if event.get("type") == "response.completed")
        response = completed["response"]
        usage = response["usage"]
        item = response["output"][0]

        self.assert_new_api_usage(usage)
        self.assertEqual(usage["output_tokens"], 0)
        self.assertEqual(item["type"], "image_generation_call")
        self.assertEqual(item["quality"], "high")
        self.assertEqual(item["size"], "1024x1024")


if __name__ == "__main__":
    unittest.main()
