from __future__ import annotations

import base64
import random
import uuid
from datetime import datetime, timezone
from threading import RLock
from typing import Any

from curl_cffi.requests import Session

from services.config import config
from services.protocol.conversation import format_image_result
from services.storage.base import StorageBackend


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(value: object) -> str:
    return str(value or "").strip()


def _normalize_models(value: object) -> list[str]:
    if isinstance(value, list):
        return [_clean(item) for item in value if _clean(item)]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return ["gpt-image-1", "gpt-image-2"]


class ChannelService:
    def __init__(self, storage: StorageBackend):
        self.storage = storage
        self._lock = RLock()
        self._channels = self._load()

    def _normalize(self, raw: object) -> dict[str, object] | None:
        if not isinstance(raw, dict):
            return None
        channel_id = _clean(raw.get("id")) or uuid.uuid4().hex[:12]
        name = _clean(raw.get("name")) or "OpenAI 图片渠道"
        channel_type = _clean(raw.get("type")) or "openai_image"
        if channel_type != "openai_image":
            channel_type = "openai_image"
        base_url = _clean(raw.get("base_url")).rstrip("/")
        api_key = _clean(raw.get("api_key"))
        try:
            weight = max(1, int(raw.get("weight") or 1))
        except (TypeError, ValueError):
            weight = 1
        try:
            priority = int(raw.get("priority") or 0)
        except (TypeError, ValueError):
            priority = 0
        try:
            timeout = max(5, int(raw.get("timeout") or 60))
        except (TypeError, ValueError):
            timeout = 60
        return {
            "id": channel_id,
            "name": name,
            "type": channel_type,
            "base_url": base_url,
            "api_key": api_key,
            "models": _normalize_models(raw.get("models")),
            "weight": weight,
            "priority": priority,
            "timeout": timeout,
            "enabled": bool(raw.get("enabled", True)),
            "created_at": _clean(raw.get("created_at")) or _now_iso(),
            "updated_at": _clean(raw.get("updated_at")) or _now_iso(),
        }

    def _load(self) -> list[dict[str, object]]:
        try:
            items = self.storage.load_channels()
        except Exception:
            return []
        if not isinstance(items, list):
            return []
        return [normalized for item in items if (normalized := self._normalize(item)) is not None]

    def _save(self) -> None:
        self.storage.save_channels(self._channels)

    @staticmethod
    def _public(channel: dict[str, object]) -> dict[str, object]:
        return {
            "id": channel.get("id"),
            "name": channel.get("name"),
            "type": channel.get("type"),
            "base_url": channel.get("base_url"),
            "models": channel.get("models"),
            "weight": channel.get("weight"),
            "priority": channel.get("priority"),
            "timeout": channel.get("timeout"),
            "enabled": bool(channel.get("enabled", True)),
            "has_api_key": bool(_clean(channel.get("api_key"))),
            "created_at": channel.get("created_at"),
            "updated_at": channel.get("updated_at"),
        }

    def list_channels(self, include_internal: bool = True) -> list[dict[str, object]]:
        with self._lock:
            items = [self._public(channel) for channel in self._channels]
        items.sort(key=lambda item: (int(item.get("priority") or 0), int(item.get("weight") or 0)), reverse=True)
        if include_internal:
            return [
                {
                    "id": "internal_pool",
                    "name": "内置账号池",
                    "type": "internal_pool",
                    "base_url": "",
                    "models": ["gpt-image-2", "codex-gpt-image-2"],
                    "weight": 1,
                    "priority": -1000,
                    "timeout": 0,
                    "enabled": True,
                    "has_api_key": False,
                    "created_at": None,
                    "updated_at": None,
                },
                *items,
            ]
        return items

    def create_channel(self, data: dict[str, object]) -> dict[str, object]:
        channel = self._normalize({**data, "id": uuid.uuid4().hex[:12], "created_at": _now_iso(), "updated_at": _now_iso()})
        if channel is None:
            raise ValueError("channel payload is invalid")
        if not _clean(channel.get("base_url")):
            raise ValueError("base_url is required")
        if not _clean(channel.get("api_key")):
            raise ValueError("api_key is required")
        with self._lock:
            self._channels.append(channel)
            self._save()
            return self._public(channel)

    def update_channel(self, channel_id: str, updates: dict[str, object]) -> dict[str, object] | None:
        normalized_id = _clean(channel_id)
        with self._lock:
            for index, channel in enumerate(self._channels):
                if channel.get("id") != normalized_id:
                    continue
                merged = {**channel, **{key: value for key, value in updates.items() if value is not None}}
                merged["id"] = normalized_id
                merged["updated_at"] = _now_iso()
                normalized = self._normalize(merged)
                if normalized is None:
                    return None
                self._channels[index] = normalized
                self._save()
                return self._public(normalized)
        return None

    def delete_channel(self, channel_id: str) -> bool:
        normalized_id = _clean(channel_id)
        with self._lock:
            before = len(self._channels)
            self._channels = [channel for channel in self._channels if channel.get("id") != normalized_id]
            if len(self._channels) == before:
                return False
            self._save()
            return True

    def _enabled_external_channels(self, model: str | None = None) -> list[dict[str, object]]:
        with self._lock:
            channels = [dict(channel) for channel in self._channels if bool(channel.get("enabled", True))]
        if model:
            channels = [
                channel
                for channel in channels
                if not channel.get("models") or model in (channel.get("models") or [])
            ]
        weighted: list[dict[str, object]] = []
        for channel in sorted(channels, key=lambda item: int(item.get("priority") or 0), reverse=True):
            weighted.extend([channel] * max(1, int(channel.get("weight") or 1)))
        random.shuffle(weighted)
        return weighted

    def has_external_channels(self, model: str | None = None) -> bool:
        return bool(self._enabled_external_channels(model))

    def call_generation(self, payload: dict[str, Any]) -> tuple[dict[str, Any], str] | None:
        model = _clean(payload.get("model")) or "gpt-image-2"
        last_error = ""
        for channel in self._enabled_external_channels(model):
            try:
                return self._call_generation(channel, payload), str(channel.get("name") or channel.get("id"))
            except Exception as exc:
                last_error = str(exc)
                print(f"[channel] generation failed channel={channel.get('name')} error={last_error}")
        if last_error:
            print(f"[channel] all external generation channels failed: {last_error}")
        return None

    def call_edit(self, payload: dict[str, Any]) -> tuple[dict[str, Any], str] | None:
        model = _clean(payload.get("model")) or "gpt-image-2"
        last_error = ""
        for channel in self._enabled_external_channels(model):
            try:
                return self._call_edit(channel, payload), str(channel.get("name") or channel.get("id"))
            except Exception as exc:
                last_error = str(exc)
                print(f"[channel] edit failed channel={channel.get('name')} error={last_error}")
        if last_error:
            print(f"[channel] all external edit channels failed: {last_error}")
        return None

    def _call_generation(self, channel: dict[str, object], payload: dict[str, Any]) -> dict[str, Any]:
        body = {
            key: value
            for key, value in payload.items()
            if key in {"prompt", "model", "n", "size", "response_format"} and value is not None
        }
        if "model" not in body:
            body["model"] = (channel.get("models") or ["gpt-image-1"])[0]
        response = self._session(channel).post(
            f"{_clean(channel.get('base_url')).rstrip('/')}/v1/images/generations",
            json=body,
            timeout=int(channel.get("timeout") or 60),
        )
        return self._normalize_response(response, payload)

    def _call_edit(self, channel: dict[str, object], payload: dict[str, Any]) -> dict[str, Any]:
        form_data = {
            "prompt": _clean(payload.get("prompt")),
            "model": _clean(payload.get("model")) or (channel.get("models") or ["gpt-image-1"])[0],
            "n": str(int(payload.get("n") or 1)),
            "response_format": _clean(payload.get("response_format")) or "b64_json",
        }
        if payload.get("size"):
            form_data["size"] = _clean(payload.get("size"))
        files = []
        for index, image in enumerate(payload.get("images") or []):
            if not isinstance(image, tuple) or len(image) != 3:
                continue
            data, filename, content_type = image
            files.append(("image", (filename or f"image-{index}.png", data, content_type or "image/png")))
        response = self._session(channel).post(
            f"{_clean(channel.get('base_url')).rstrip('/')}/v1/images/edits",
            data=form_data,
            files=files,
            timeout=int(channel.get("timeout") or 60),
        )
        return self._normalize_response(response, payload)

    def _session(self, channel: dict[str, object]) -> Session:
        session = Session(verify=True)
        session.headers.update({
            "Authorization": f"Bearer {_clean(channel.get('api_key'))}",
            "Accept": "application/json",
        })
        return session

    @staticmethod
    def _normalize_response(response, original_payload: dict[str, Any]) -> dict[str, Any]:
        if not response.ok:
            raise RuntimeError(f"HTTP {response.status_code}: {response.text[:300]}")
        payload = response.json()
        if not isinstance(payload, dict):
            raise RuntimeError("channel response is invalid")
        data = payload.get("data")
        if not isinstance(data, list):
            raise RuntimeError("channel response missing data")
        b64_items = [item for item in data if isinstance(item, dict) and item.get("b64_json")]
        url_items = [item for item in data if isinstance(item, dict) and item.get("url") and not item.get("b64_json")]
        if b64_items:
            result = format_image_result(
                b64_items,
                _clean(original_payload.get("prompt")),
                _clean(original_payload.get("response_format")) or "b64_json",
                _clean(original_payload.get("base_url")) or None,
            )
            if url_items:
                result["data"].extend(url_items)
            return result
        normalized = {"created": int(payload.get("created") or datetime.now().timestamp()), "data": url_items}
        if not normalized["data"]:
            # Some compatible servers return a raw base64 string in `data`.
            for item in data:
                if isinstance(item, str):
                    normalized["data"].append({
                        "b64_json": item,
                        "url": format_image_result(
                            [{"b64_json": item}],
                            _clean(original_payload.get("prompt")),
                            "b64_json",
                            _clean(original_payload.get("base_url")) or None,
                        )["data"][0]["url"],
                    })
        return normalized


channel_service = ChannelService(config.get_storage_backend())
