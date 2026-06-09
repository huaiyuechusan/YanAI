from __future__ import annotations

import base64
import random
import time
import uuid
from datetime import datetime, timezone
from threading import RLock
from typing import Any

from curl_cffi import CurlMime
from curl_cffi.requests import Session

from services.config import config
from services.proxy_service import proxy_settings
from services.repositories.base import RepositoryProvider
from services.repositories.storage_adapter import RepositoryStorageAdapter
from services.storage.base import StorageBackend
from utils.model_catalog import DEFAULT_INTERNAL_MODELS

INTERNAL_POOL_ENABLED_KEY = "internal_pool_enabled"
PERSONAL_CHANNEL_ID_PREFIX = "personal_image_channel"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(value: object) -> str:
    return str(value or "").strip()


def _bool(value: object, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on", "enabled"}
    return bool(value)


def _normalize_models(value: object) -> list[str]:
    if isinstance(value, list):
        return [_clean(item) for item in value if _clean(item)]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return ["gpt-image-1", "gpt-image-2"]


def _requested_models(value: object) -> list[str]:
    if isinstance(value, list):
        candidates = value
    elif isinstance(value, str):
        candidates = value.replace(";", ",").split(",")
    else:
        candidates = []
    seen: set[str] = set()
    result: list[str] = []
    for item in candidates:
        model = _clean(item)
        if model and model not in seen:
            seen.add(model)
            result.append(model)
    return result


EXTERNAL_IMAGE_MODEL_ALIASES = {
    "gpt-image-2": ["codex-gpt-image-2"],
}

EXTERNAL_IMAGE_RATIO_SIZE_ALIASES = {
    "1:1": "1024x1024",
    "16:9": "1536x1024",
    "4:3": "1536x1024",
    "9:16": "1024x1536",
    "3:4": "1024x1536",
}

EXTERNAL_IMAGE_RATIO_PROMPT_HINTS = {
    "1:1": "输出为 1:1 正方形构图，主体居中，适合正方形画幅。",
    "16:9": "输出为 16:9 横屏构图，适合宽画幅展示。",
    "9:16": "输出为 9:16 竖屏构图，适合竖版画幅展示。",
    "4:3": "输出为 4:3 比例，兼顾宽度与高度，适合展示画面细节。",
    "3:4": "输出为 3:4 比例，纵向构图，适合人物肖像或竖向场景。",
}


def _dedupe_models(models: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in models:
        model = _clean(item)
        if not model or model in seen:
            continue
        seen.add(model)
        result.append(model)
    return result


def _is_explicit_image_size(value: str) -> bool:
    width, separator, height = value.lower().partition("x")
    return bool(separator and width.isdigit() and height.isdigit())


def _normalize_external_image_request(prompt: object, size: object) -> tuple[str | None, str | None]:
    normalized_prompt = _clean(prompt) or None
    normalized_size = _clean(size)
    if not normalized_size:
        return normalized_prompt, None
    if _is_explicit_image_size(normalized_size) or normalized_size.lower() == "auto":
        return normalized_prompt, normalized_size.lower()
    mapped_size = EXTERNAL_IMAGE_RATIO_SIZE_ALIASES.get(normalized_size)
    if mapped_size:
        hint = EXTERNAL_IMAGE_RATIO_PROMPT_HINTS.get(normalized_size)
        if hint and normalized_prompt:
            normalized_prompt = f"{normalized_prompt}\n\n{hint}"
        return normalized_prompt, mapped_size
    return normalized_prompt, normalized_size


def _response_preview(response, limit: int = 300) -> str:
    text = _clean(getattr(response, "text", ""))
    if text:
        return text[:limit]
    return ""


def _friendly_channel_error(error: object) -> str:
    message = _clean(error)
    normalized = message.lower()
    if "curl: (35)" in normalized or "connection was reset" in normalized or "recv failure" in normalized:
        return (
            "连接被上游重置（curl 35）。请检查个人渠道 Base URL 是否正确、API Key 是否有效、"
            "该渠道是否允许当前网络访问；如果系统设置里配置了代理，也请确认代理可用。"
        )
    if "curl: (28)" in normalized or "timed out" in normalized or "timeout" in normalized:
        return "连接个人渠道超时。请检查渠道地址、代理或把个人渠道超时秒数调大后重试。"
    if "proxy" in normalized and ("connect" in normalized or "failed" in normalized or "refused" in normalized):
        return "代理连接失败。请检查系统设置里的代理地址是否可用，或暂时清空代理后重试个人渠道。"
    return message


class ChannelService:
    def __init__(self, storage: StorageBackend | RepositoryProvider, config_store=None):
        self.repositories = storage if isinstance(storage, RepositoryProvider) else None
        self.storage = RepositoryStorageAdapter(storage) if isinstance(storage, RepositoryProvider) else storage
        self.config_store = config_store or config
        self._lock = RLock()
        self._channels = self._load()
        self._enabled_cache: tuple[float, list[dict[str, object]]] | None = None

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

    def _invalidate_cache(self) -> None:
        self._enabled_cache = None

    def _current_channels(self, *, cache_enabled: bool = False) -> list[dict[str, object]]:
        if self.repositories is None:
            return [dict(channel) for channel in self._channels]
        if cache_enabled and self._enabled_cache is not None:
            expires_at, channels = self._enabled_cache
            if expires_at > time.monotonic():
                return [dict(channel) for channel in channels]
        channels = self._load()
        if cache_enabled:
            self._enabled_cache = (time.monotonic() + 2.0, [dict(channel) for channel in channels])
        else:
            self._channels = [dict(channel) for channel in channels]
        return [dict(channel) for channel in channels]

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

    def is_internal_pool_enabled(self) -> bool:
        return _bool(self.config_store.get().get(INTERNAL_POOL_ENABLED_KEY), True)

    def _image_model_mappings(self) -> dict[str, str]:
        defaults = {
            "gpt-image-2": "gpt-5-5",
            "codex-gpt-image-2": "codex-gpt-image-2",
        }
        raw = getattr(self.config_store, "image_model_mappings", None)
        if raw is None:
            raw = self.config_store.get().get("image_model_mappings")
        if not isinstance(raw, dict):
            return defaults
        mappings = dict(defaults)
        for key, value in raw.items():
            source_model = _clean(key)
            target_model = _clean(value)
            if source_model and target_model:
                mappings[source_model] = target_model
        return mappings

    def _external_model_candidates(self, model: str | None) -> list[str]:
        requested = _clean(model)
        if not requested:
            return []
        mapped = _clean(self._image_model_mappings().get(requested))
        return _dedupe_models([requested, *EXTERNAL_IMAGE_MODEL_ALIASES.get(requested, []), mapped])

    def _resolve_external_model_for_channel(
            self,
            channel: dict[str, object],
            model: str | None,
    ) -> str:
        candidates = self._external_model_candidates(model)
        channel_models = _normalize_models(channel.get("models"))
        if not candidates:
            return channel_models[0] if channel_models else ""
        if not channel_models:
            return candidates[0]
        for candidate in candidates:
            if candidate in channel_models:
                return candidate
        return ""

    def _internal_channel(self) -> dict[str, object]:
        return {
            "id": "internal_pool",
            "name": "内置账号池",
            "type": "internal_pool",
            "base_url": "",
            "models": list(DEFAULT_INTERNAL_MODELS),
            "weight": 1,
            "priority": -1000,
            "timeout": 0,
            "enabled": self.is_internal_pool_enabled(),
            "has_api_key": False,
            "created_at": None,
            "updated_at": None,
        }

    def _normalize_personal_channel(
            self,
            raw: object,
            *,
            owner_user_id: str = "",
            require_enabled: bool = True,
    ) -> dict[str, object] | None:
        if not isinstance(raw, dict):
            return None
        if require_enabled and not _bool(raw.get("enabled"), False):
            return None
        channel = self._normalize({
            **raw,
            "id": f"{PERSONAL_CHANNEL_ID_PREFIX}:{_clean(owner_user_id) or 'current'}",
            "name": _clean(raw.get("name")) or "个人生图渠道",
            "type": "openai_image",
            "weight": 1,
            "priority": 100000,
            "enabled": _bool(raw.get("enabled"), True),
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        })
        if channel is None:
            return None
        if not _clean(channel.get("base_url")) or not _clean(channel.get("api_key")):
            return None
        channel["_personal_channel"] = True
        channel["_owner_user_id"] = _clean(owner_user_id)
        return channel

    def _enabled_personal_and_external_channels(
            self,
            model: str | None,
            personal_channel: object = None,
            *,
            owner_user_id: str = "",
    ) -> list[dict[str, object]]:
        channels: list[dict[str, object]] = []
        if isinstance(personal_channel, dict) and _bool(personal_channel.get("enabled"), False):
            personal = self._normalize_personal_channel(
                personal_channel,
                owner_user_id=owner_user_id,
                require_enabled=True,
            )
            if personal is None:
                return []
            if self._resolve_external_model_for_channel(personal, model):
                return [personal]
            return []
        personal = self._normalize_personal_channel(
            personal_channel,
            owner_user_id=owner_user_id,
            require_enabled=True,
        )
        if personal is not None and self._resolve_external_model_for_channel(personal, model):
            channels.append(personal)
        channels.extend(self._enabled_external_channels(model))
        return channels

    def _personal_channel_error(
            self,
            model: str | None,
            personal_channel: object = None,
            *,
            owner_user_id: str = "",
    ) -> str:
        if not isinstance(personal_channel, dict) or not _bool(personal_channel.get("enabled"), False):
            return ""
        personal = self._normalize_personal_channel(
            personal_channel,
            owner_user_id=owner_user_id,
            require_enabled=True,
        )
        if personal is None:
            return "personal image channel is enabled but base_url and api_key are required"
        if not self._resolve_external_model_for_channel(personal, model):
            requested = _clean(model) or "default"
            return f"personal image channel does not support requested model: {requested}"
        return ""

    def has_usable_personal_channel(
            self,
            model: str | None,
            personal_channel: object = None,
            *,
            owner_user_id: str = "",
    ) -> bool:
        if not isinstance(personal_channel, dict) or not _bool(personal_channel.get("enabled"), False):
            return False
        return not self._personal_channel_error(
            model,
            personal_channel,
            owner_user_id=owner_user_id,
        )

    @staticmethod
    def _mark_personal_channel_error(payload: dict[str, Any], error: str) -> None:
        payload["_personal_channel_error"] = error
        payload["_channel_error"] = error

    @staticmethod
    def _channel_result_name(channel: dict[str, object]) -> str:
        name = str(channel.get("name") or channel.get("id") or "").strip()
        if channel.get("_personal_channel"):
            return f"个人渠道/{name or 'personal'}"
        return name or "external_channel"

    def list_channels(self, include_internal: bool = True) -> list[dict[str, object]]:
        with self._lock:
            channels = self._current_channels()
            items = [self._public(channel) for channel in channels]
        items.sort(key=lambda item: (int(item.get("priority") or 0), int(item.get("weight") or 0)), reverse=True)
        if include_internal:
            return [self._internal_channel(), *items]
        return items

    def get_channel(self, channel_id: str, *, include_internal: bool = True) -> dict[str, object] | None:
        normalized_id = _clean(channel_id)
        if include_internal and normalized_id == "internal_pool":
            return self._internal_channel()
        with self._lock:
            for channel in self._current_channels():
                if channel.get("id") == normalized_id:
                    return self._public(channel)
        return None

    def create_channel(self, data: dict[str, object]) -> dict[str, object]:
        channel = self._normalize({**data, "id": uuid.uuid4().hex[:12], "created_at": _now_iso(), "updated_at": _now_iso()})
        if channel is None:
            raise ValueError("channel payload is invalid")
        if not _clean(channel.get("base_url")):
            raise ValueError("base_url is required")
        if not _clean(channel.get("api_key")):
            raise ValueError("api_key is required")
        with self._lock:
            if self.repositories is not None:
                self.repositories.channels.upsert(dict(channel))
                self._channels = self._load()
            else:
                self._channels.append(channel)
                self._save()
            self._invalidate_cache()
            return self._public(channel)

    def update_channel(self, channel_id: str, updates: dict[str, object]) -> dict[str, object] | None:
        normalized_id = _clean(channel_id)
        if normalized_id == "internal_pool":
            if "enabled" in updates:
                self.config_store.update({INTERNAL_POOL_ENABLED_KEY: _bool(updates.get("enabled"), True)})
            self._invalidate_cache()
            return self._internal_channel()
        with self._lock:
            channels = self._current_channels()
            for index, channel in enumerate(channels):
                if channel.get("id") != normalized_id:
                    continue
                merged = {**channel, **{key: value for key, value in updates.items() if value is not None}}
                merged["id"] = normalized_id
                merged["updated_at"] = _now_iso()
                normalized = self._normalize(merged)
                if normalized is None:
                    return None
                if self.repositories is not None:
                    self.repositories.channels.upsert(dict(normalized))
                    self._channels = self._load()
                else:
                    self._channels[index] = normalized
                    self._save()
                self._invalidate_cache()
                return self._public(normalized)
        return None

    def delete_channel(self, channel_id: str) -> bool:
        normalized_id = _clean(channel_id)
        with self._lock:
            if self.repositories is not None:
                removed = self.repositories.channels.delete(normalized_id)
                if removed:
                    self._channels = self._load()
                    self._invalidate_cache()
                return removed
            before = len(self._channels)
            self._channels = [channel for channel in self._channels if channel.get("id") != normalized_id]
            if len(self._channels) == before:
                return False
            self._save()
            self._invalidate_cache()
            return True

    @staticmethod
    def extract_model_ids(payload: object) -> list[str]:
        if isinstance(payload, dict):
            candidates = payload.get("data")
            if not isinstance(candidates, list):
                candidates = payload.get("models")
            if not isinstance(candidates, list):
                candidates = payload.get("items")
        else:
            candidates = payload
        if not isinstance(candidates, list):
            return []

        seen: set[str] = set()
        models: list[str] = []
        for item in candidates:
            if isinstance(item, str):
                model = _clean(item)
            elif isinstance(item, dict):
                model = _clean(item.get("id") or item.get("model") or item.get("name") or item.get("slug"))
            else:
                model = ""
            if not model or model in seen:
                continue
            seen.add(model)
            models.append(model)
        return models

    def _fetch_internal_channel_models(self, *, allow_default_fallback: bool) -> list[str]:
        try:
            from services.protocol.openai_v1_models import list_models

            models = self.extract_model_ids(list_models())
        except Exception:
            if not allow_default_fallback:
                raise
            models = []
        if allow_default_fallback:
            merged = self.extract_model_ids([*models, *DEFAULT_INTERNAL_MODELS])
            return merged or list(DEFAULT_INTERNAL_MODELS)
        if not models:
            raise RuntimeError("internal model response contains no models")
        return models

    def _find_external_channel(self, channel_id: str) -> dict[str, object] | None:
        with self._lock:
            return next((dict(item) for item in self._current_channels() if item.get("id") == channel_id), None)

    def _fetch_external_channel_models(self, channel: dict[str, object]) -> list[str]:
        url = self._openai_compatible_url(channel, "/v1/models")
        response = self._session(channel).get(
            url,
            timeout=int(channel.get("timeout") or 60),
        )
        if not response.ok:
            detail = _response_preview(response)
            suffix = f"：{detail}" if detail else ""
            if int(response.status_code) in {404, 405}:
                raise RuntimeError(
                    f"渠道模型列表接口不可用：GET /v1/models 返回 HTTP {response.status_code}{suffix}。"
                    "该渠道可能不支持模型列表接口；可保存渠道后直接生图，或更换支持 /v1/models 的 OpenAI 兼容地址。"
                )
            raise RuntimeError(f"模型列表请求失败：HTTP {response.status_code}{suffix}")
        try:
            payload = response.json()
        except Exception as exc:
            raise RuntimeError("channel model response is invalid") from exc
        models = self.extract_model_ids(payload)
        if not models:
            raise RuntimeError("channel model response contains no models")
        return models

    def fetch_channel_models(self, channel_id: str) -> list[str] | None:
        normalized_id = _clean(channel_id)
        if normalized_id == "internal_pool":
            return self._fetch_internal_channel_models(allow_default_fallback=True)
        channel = self._find_external_channel(normalized_id)
        if channel is None:
            return None
        return self._fetch_external_channel_models(channel)

    def test_channel_models(self, channel_id: str, models: object = None) -> dict[str, object] | None:
        normalized_id = _clean(channel_id)
        requested_models = _requested_models(models)
        started_at = time.monotonic()
        channel = self._internal_channel() if normalized_id == "internal_pool" else self._find_external_channel(normalized_id)
        if channel is None:
            return None
        try:
            if normalized_id == "internal_pool":
                models = self._fetch_internal_channel_models(allow_default_fallback=False)
            else:
                models = self._fetch_external_channel_models(channel)
            model_set = set(models)
            tested_models = requested_models or models
            missing_models = [
                model
                for model in requested_models
                if not any(candidate in model_set for candidate in self._external_model_candidates(model))
            ]
            ok = not missing_models
            return {
                "ok": ok,
                "channel": self._internal_channel() if normalized_id == "internal_pool" else self._public(channel),
                "models": models,
                "model_count": len(models),
                "tested_models": tested_models,
                "missing_models": missing_models,
                "latency_ms": int((time.monotonic() - started_at) * 1000),
                "error": "" if ok else f"models unavailable: {', '.join(missing_models)}",
            }
        except Exception as exc:
            return {
                "ok": False,
                "channel": self._internal_channel() if normalized_id == "internal_pool" else self._public(channel),
                "models": [],
                "model_count": 0,
                "tested_models": requested_models,
                "missing_models": requested_models,
                "latency_ms": int((time.monotonic() - started_at) * 1000),
                "error": str(exc),
            }

    def test_personal_channel_models(
            self,
            channel_config: object,
            models: object = None,
            *,
            owner_user_id: str = "",
    ) -> dict[str, object]:
        requested_models = _requested_models(models)
        started_at = time.monotonic()
        channel = self._normalize_personal_channel(
            channel_config,
            owner_user_id=owner_user_id,
            require_enabled=False,
        )
        if channel is None:
            return {
                "ok": False,
                "channel": {
                    "id": f"{PERSONAL_CHANNEL_ID_PREFIX}:{_clean(owner_user_id) or 'current'}",
                    "name": "个人生图渠道",
                    "type": "openai_image",
                    "base_url": "",
                    "models": [],
                    "weight": 1,
                    "priority": 0,
                    "timeout": 60,
                    "enabled": False,
                    "has_api_key": False,
                    "created_at": None,
                    "updated_at": None,
                },
                "models": [],
                "model_count": 0,
                "tested_models": requested_models,
                "missing_models": requested_models,
                "latency_ms": int((time.monotonic() - started_at) * 1000),
                "error": "personal image channel base_url and api_key are required",
            }
        try:
            models = self._fetch_external_channel_models(channel)
            model_set = set(models)
            tested_models = requested_models or models
            missing_models = [
                model
                for model in requested_models
                if not any(candidate in model_set for candidate in self._external_model_candidates(model))
            ]
            ok = not missing_models
            return {
                "ok": ok,
                "channel": self._public(channel),
                "models": models,
                "model_count": len(models),
                "tested_models": tested_models,
                "missing_models": missing_models,
                "latency_ms": int((time.monotonic() - started_at) * 1000),
                "error": "" if ok else f"models unavailable: {', '.join(missing_models)}",
            }
        except Exception as exc:
            return {
                "ok": False,
                "channel": self._public(channel),
                "models": [],
                "model_count": 0,
                "tested_models": requested_models,
                "missing_models": requested_models,
                "latency_ms": int((time.monotonic() - started_at) * 1000),
                "error": str(exc),
            }

    def refresh_channel_models(self, channel_id: str) -> dict[str, object] | None:
        normalized_id = _clean(channel_id)
        models = self.fetch_channel_models(normalized_id)
        if models is None:
            return None
        if normalized_id == "internal_pool":
            return {"channel": self._internal_channel(), "models": models}
        item = self.update_channel(normalized_id, {"models": models})
        if item is None:
            return None
        return {"channel": item, "models": models}

    def _enabled_external_channels(self, model: str | None = None) -> list[dict[str, object]]:
        with self._lock:
            channels = [
                dict(channel)
                for channel in self._current_channels(cache_enabled=True)
                if bool(channel.get("enabled", True))
            ]
        if model:
            channels = [
                channel
                for channel in channels
                if self._resolve_external_model_for_channel(channel, model)
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
        errors: list[str] = []
        personal_error = self._personal_channel_error(
            model,
            payload.get("_personal_image_channel"),
            owner_user_id=_clean(payload.get("_owner_user_id")),
        )
        if personal_error:
            self._mark_personal_channel_error(payload, personal_error)
            return None
        personal_required = (
            isinstance(payload.get("_personal_image_channel"), dict)
            and _bool(payload["_personal_image_channel"].get("enabled"), False)
        )
        for channel in self._enabled_personal_and_external_channels(
                model,
                payload.get("_personal_image_channel"),
                owner_user_id=_clean(payload.get("_owner_user_id")),
        ):
            resolved_model = self._resolve_external_model_for_channel(channel, model)
            routed_payload = {**payload, "model": resolved_model or model}
            try:
                return self._call_generation(channel, routed_payload), self._channel_result_name(channel)
            except Exception as exc:
                error = _friendly_channel_error(exc)
                errors.append(f"{self._channel_result_name(channel)}: {error}")
                print(f"[channel] generation failed channel={channel.get('name')} error={error}")
        if errors:
            message = "; ".join(errors)
            print(f"[channel] all external generation channels failed: {message}")
            payload["_channel_error"] = message
            if personal_required:
                payload["_personal_channel_error"] = message
        return None

    def call_edit(self, payload: dict[str, Any]) -> tuple[dict[str, Any], str] | None:
        model = _clean(payload.get("model")) or "gpt-image-2"
        errors: list[str] = []
        personal_error = self._personal_channel_error(
            model,
            payload.get("_personal_image_channel"),
            owner_user_id=_clean(payload.get("_owner_user_id")),
        )
        if personal_error:
            self._mark_personal_channel_error(payload, personal_error)
            return None
        personal_required = (
            isinstance(payload.get("_personal_image_channel"), dict)
            and _bool(payload["_personal_image_channel"].get("enabled"), False)
        )
        for channel in self._enabled_personal_and_external_channels(
                model,
                payload.get("_personal_image_channel"),
                owner_user_id=_clean(payload.get("_owner_user_id")),
        ):
            resolved_model = self._resolve_external_model_for_channel(channel, model)
            routed_payload = {**payload, "model": resolved_model or model}
            try:
                return self._call_edit(channel, routed_payload), self._channel_result_name(channel)
            except Exception as exc:
                error = _friendly_channel_error(exc)
                errors.append(f"{self._channel_result_name(channel)}: {error}")
                print(f"[channel] edit failed channel={channel.get('name')} error={error}")
        if errors:
            message = "; ".join(errors)
            print(f"[channel] all external edit channels failed: {message}")
            payload["_channel_error"] = message
            if personal_required:
                payload["_personal_channel_error"] = message
        return None

    def _call_generation(self, channel: dict[str, object], payload: dict[str, Any]) -> dict[str, Any]:
        prompt, size = _normalize_external_image_request(payload.get("prompt"), payload.get("size"))
        body = {
            key: value
            for key, value in payload.items()
            if key in {"model", "n", "response_format"} and value is not None
        }
        if prompt is not None:
            body["prompt"] = prompt
        if size is not None:
            body["size"] = size
        if "model" not in body:
            body["model"] = (channel.get("models") or ["gpt-image-1"])[0]
        response = self._session(channel).post(
            self._openai_compatible_url(channel, "/v1/images/generations"),
            json=body,
            timeout=int(channel.get("timeout") or 60),
        )
        return self._normalize_response(response, payload)

    def _call_edit(self, channel: dict[str, object], payload: dict[str, Any]) -> dict[str, Any]:
        prompt, size = _normalize_external_image_request(payload.get("prompt"), payload.get("size"))
        form_data = {
            "prompt": prompt or "",
            "model": _clean(payload.get("model")) or (channel.get("models") or ["gpt-image-1"])[0],
            "n": str(int(payload.get("n") or 1)),
            "response_format": _clean(payload.get("response_format")) or "b64_json",
        }
        if size is not None:
            form_data["size"] = size
        multipart = CurlMime()
        for key, value in form_data.items():
            if value is None:
                continue
            multipart.addpart(key, data=str(value).encode("utf-8"))
        for index, image in enumerate(payload.get("images") or []):
            if not isinstance(image, tuple) or len(image) != 3:
                continue
            data, filename, content_type = image
            multipart.addpart(
                "image",
                filename=filename or f"image-{index}.png",
                content_type=content_type or "image/png",
                data=data,
            )
        try:
            response = self._session(channel).post(
                self._openai_compatible_url(channel, "/v1/images/edits"),
                multipart=multipart,
                timeout=int(channel.get("timeout") or 60),
            )
        finally:
            multipart.close()
        return self._normalize_response(response, payload)

    def _session(self, channel: dict[str, object]) -> Session:
        session = Session(**proxy_settings.build_session_kwargs(verify=True))
        session.headers.update({
            "Authorization": f"Bearer {_clean(channel.get('api_key'))}",
            "Accept": "application/json",
        })
        return session

    @staticmethod
    def _openai_compatible_url(channel: dict[str, object], path: str) -> str:
        base_url = _clean(channel.get("base_url")).rstrip("/")
        if not base_url:
            raise ValueError("channel base_url is required")
        normalized_path = "/" + _clean(path).lstrip("/")
        if base_url.lower().endswith("/v1") and normalized_path.startswith("/v1/"):
            normalized_path = normalized_path[3:]
        return f"{base_url}{normalized_path}"

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
            from services.protocol.conversation import format_image_result

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
            from services.protocol.conversation import format_image_result

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


channel_service = ChannelService(config.get_repository_provider() or config.get_storage_backend())
