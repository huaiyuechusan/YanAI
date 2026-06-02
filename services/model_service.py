from __future__ import annotations

from typing import Any

from services.channel_service import channel_service
from services.config import config


MODEL_PRICING_KEY = "model_pricing"
TOKEN_BILLING_MODE = "tokens"
FIXED_BILLING_MODE = "fixed"
DEFAULT_CURRENCY = "USD"


def _clean(value: object) -> str:
    return str(value or "").strip()


def _float(value: object, default: float = 0.0) -> float:
    try:
        return max(0.0, float(value))
    except (TypeError, ValueError):
        return default


def _bool(value: object, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on", "enabled"}
    return bool(value)


def _models(value: object) -> list[str]:
    if isinstance(value, list):
        return [_clean(item) for item in value if _clean(item)]
    if isinstance(value, str):
        return [item.strip() for item in value.replace(";", ",").split(",") if item.strip()]
    return []


def normalize_model_pricing(model: str, raw: object | None = None) -> dict[str, object]:
    data = dict(raw) if isinstance(raw, dict) else {}
    billing_mode = _clean(data.get("billing_mode") or data.get("quota_type") or TOKEN_BILLING_MODE).lower()
    if billing_mode not in {TOKEN_BILLING_MODE, FIXED_BILLING_MODE}:
        billing_mode = TOKEN_BILLING_MODE

    input_price = _float(data.get("input_price_per_million"))
    output_price = _float(data.get("output_price_per_million"))
    model_ratio = _float(data.get("model_ratio"), 1.0)
    completion_ratio = _float(data.get("completion_ratio"), 1.0)
    model_price = _float(data.get("model_price") if "model_price" in data else data.get("fixed_price"))

    if input_price > 0 and output_price <= 0 and completion_ratio > 0:
        output_price = input_price * completion_ratio
    if input_price > 0 and output_price > 0:
        completion_ratio = output_price / input_price

    return {
        "model": model,
        "enabled": _bool(data.get("enabled"), True),
        "billing_mode": billing_mode,
        "currency": (_clean(data.get("currency")) or DEFAULT_CURRENCY).upper(),
        "input_price_per_million": round(input_price, 8),
        "output_price_per_million": round(output_price, 8),
        "model_ratio": round(model_ratio, 8),
        "completion_ratio": round(completion_ratio, 8),
        "model_price": round(model_price, 8),
        "note": _clean(data.get("note"))[:500],
    }


class ModelService:
    def __init__(self, channels, config_store):
        self.channels = channels
        self.config_store = config_store

    def _pricing_map(self) -> dict[str, dict[str, object]]:
        raw = self.config_store.get().get(MODEL_PRICING_KEY)
        if not isinstance(raw, dict):
            return {}
        items: dict[str, dict[str, object]] = {}
        for key, value in raw.items():
            model = _clean((value or {}).get("model") if isinstance(value, dict) else "") or _clean(key)
            if not model:
                continue
            items[model] = normalize_model_pricing(model, value)
        return items

    def _save_pricing_map(self, items: dict[str, dict[str, object]]) -> None:
        ordered = {key: items[key] for key in sorted(items)}
        self.config_store.update({MODEL_PRICING_KEY: ordered})

    def _channel_summaries(self) -> list[dict[str, object]]:
        summaries: list[dict[str, object]] = []
        for channel in self.channels.list_channels(include_internal=True):
            channel_models = _models(channel.get("models"))
            summaries.append(
                {
                    "id": _clean(channel.get("id")),
                    "name": _clean(channel.get("name")),
                    "type": _clean(channel.get("type")),
                    "base_url": _clean(channel.get("base_url")),
                    "enabled": _bool(channel.get("enabled"), True),
                    "models": channel_models,
                    "model_count": len(channel_models),
                }
            )
        return summaries

    def list_catalog(self) -> dict[str, object]:
        channels = self._channel_summaries()
        pricing = self._pricing_map()
        model_channels: dict[str, list[dict[str, object]]] = {}
        for channel in channels:
            channel_ref = {
                "id": channel["id"],
                "name": channel["name"],
                "type": channel["type"],
                "enabled": channel["enabled"],
            }
            for model in _models(channel.get("models")):
                model_channels.setdefault(model, []).append(channel_ref)

        items: list[dict[str, object]] = []
        for model in sorted(set(model_channels) | set(pricing), key=lambda item: item.lower()):
            configured = model in pricing
            model_pricing = pricing.get(model) or normalize_model_pricing(model)
            channels_for_model = model_channels.get(model, [])
            items.append(
                {
                    "id": model,
                    "model": model,
                    "source": "channel" if channels_for_model else "custom",
                    "channel_count": len(channels_for_model),
                    "channels": channels_for_model,
                    "enabled": bool(model_pricing.get("enabled", True)),
                    "configured": configured,
                    "pricing": model_pricing,
                }
            )
        return {"items": items, "channels": channels, "pricing": pricing}

    def get_pricing(self, model: str) -> dict[str, object]:
        normalized_model = _clean(model)
        if not normalized_model:
            raise ValueError("model is required")
        return self._pricing_map().get(normalized_model) or normalize_model_pricing(normalized_model)

    def update_pricing(self, model: str, updates: dict[str, Any]) -> dict[str, object]:
        normalized_model = _clean(model or updates.get("model"))
        if not normalized_model:
            raise ValueError("model is required")
        pricing = self._pricing_map()
        current = pricing.get(normalized_model) or normalize_model_pricing(normalized_model)
        pricing[normalized_model] = normalize_model_pricing(normalized_model, {**current, **updates})
        self._save_pricing_map(pricing)
        return pricing[normalized_model]

    def refresh_channel_models(self, channel_id: str) -> dict[str, object] | None:
        return self.channels.refresh_channel_models(channel_id)

    def estimate_cost(
        self,
        model: str,
        *,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        group_ratio: float = 1.0,
    ) -> dict[str, object]:
        pricing = self.get_pricing(model)
        ratio = max(0.0, float(group_ratio or 1.0))
        if pricing.get("billing_mode") == FIXED_BILLING_MODE:
            amount = float(pricing.get("model_price") or 0.0) * ratio
            unit = str(pricing.get("currency") or DEFAULT_CURRENCY).lower()
        elif float(pricing.get("input_price_per_million") or 0.0) > 0 or float(pricing.get("output_price_per_million") or 0.0) > 0:
            amount = (
                max(0, int(prompt_tokens or 0)) / 1_000_000 * float(pricing.get("input_price_per_million") or 0.0)
                + max(0, int(completion_tokens or 0)) / 1_000_000 * float(pricing.get("output_price_per_million") or 0.0)
            ) * ratio
            unit = str(pricing.get("currency") or DEFAULT_CURRENCY).lower()
        else:
            amount = (
                max(0, int(prompt_tokens or 0))
                + max(0, int(completion_tokens or 0)) * float(pricing.get("completion_ratio") or 1.0)
            ) * float(pricing.get("model_ratio") or 1.0) * ratio
            unit = "quota"
        return {"model": model, "amount": round(amount, 8), "unit": unit, "pricing": pricing}


model_service = ModelService(channel_service, config)
