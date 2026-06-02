from __future__ import annotations

from typing import Any

from services.openai_backend_api import OpenAIBackendAPI
from utils.model_catalog import DEFAULT_INTERNAL_MODELS


def list_models() -> dict[str, Any]:
    result = OpenAIBackendAPI().list_models()
    data = result.get("data")
    if not isinstance(data, list):
        return result
    seen = {str(item.get("id") or "").strip() for item in data if isinstance(item, dict)}
    for model in DEFAULT_INTERNAL_MODELS:
        if model not in seen:
            data.append({
                "id": model,
                "object": "model",
                "created": 0,
                "owned_by": "chatgpt2api",
                "permission": [],
                "root": model,
                "parent": None,
            })
    return result
