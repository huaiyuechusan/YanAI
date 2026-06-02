from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

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
