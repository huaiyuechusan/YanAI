from __future__ import annotations

from typing import Any

from services.protocol.conversation import count_message_tokens, count_text_tokens


def _non_negative_int(value: object) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def openai_usage(
    prompt_tokens: int,
    completion_tokens: int,
    *,
    cached_tokens: int = 0,
    image_tokens: int = 0,
    source: str = "local_estimate",
) -> dict[str, Any]:
    prompt = _non_negative_int(prompt_tokens)
    completion = _non_negative_int(completion_tokens)
    cached = min(_non_negative_int(cached_tokens), prompt)
    image = min(_non_negative_int(image_tokens), prompt)
    text_input = max(0, prompt - image)
    total = prompt + completion
    input_details = {
        "cached_tokens": cached,
        "text_tokens": text_input,
        "audio_tokens": 0,
        "image_tokens": image,
    }
    output_details = {
        "text_tokens": completion,
        "audio_tokens": 0,
        "image_tokens": 0,
        "reasoning_tokens": 0,
    }
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": total,
        "prompt_tokens_details": dict(input_details),
        "completion_tokens_details": dict(output_details),
        "input_tokens": prompt,
        "output_tokens": completion,
        "input_tokens_details": dict(input_details),
        "output_tokens_details": dict(output_details),
        "usage_source": source,
    }


def estimate_chat_usage(messages: list[dict[str, Any]], output_text: str, model: str) -> dict[str, Any]:
    return openai_usage(
        count_message_tokens(messages, model) if messages else 0,
        count_text_tokens(output_text, model) if output_text else 0,
    )


def estimate_text_usage(input_text: str, output_text: str, model: str) -> dict[str, Any]:
    return openai_usage(
        count_text_tokens(input_text, model) if input_text else 0,
        count_text_tokens(output_text, model) if output_text else 0,
    )
