from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _normalize_page(page: int, page_size: int) -> tuple[int, int]:
    try:
        normalized_page = max(1, int(page or 1))
    except (TypeError, ValueError):
        normalized_page = 1
    try:
        normalized_page_size = int(page_size or 48)
    except (TypeError, ValueError):
        normalized_page_size = 48
    return normalized_page, max(1, min(200, normalized_page_size))


class RepositoryError(RuntimeError):
    """Base repository error."""


class RepositoryValidationError(RepositoryError):
    """Raised when repository input would corrupt a dataset."""


class DatasetRepository(ABC):
    """Repository interface for one logical dataset."""

    dataset_name: str
    primary_key: str
    unique_keys: tuple[str, ...] = ()

    @abstractmethod
    def list(self) -> list[dict[str, Any]]:
        pass

    @abstractmethod
    def replace_all(self, items: list[dict[str, Any]]) -> None:
        pass

    @abstractmethod
    def upsert(self, item: dict[str, Any]) -> None:
        pass

    @abstractmethod
    def delete(self, key: str) -> bool:
        pass

    @abstractmethod
    def count(self) -> int:
        pass

    @abstractmethod
    def key_set(self) -> set[str]:
        pass


class AccountRepository(DatasetRepository):
    def get_by_access_token(self, access_token: str) -> dict[str, Any] | None:
        for item in self.list():
            if str(item.get("access_token") or "").strip() == str(access_token or "").strip():
                return dict(item)
        return None

    def acquire_image_lease(self, lease_owner: str, lease_ttl_seconds: int) -> dict[str, Any] | None:
        raise NotImplementedError

    def release_image_lease(
        self,
        access_token: str,
        lease_owner: str,
        *,
        success: bool | None = None,
    ) -> dict[str, Any] | None:
        raise NotImplementedError

    def record_image_result(self, access_token: str, success: bool) -> dict[str, Any] | None:
        raise NotImplementedError


class AuthKeyRepository(DatasetRepository):
    pass


class UserRepository(DatasetRepository):
    pass


class SessionRepository(DatasetRepository):
    pass


class RedeemCodeRepository(DatasetRepository):
    def redeem(self, user_id: str, raw_code: str) -> tuple[dict[str, Any], dict[str, Any]]:
        raise NotImplementedError


class ChannelRepository(DatasetRepository):
    pass


class PromptRepository(DatasetRepository):
    pass


class ImageRecordRepository(DatasetRepository):
    def insert(self, item: dict[str, Any]) -> None:
        self.upsert(item)

    def query(
        self,
        *,
        start_date: str = "",
        end_date: str = "",
        owner_user_id: str = "",
        channel: str = "",
        request_id: str = "",
        page: int = 1,
        page_size: int = 48,
    ) -> dict[str, Any]:
        normalized_page, normalized_page_size = _normalize_page(page, page_size)
        filtered: list[dict[str, Any]] = []
        for item in self.list():
            if not isinstance(item, dict):
                continue
            created_at = _clean(item.get("created_at"))
            day = created_at[:10]
            if owner_user_id and _clean(item.get("owner_user_id")) != owner_user_id:
                continue
            if channel and _clean(item.get("channel")) != channel:
                continue
            if request_id and _clean(item.get("request_id")) != request_id:
                continue
            if start_date and day < start_date:
                continue
            if end_date and day > end_date:
                continue
            filtered.append(dict(item))
        filtered.sort(key=lambda item: _clean(item.get("created_at")), reverse=True)
        total = len(filtered)
        page_count = max(1, (total + normalized_page_size - 1) // normalized_page_size)
        safe_page = min(normalized_page, page_count)
        start = (safe_page - 1) * normalized_page_size
        return {
            "items": filtered[start:start + normalized_page_size],
            "total": total,
            "page": safe_page,
            "page_size": normalized_page_size,
            "page_count": page_count,
        }


class QuotaReservationRepository(ABC):
    """Repository boundary for atomic user quota reservations."""

    @abstractmethod
    def reserve(self, user_id: str, amount: int, request_id: str, *, ttl_seconds: int = 900) -> dict[str, Any]:
        pass

    @abstractmethod
    def confirm(self, request_id: str, *, amount: int | None = None) -> dict[str, Any] | None:
        pass

    @abstractmethod
    def release(self, request_id: str) -> dict[str, Any] | None:
        pass

    @abstractmethod
    def expire(self) -> int:
        pass

    @abstractmethod
    def list(self) -> list[dict[str, Any]]:
        pass

    @abstractmethod
    def count(self) -> int:
        pass


class SystemConfigRepository(ABC):
    """Configuration repository boundary for future database-backed settings."""

    @abstractmethod
    def list_settings(self) -> dict[str, Any]:
        pass

    @abstractmethod
    def get_setting(self, key: str, default: Any = None) -> Any:
        pass

    @abstractmethod
    def set_setting(self, key: str, value: Any) -> None:
        pass

    @abstractmethod
    def delete_setting(self, key: str) -> bool:
        pass


class SystemLogRepository(ABC):
    """Repository boundary for operational request and account logs."""

    dataset_name = "system_logs"

    @abstractmethod
    def add(self, item: dict[str, Any]) -> dict[str, Any]:
        pass

    @abstractmethod
    def list(self) -> list[dict[str, Any]]:
        pass

    @abstractmethod
    def query(
        self,
        *,
        type: str = "",
        start_date: str = "",
        end_date: str = "",
        request_id: str = "",
        status: str = "",
        page: int = 1,
        page_size: int = 200,
    ) -> dict[str, Any]:
        pass

    @abstractmethod
    def count(self) -> int:
        pass


class AuditLogRepository(ABC):
    """Repository boundary for security and admin audit events."""

    dataset_name = "audit_logs"

    @abstractmethod
    def add(self, item: dict[str, Any]) -> dict[str, Any]:
        pass

    @abstractmethod
    def list(self) -> list[dict[str, Any]]:
        pass

    @abstractmethod
    def query(
        self,
        *,
        action: str = "",
        resource: str = "",
        start_date: str = "",
        end_date: str = "",
        request_id: str = "",
        page: int = 1,
        page_size: int = 200,
    ) -> dict[str, Any]:
        pass

    @abstractmethod
    def count(self) -> int:
        pass


class RepositoryProvider(ABC):
    @property
    @abstractmethod
    def accounts(self) -> AccountRepository:
        pass

    @property
    @abstractmethod
    def auth_keys(self) -> AuthKeyRepository:
        pass

    @property
    @abstractmethod
    def users(self) -> UserRepository:
        pass

    @property
    @abstractmethod
    def sessions(self) -> SessionRepository:
        pass

    @property
    @abstractmethod
    def redeem_codes(self) -> RedeemCodeRepository:
        pass

    @property
    @abstractmethod
    def channels(self) -> ChannelRepository:
        pass

    @property
    @abstractmethod
    def prompts(self) -> PromptRepository:
        pass

    @property
    @abstractmethod
    def image_records(self) -> ImageRecordRepository:
        pass

    @property
    @abstractmethod
    def quota_reservations(self) -> QuotaReservationRepository:
        pass

    @property
    @abstractmethod
    def system_config(self) -> SystemConfigRepository:
        pass

    @property
    @abstractmethod
    def system_logs(self) -> SystemLogRepository:
        pass

    @property
    @abstractmethod
    def audit_logs(self) -> AuditLogRepository:
        pass

    @abstractmethod
    def health_check(self) -> dict[str, Any]:
        pass

    @abstractmethod
    def get_backend_info(self) -> dict[str, Any]:
        pass
