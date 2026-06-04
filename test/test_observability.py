from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from services.log_service import LOG_TYPE_CALL, LogService
from services.observability import get_current_request_id, request_id_context
from services.storage.database_storage import DatabaseStorageBackend


class ObservabilityTest(unittest.TestCase):
    def test_request_id_context_tracks_current_request(self) -> None:
        self.assertEqual(get_current_request_id(), "")
        with request_id_context("req-observe-1"):
            self.assertEqual(get_current_request_id(), "req-observe-1")
        self.assertEqual(get_current_request_id(), "")

    def test_system_logs_are_persisted_and_paginated_in_database(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = DatabaseStorageBackend(f"sqlite:///{(Path(tmp_dir) / 'logs.db').as_posix()}")
            log_path = Path(tmp_dir) / "logs.jsonl"
            service = LogService(log_path)
            fake_config = SimpleNamespace(get_repository_provider=lambda: storage.repository_provider)

            with mock.patch("services.config.config", fake_config), request_id_context("req-log"):
                for index in range(3):
                    service.add(LOG_TYPE_CALL, f"call-{index}", {"status": "failed" if index == 1 else "success", "index": index})
                page = service.query(type=LOG_TYPE_CALL, request_id="req-log", page=1, page_size=2)
                failed_page = service.query(type=LOG_TYPE_CALL, request_id="req-log", status="failed")

            self.assertEqual(storage.repository_provider.system_logs.count(), 3)
            self.assertFalse(log_path.exists())
            self.assertEqual(page["total"], 3)
            self.assertEqual(page["page_count"], 2)
            self.assertEqual(len(page["items"]), 2)
            self.assertEqual(page["items"][0]["detail"]["request_id"], "req-log")
            self.assertEqual(failed_page["total"], 1)
            self.assertEqual(failed_page["items"][0]["detail"]["status"], "failed")
            storage.close()

    def test_file_system_logs_can_filter_by_status(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            log_path = Path(tmp_dir) / "logs.jsonl"
            service = LogService(log_path)
            fake_config = SimpleNamespace(get_repository_provider=lambda: None)

            with mock.patch("services.config.config", fake_config):
                service.add(LOG_TYPE_CALL, "call-success", {"status": "success"})
                service.add(LOG_TYPE_CALL, "call-failed", {"status": "failed"})
                result = service.query(type=LOG_TYPE_CALL, status="failed")

            self.assertEqual(result["total"], 1)
            self.assertEqual(result["items"][0]["summary"], "call-failed")

    def test_audit_logs_have_dedicated_repository(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = DatabaseStorageBackend(f"sqlite:///{(Path(tmp_dir) / 'audit.db').as_posix()}")
            repo = storage.repository_provider.audit_logs

            repo.add(
                {
                    "request_id": "req-audit",
                    "actor_id": "admin",
                    "actor_role": "admin",
                    "action": "users.quota.adjust",
                    "resource": "user",
                    "target_id": "user-a",
                    "detail": {"amount": 2},
                }
            )
            result = repo.query(resource="user", request_id="req-audit")

            self.assertEqual(repo.count(), 1)
            self.assertEqual(result["total"], 1)
            self.assertEqual(result["items"][0]["action"], "users.quota.adjust")
            self.assertEqual(result["items"][0]["detail"]["amount"], 2)
            storage.close()

    def test_request_id_links_image_records_and_health(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            storage = DatabaseStorageBackend(f"sqlite:///{(Path(tmp_dir) / 'observability.db').as_posix()}")
            storage.save_accounts([
                {"access_token": "token-a", "status": "正常", "quota": 3, "max_concurrency": 1},
                {"access_token": "token-b", "status": "限流", "quota": 0, "max_concurrency": 1},
            ])
            storage.repository_provider.image_records.insert(
                {
                    "record_id": "image-a",
                    "url": "http://127.0.0.1:8000/images/a.png",
                    "owner_user_id": "user-a",
                    "created_at": "2026-05-29 12:00:00",
                    "channel": "internal_pool",
                    "request_id": "req-image",
                }
            )

            page = storage.repository_provider.image_records.query(request_id="req-image")
            health = storage.health_check()

            self.assertEqual(page["total"], 1)
            self.assertEqual(page["items"][0]["request_id"], "req-image")
            self.assertEqual(health["status"], "healthy")
            self.assertEqual(health["migration_version"], "004_observability")
            self.assertIn("004_observability", health["schema_migrations"])
            self.assertEqual(health["available_image_accounts_count"], 1)
            storage.close()


if __name__ == "__main__":
    unittest.main()
