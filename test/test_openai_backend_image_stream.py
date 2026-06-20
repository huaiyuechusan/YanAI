from __future__ import annotations

import json
import unittest

from services.openai_backend_api import ChatRequirements, OpenAIBackendAPI


class OpenAIBackendImageStreamTests(unittest.TestCase):
    def test_picture_stream_emits_prepared_conversation_id(self) -> None:
        class FakeResponse:
            closed = False

            def iter_lines(self):
                yield b'data: {"skipped_mainline":true}'
                yield b"data: [DONE]"

            def close(self) -> None:
                self.closed = True

        backend = OpenAIBackendAPI(access_token="test-token")
        response = FakeResponse()
        backend._bootstrap = lambda: None
        backend._get_chat_requirements = lambda: ChatRequirements(token="requirements-token")
        backend._prepare_image_conversation = lambda prompt, requirements, model: ("conduit-token", "conv-prepared")
        backend._start_image_generation = lambda prompt, requirements, conduit_token, model, references: response

        payloads = list(backend._stream_picture_conversation("draw", "gpt-image-2", []))

        self.assertEqual(json.loads(payloads[0])["conversation_id"], "conv-prepared")
        self.assertEqual(payloads[1], '{"skipped_mainline":true}')
        self.assertEqual(payloads[2], "[DONE]")
        self.assertTrue(response.closed)


if __name__ == "__main__":
    unittest.main()
