from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any
import uuid

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Integer,
    String,
    Text,
    create_engine,
    delete,
    func,
    inspect,
    or_,
    select,
    text,
    update,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from services.repositories.base import (
    AccountRepository,
    AuditLogRepository,
    AuthKeyRepository,
    ChannelRepository,
    DatasetRepository,
    ImageRecordRepository,
    PromptRepository,
    QuotaReservationRepository,
    RedeemCodeRepository,
    RepositoryProvider,
    RepositoryValidationError,
    SessionRepository,
    SystemConfigRepository,
    SystemLogRepository,
    UserRepository,
)


Base = declarative_base()
SCHEMA_VERSION = "004_observability"


def _json_column_type():
    return JSON().with_variant(JSONB(none_as_null=True), "postgresql")


class AccountRow(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    position = Column(Integer, nullable=False, default=0, index=True)
    access_token_hash = Column(String(64), nullable=False, unique=True, index=True)
    status = Column(String(64), index=True)
    quota = Column(Integer)
    leased_until = Column(String(80), index=True)
    lease_owner = Column(String(255), index=True)
    inflight_count = Column(Integer, nullable=False, default=0, index=True)
    max_concurrency = Column(Integer, nullable=False, default=1, index=True)
    updated_at = Column(String(80), index=True)
    data = Column(_json_column_type(), nullable=False)


class AuthKeyRow(Base):
    __tablename__ = "auth_keys"

    id = Column(Integer, primary_key=True, autoincrement=True)
    position = Column(Integer, nullable=False, default=0, index=True)
    key_id = Column(String(255), nullable=False, unique=True, index=True)
    key_hash = Column(String(255), index=True)
    role = Column(String(32), index=True)
    enabled = Column(Boolean, index=True)
    data = Column(_json_column_type(), nullable=False)


class UserRow(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    position = Column(Integer, nullable=False, default=0, index=True)
    user_id = Column(String(255), nullable=False, unique=True, index=True)
    email = Column(String(320), index=True)
    role = Column(String(32), index=True)
    status = Column(String(32), index=True)
    quota = Column(Integer)
    quota_used = Column(Integer)
    data = Column(_json_column_type(), nullable=False)


class SessionRow(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    position = Column(Integer, nullable=False, default=0, index=True)
    session_id = Column(String(255), nullable=False, unique=True, index=True)
    token_hash = Column(String(255), index=True)
    user_id = Column(String(255), index=True)
    expires_at = Column(String(80), index=True)
    data = Column(_json_column_type(), nullable=False)


class QuotaReservationRow(Base):
    __tablename__ = "quota_reservations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    reservation_id = Column(String(255), nullable=False, unique=True, index=True)
    user_id = Column(String(255), nullable=False, index=True)
    request_id = Column(String(255), nullable=False, unique=True, index=True)
    amount = Column(Integer, nullable=False)
    status = Column(String(32), nullable=False, index=True)
    created_at = Column(String(80), nullable=False, index=True)
    expires_at = Column(String(80), nullable=False, index=True)
    data = Column(_json_column_type(), nullable=False)


class RedeemCodeRow(Base):
    __tablename__ = "redeem_codes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    position = Column(Integer, nullable=False, default=0, index=True)
    redeem_id = Column(String(255), nullable=False, unique=True, index=True)
    code = Column(String(255), unique=True, index=True)
    status = Column(String(32), index=True)
    used_count = Column(Integer)
    max_uses = Column(Integer)
    data = Column(_json_column_type(), nullable=False)


class ChannelRow(Base):
    __tablename__ = "channels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    position = Column(Integer, nullable=False, default=0, index=True)
    channel_id = Column(String(255), nullable=False, unique=True, index=True)
    enabled = Column(Boolean, index=True)
    priority = Column(Integer, index=True)
    weight = Column(Integer)
    data = Column(_json_column_type(), nullable=False)


class PromptLibraryRow(Base):
    __tablename__ = "prompt_library"

    id = Column(Integer, primary_key=True, autoincrement=True)
    position = Column(Integer, nullable=False, default=0, index=True)
    prompt_id = Column(String(255), nullable=False, unique=True, index=True)
    category = Column(String(255), index=True)
    quick_access = Column(Boolean, index=True)
    data = Column(_json_column_type(), nullable=False)


class ImageRecordRow(Base):
    __tablename__ = "image_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    position = Column(Integer, nullable=False, default=0, index=True)
    record_id = Column(String(255), nullable=False, unique=True, index=True)
    owner_user_id = Column(String(255), index=True)
    created_at = Column(String(80), index=True)
    channel = Column(String(255), index=True)
    request_id = Column(String(255), index=True)
    data = Column(_json_column_type(), nullable=False)


class SchemaMigrationRow(Base):
    __tablename__ = "schema_migrations"

    version = Column(String(255), primary_key=True)
    applied_at = Column(String(80), nullable=False)


class SystemSettingRow(Base):
    __tablename__ = "system_settings"

    setting_key = Column(String(255), primary_key=True)
    updated_at = Column(String(80), nullable=False, index=True)
    data = Column(_json_column_type(), nullable=False)


class SystemLogRow(Base):
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    log_id = Column(String(255), nullable=False, unique=True, index=True)
    request_id = Column(String(255), index=True)
    type = Column(String(64), index=True)
    time = Column(String(80), nullable=False, index=True)
    summary = Column(Text)
    data = Column(_json_column_type(), nullable=False)


class AuditLogRow(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    audit_id = Column(String(255), nullable=False, unique=True, index=True)
    request_id = Column(String(255), index=True)
    time = Column(String(80), nullable=False, index=True)
    actor_id = Column(String(255), index=True)
    actor_role = Column(String(32), index=True)
    action = Column(String(255), index=True)
    resource = Column(String(255), index=True)
    target_id = Column(String(255), index=True)
    status = Column(String(32), index=True)
    data = Column(_json_column_type(), nullable=False)


@dataclass(frozen=True)
class RepositoryDefinition:
    dataset_name: str
    model: type[Base]
    primary_key: str
    key_column: str
    column_extractors: dict[str, Callable[[dict[str, Any]], Any]]
    unique_keys: tuple[str, ...] = ()
    key_transform: Callable[[str], str] | None = None


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _non_negative_int(value: Any, default: int = 0) -> int:
    parsed = _int(value)
    if parsed is None:
        return default
    return max(0, parsed)


def _positive_int(value: Any, default: int = 1) -> int:
    parsed = _int(value)
    if parsed is None:
        return default
    return max(1, parsed)


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


def _next_day_text(value: str) -> str:
    normalized = _clean(value)
    try:
        parsed = datetime.strptime(normalized[:10], "%Y-%m-%d")
    except ValueError:
        return normalized
    return (parsed + timedelta(days=1)).strftime("%Y-%m-%d")


def _bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on", "enabled", "active"}
    return bool(value)


def _data_copy(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return dict(decoded) if isinstance(decoded, dict) else {}
    return {}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat()


def _parse_iso(value: Any) -> datetime | None:
    text_value = _clean(value)
    if not text_value:
        return None
    try:
        parsed = datetime.fromisoformat(text_value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _lease_owners(item: dict[str, Any]) -> list[str]:
    owners = item.get("lease_owners")
    if not isinstance(owners, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for owner in owners:
        value = _clean(owner)
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def _reset_expired_account_lease(item: dict[str, Any], now: datetime) -> dict[str, Any]:
    leased_until = _parse_iso(item.get("leased_until"))
    if leased_until is not None and leased_until > now:
        return item
    if _non_negative_int(item.get("inflight_count")) <= 0 and not _clean(item.get("lease_owner")):
        return item
    next_item = dict(item)
    next_item["inflight_count"] = 0
    next_item["lease_owner"] = None
    next_item["leased_until"] = None
    next_item["lease_owners"] = []
    return next_item


def _is_image_account_available(item: dict[str, Any]) -> bool:
    status = _clean(item.get("status"))
    if status in {"禁用", "限流", "异常"}:
        return False
    if bool(item.get("image_quota_unknown")):
        return True
    return _non_negative_int(item.get("quota")) > 0


def _account_success_rate(item: dict[str, Any]) -> float:
    success = _non_negative_int(item.get("success"))
    fail = _non_negative_int(item.get("fail"))
    total = success + fail
    if total <= 0:
        return 0.5
    return success / total


def _account_type_rank(item: dict[str, Any]) -> int:
    return {
        "Pro": 5,
        "Team": 4,
        "ProLite": 3,
        "Plus": 2,
        "Free": 1,
    }.get(_clean(item.get("type")), 0)


def _timestamp_for_sort(value: Any) -> float:
    parsed = _parse_iso(value)
    if parsed is None:
        return 0
    return parsed.timestamp()


def _account_selection_key(item: dict[str, Any]) -> tuple[float, float, float, float, int]:
    weight = _positive_int(item.get("weight"), 1)
    max_concurrency = _positive_int(item.get("max_concurrency"), 1)
    inflight_count = _non_negative_int(item.get("inflight_count"))
    available_slots = max(0, max_concurrency - inflight_count)
    last_used = item.get("last_used_at") or item.get("updated_at")
    return (
        -float(weight),
        -float(available_slots),
        _timestamp_for_sort(last_used),
        -float(_account_success_rate(item)),
        -_account_type_rank(item),
    )


DEFINITIONS: dict[str, RepositoryDefinition] = {
    "accounts": RepositoryDefinition(
        dataset_name="accounts",
        model=AccountRow,
        primary_key="access_token",
        key_column="access_token_hash",
        key_transform=_hash,
        unique_keys=("user_id",),
        column_extractors={
            "access_token_hash": lambda item: _hash(_clean(item.get("access_token"))),
            "status": lambda item: _clean(item.get("status")) or None,
            "quota": lambda item: _int(item.get("quota")),
            "leased_until": lambda item: _clean(item.get("leased_until")) or None,
            "lease_owner": lambda item: _clean(item.get("lease_owner")) or None,
            "inflight_count": lambda item: _non_negative_int(item.get("inflight_count")),
            "max_concurrency": lambda item: _positive_int(item.get("max_concurrency")),
            "updated_at": lambda item: _clean(item.get("updated_at") or item.get("last_used_at")) or None,
        },
    ),
    "auth_keys": RepositoryDefinition(
        dataset_name="auth_keys",
        model=AuthKeyRow,
        primary_key="id",
        key_column="key_id",
        column_extractors={
            "key_id": lambda item: _clean(item.get("id")),
            "key_hash": lambda item: _clean(item.get("key_hash")) or None,
            "role": lambda item: _clean(item.get("role")) or None,
            "enabled": lambda item: _bool(item.get("enabled")),
        },
    ),
    "users": RepositoryDefinition(
        dataset_name="users",
        model=UserRow,
        primary_key="id",
        key_column="user_id",
        unique_keys=("email",),
        column_extractors={
            "user_id": lambda item: _clean(item.get("id")),
            "email": lambda item: _clean(item.get("email")).lower() or None,
            "role": lambda item: _clean(item.get("role")) or None,
            "status": lambda item: _clean(item.get("status")) or None,
            "quota": lambda item: _int(item.get("quota")),
            "quota_used": lambda item: _int(item.get("quota_used")),
        },
    ),
    "sessions": RepositoryDefinition(
        dataset_name="sessions",
        model=SessionRow,
        primary_key="id",
        key_column="session_id",
        unique_keys=("token_hash",),
        column_extractors={
            "session_id": lambda item: _clean(item.get("id")),
            "token_hash": lambda item: _clean(item.get("token_hash")) or None,
            "user_id": lambda item: _clean(item.get("user_id")) or None,
            "expires_at": lambda item: _clean(item.get("expires_at")) or None,
        },
    ),
    "redeem_codes": RepositoryDefinition(
        dataset_name="redeem_codes",
        model=RedeemCodeRow,
        primary_key="id",
        key_column="redeem_id",
        unique_keys=("code",),
        column_extractors={
            "redeem_id": lambda item: _clean(item.get("id")),
            "code": lambda item: _clean(item.get("code")).upper() or None,
            "status": lambda item: _clean(item.get("status")) or None,
            "used_count": lambda item: _int(item.get("used_count")),
            "max_uses": lambda item: _int(item.get("max_uses")),
        },
    ),
    "channels": RepositoryDefinition(
        dataset_name="channels",
        model=ChannelRow,
        primary_key="id",
        key_column="channel_id",
        column_extractors={
            "channel_id": lambda item: _clean(item.get("id")),
            "enabled": lambda item: _bool(item.get("enabled")),
            "priority": lambda item: _int(item.get("priority")),
            "weight": lambda item: _int(item.get("weight")),
        },
    ),
    "prompt_library": RepositoryDefinition(
        dataset_name="prompt_library",
        model=PromptLibraryRow,
        primary_key="id",
        key_column="prompt_id",
        column_extractors={
            "prompt_id": lambda item: _clean(item.get("id")),
            "category": lambda item: _clean(item.get("category")) or None,
            "quick_access": lambda item: _bool(item.get("quick_access")),
        },
    ),
    "image_records": RepositoryDefinition(
        dataset_name="image_records",
        model=ImageRecordRow,
        primary_key="id",
        key_column="record_id",
        column_extractors={
            "record_id": lambda item: _clean(item.get("record_id") or item.get("id")),
            "owner_user_id": lambda item: _clean(item.get("owner_user_id")) or None,
            "created_at": lambda item: _clean(item.get("created_at")) or None,
            "channel": lambda item: _clean(item.get("channel")) or None,
            "request_id": lambda item: _clean(item.get("request_id")) or None,
        },
    ),
}


class SQLAlchemyDatasetRepository(DatasetRepository):
    def __init__(self, session_factory: sessionmaker[Session], definition: RepositoryDefinition):
        self._session_factory = session_factory
        self._definition = definition
        self.dataset_name = definition.dataset_name
        self.primary_key = definition.primary_key
        self.unique_keys = definition.unique_keys

    @property
    def model(self) -> type[Base]:
        return self._definition.model

    @property
    def key_column(self):
        return getattr(self.model, self._definition.key_column)

    def list(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            rows = session.execute(
                select(self.model).order_by(self.model.position.asc(), self.model.id.asc())
            ).scalars()
            return [_data_copy(row.data) for row in rows if _data_copy(row.data)]

    def replace_all(self, items: list[dict[str, Any]]) -> None:
        normalized = self._validate_items(items)
        db_keys = [self._database_key(item) for item in normalized]
        with self._session_factory() as session:
            with session.begin():
                for position, item in enumerate(normalized):
                    self._upsert_in_session(session, item, position=position)
                if db_keys:
                    session.execute(
                        delete(self.model).where(
                            or_(self.key_column.is_(None), self.key_column.not_in(db_keys))
                        )
                    )
                else:
                    session.execute(delete(self.model))

    def upsert(self, item: dict[str, Any]) -> None:
        normalized = self._validate_items([item])[0]
        with self._session_factory() as session:
            with session.begin():
                self._upsert_in_session(session, normalized)

    def delete(self, key: str) -> bool:
        db_key = self._database_key_from_text(key)
        with self._session_factory() as session:
            with session.begin():
                result = session.execute(delete(self.model).where(self.key_column == db_key))
            return bool(result.rowcount)

    def count(self) -> int:
        with self._session_factory() as session:
            return int(session.execute(select(func.count()).select_from(self.model)).scalar_one())

    def key_set(self) -> set[str]:
        return {
            key
            for item in self.list()
            if (key := _clean(item.get(self.primary_key)))
        }

    def _upsert_in_session(self, session: Session, item: dict[str, Any], *, position: int | None = None) -> None:
        db_key = self._database_key(item)
        row = session.execute(select(self.model).where(self.key_column == db_key)).scalar_one_or_none()
        if row is None:
            row = self.model()
            session.add(row)
        if position is not None:
            row.position = position
        elif row.position is None:
            row.position = 0
        self._apply_item_to_row(row, item)

    def _apply_item_to_row(self, row: Base, item: dict[str, Any]) -> None:
        for column_name, extractor in self._definition.column_extractors.items():
            setattr(row, column_name, extractor(item))
        row.data = dict(item)

    def _database_key(self, item: dict[str, Any]) -> str:
        return self._database_key_from_text(_clean(item.get(self.primary_key)))

    def _database_key_from_text(self, value: str) -> str:
        value = _clean(value)
        if not value:
            return ""
        transform = self._definition.key_transform
        return transform(value) if transform else value

    def _validate_items(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not isinstance(items, list):
            raise RepositoryValidationError(f"{self.dataset_name}: expected list of objects")
        normalized: list[dict[str, Any]] = []
        problems: list[str] = []
        primary_seen: dict[str, int] = {}
        unique_seen: dict[str, dict[str, int]] = {key: {} for key in self.unique_keys}

        for index, item in enumerate(items):
            if not isinstance(item, dict):
                problems.append(f"index {index}: item is not an object")
                continue
            key = _clean(item.get(self.primary_key))
            if not key:
                problems.append(f"index {index}: missing primary key {self.primary_key!r}")
                continue
            if key in primary_seen:
                problems.append(
                    f"index {index}: duplicate primary key {self.primary_key!r} "
                    f"(first index {primary_seen[key]}, value_sha256={_hash(key)[:16]})"
                )
                continue
            primary_seen[key] = index
            for unique_key in self.unique_keys:
                value = _clean(item.get(unique_key))
                if not value:
                    continue
                seen_for_key = unique_seen[unique_key]
                if value in seen_for_key:
                    problems.append(
                        f"index {index}: duplicate unique key {unique_key!r} "
                        f"(first index {seen_for_key[value]}, value_sha256={_hash(value)[:16]})"
                    )
                    continue
                seen_for_key[value] = index
            normalized.append(dict(item))

        if problems:
            preview = "; ".join(problems[:10])
            if len(problems) > 10:
                preview += f"; ... {len(problems) - 10} more"
            raise RepositoryValidationError(f"{self.dataset_name}: validation failed: {preview}")
        return normalized


class SQLAlchemyAccountRepository(SQLAlchemyDatasetRepository, AccountRepository):
    def __init__(self, session_factory: sessionmaker[Session], definition: RepositoryDefinition):
        super().__init__(session_factory, definition)
        self._lease_lock = Lock()

    def get_by_access_token(self, access_token: str) -> dict[str, Any] | None:
        db_key = self._database_key_from_text(access_token)
        if not db_key:
            return None
        with self._session_factory() as session:
            row = session.execute(
                select(AccountRow).where(AccountRow.access_token_hash == db_key)
            ).scalar_one_or_none()
            return self._row_item(row) if row is not None else None

    def acquire_image_lease(self, lease_owner: str, lease_ttl_seconds: int) -> dict[str, Any] | None:
        normalized_owner = _clean(lease_owner)
        if not normalized_owner:
            raise ValueError("lease owner is required")
        ttl = max(1, int(lease_ttl_seconds or 1))
        with self._lease_lock:
            with self._session_factory() as session:
                with session.begin():
                    now = _now_utc()
                    rows = list(session.execute(self._lease_candidate_statement(session)).scalars())
                    candidates: list[tuple[tuple[float, float, float, float, int], int, int]] = []
                    for row in rows:
                        item = _reset_expired_account_lease(self._row_item(row), now)
                        if not _is_image_account_available(item):
                            continue
                        max_concurrency = _positive_int(item.get("max_concurrency"), 1)
                        owners = _lease_owners(item)
                        inflight_count = max(_non_negative_int(item.get("inflight_count")), len(owners))
                        if inflight_count >= max_concurrency:
                            continue
                        normalized_item = dict(item)
                        normalized_item["inflight_count"] = inflight_count
                        normalized_item["max_concurrency"] = max_concurrency
                        candidates.append((_account_selection_key(normalized_item), int(row.position or 0), int(row.id or 0)))

                    for _, _, row_id in sorted(candidates, key=lambda candidate: (candidate[0], candidate[1], candidate[2])):
                        row = self._locked_row_by_id(session, row_id)
                        if row is None:
                            continue
                        item = _reset_expired_account_lease(self._row_item(row), now)
                        if not _is_image_account_available(item):
                            self._apply_item_to_row(row, item)
                            continue
                        max_concurrency = _positive_int(item.get("max_concurrency"), 1)
                        owners = _lease_owners(item)
                        inflight_count = max(_non_negative_int(item.get("inflight_count")), len(owners))
                        if inflight_count >= max_concurrency:
                            self._apply_item_to_row(row, {**item, "inflight_count": inflight_count, "max_concurrency": max_concurrency})
                            continue
                        if normalized_owner not in owners:
                            owners.append(normalized_owner)
                        lease_until = now + timedelta(seconds=ttl)
                        item["lease_owners"] = owners
                        item["inflight_count"] = len(owners)
                        item["lease_owner"] = owners[0] if owners else None
                        item["leased_until"] = _iso(lease_until)
                        item["max_concurrency"] = max_concurrency
                        item["updated_at"] = _iso(now)
                        self._apply_item_to_row(row, item)
                        return dict(item)

                    return None

    def release_image_lease(
        self,
        access_token: str,
        lease_owner: str,
        *,
        success: bool | None = None,
    ) -> dict[str, Any] | None:
        normalized_owner = _clean(lease_owner)
        with self._lease_lock:
            with self._session_factory() as session:
                with session.begin():
                    row = self._locked_row_by_access_token(session, access_token)
                    if row is None:
                        return None
                    now = _now_utc()
                    item = self._apply_image_result(self._row_item(row), success, now=now)
                    item = self._release_owner(item, normalized_owner, now=now)
                    self._apply_item_to_row(row, item)
                    return dict(item)

    def record_image_result(self, access_token: str, success: bool) -> dict[str, Any] | None:
        with self._lease_lock:
            with self._session_factory() as session:
                with session.begin():
                    row = self._locked_row_by_access_token(session, access_token)
                    if row is None:
                        return None
                    item = self._apply_image_result(self._row_item(row), success, now=_now_utc())
                    self._apply_item_to_row(row, item)
                    return dict(item)

    def _lease_candidate_statement(self, session: Session):
        statement = (
            select(AccountRow)
            .where(or_(AccountRow.status.is_(None), AccountRow.status.not_in(["禁用", "限流", "异常"])))
            .order_by(AccountRow.position.asc(), AccountRow.id.asc())
        )
        return statement

    def _locked_row_by_id(self, session: Session, row_id: int) -> AccountRow | None:
        if row_id <= 0:
            return None
        statement = select(AccountRow).where(AccountRow.id == row_id).execution_options(populate_existing=True)
        if session.get_bind().dialect.name == "postgresql":
            statement = statement.with_for_update(skip_locked=True)
        return session.execute(statement).scalar_one_or_none()

    def _locked_row_by_access_token(self, session: Session, access_token: str) -> AccountRow | None:
        db_key = self._database_key_from_text(access_token)
        if not db_key:
            return None
        statement = select(AccountRow).where(AccountRow.access_token_hash == db_key)
        if session.get_bind().dialect.name == "postgresql":
            statement = statement.with_for_update()
        return session.execute(statement).scalar_one_or_none()

    def _row_item(self, row: AccountRow) -> dict[str, Any]:
        item = _data_copy(row.data)
        item.setdefault("status", row.status or "正常")
        item.setdefault("quota", int(row.quota or 0))
        item.setdefault("lease_owner", row.lease_owner)
        item.setdefault("leased_until", row.leased_until)
        item.setdefault("inflight_count", _non_negative_int(row.inflight_count))
        item.setdefault("max_concurrency", _positive_int(row.max_concurrency))
        item.setdefault("updated_at", row.updated_at)
        return item

    def _release_owner(self, item: dict[str, Any], lease_owner: str, *, now: datetime) -> dict[str, Any]:
        next_item = _reset_expired_account_lease(dict(item), now)
        owners = _lease_owners(next_item)
        previous_inflight = max(_non_negative_int(next_item.get("inflight_count")), len(owners))
        removed_owner = False
        if lease_owner and lease_owner in owners:
            owners.remove(lease_owner)
            removed_owner = True
        elif not owners and _non_negative_int(next_item.get("inflight_count")) > 0:
            next_item["inflight_count"] = max(0, _non_negative_int(next_item.get("inflight_count")) - 1)
        next_item["lease_owners"] = owners
        if owners:
            next_item["inflight_count"] = len(owners)
        elif removed_owner:
            next_item["inflight_count"] = max(0, previous_inflight - 1)
        else:
            next_item["inflight_count"] = _non_negative_int(next_item.get("inflight_count"))
        if next_item["inflight_count"] <= 0:
            next_item["inflight_count"] = 0
            next_item["lease_owner"] = None
            next_item["leased_until"] = None
            next_item["lease_owners"] = []
        else:
            next_item["lease_owner"] = owners[0] if owners else next_item.get("lease_owner")
        next_item["updated_at"] = _iso(now)
        return next_item

    def _apply_image_result(self, item: dict[str, Any], success: bool | None, *, now: datetime) -> dict[str, Any]:
        next_item = dict(item)
        if success is None:
            return next_item
        next_item["last_used_at"] = now.strftime("%Y-%m-%d %H:%M:%S")
        image_quota_unknown = bool(next_item.get("image_quota_unknown"))
        if success:
            next_item["success"] = _non_negative_int(next_item.get("success")) + 1
            if not image_quota_unknown:
                next_item["quota"] = max(0, _non_negative_int(next_item.get("quota")) - 1)
            if not image_quota_unknown and _non_negative_int(next_item.get("quota")) == 0:
                next_item["status"] = "限流"
                next_item["restore_at"] = next_item.get("restore_at") or None
            elif next_item.get("status") == "限流":
                next_item["status"] = "正常"
        else:
            next_item["fail"] = _non_negative_int(next_item.get("fail")) + 1
        next_item["updated_at"] = _iso(now)
        return next_item


class SQLAlchemyAuthKeyRepository(SQLAlchemyDatasetRepository, AuthKeyRepository):
    pass


class SQLAlchemyUserRepository(SQLAlchemyDatasetRepository, UserRepository):
    pass


class SQLAlchemySessionRepository(SQLAlchemyDatasetRepository, SessionRepository):
    pass


class SQLAlchemyRedeemCodeRepository(SQLAlchemyDatasetRepository, RedeemCodeRepository):
    def __init__(self, session_factory: sessionmaker[Session], definition: RepositoryDefinition):
        super().__init__(session_factory, definition)
        self._redeem_lock = Lock()

    def redeem(self, user_id: str, raw_code: str) -> tuple[dict[str, Any], dict[str, Any]]:
        normalized_user_id = _clean(user_id)
        code = _clean(raw_code).upper()
        if not normalized_user_id:
            raise ValueError("user not found")
        if not code:
            raise ValueError("redeem code is required")

        with self._redeem_lock:
            with self._session_factory() as session:
                with session.begin():
                    user = self._locked_user(session, normalized_user_id)
                    if user is None:
                        raise ValueError("user not found")

                    row = self._locked_row_by_code(session, code)
                    if row is None:
                        raise ValueError("redeem code is invalid")

                    item = self._row_item(row)
                    used_by = item.get("used_by") if isinstance(item.get("used_by"), list) else []
                    if any(
                        isinstance(entry, dict) and _clean(entry.get("user_id")) == normalized_user_id
                        for entry in used_by
                    ):
                        raise ValueError("redeem code has already been used by this user")

                    if item.get("status") != "enabled":
                        raise ValueError("redeem code is disabled")
                    expires_at = _parse_iso(item.get("expires_at"))
                    if expires_at and expires_at < _now_utc():
                        raise ValueError("redeem code is expired")

                    max_uses = _positive_int(item.get("max_uses"), 1)
                    used_count = max(_non_negative_int(item.get("used_count")), len(used_by))
                    if used_count >= max_uses:
                        raise ValueError("redeem code has been used")

                    quota = _positive_int(item.get("quota") or item.get("amount"), 1)
                    now = _now_utc()
                    user_data = self._user_item(user)
                    next_quota = _non_negative_int(user_data.get("quota")) + quota
                    user_data["quota"] = next_quota
                    user_data["updated_at"] = _iso(now)
                    user.quota = next_quota
                    user.data = user_data

                    used_by = list(used_by)
                    used_by.append(
                        {
                            "user_id": user_data.get("id"),
                            "email": user_data.get("email"),
                            "quota": quota,
                            "used_at": _iso(now),
                        }
                    )
                    item["used_by"] = used_by
                    item["used_count"] = used_count + 1
                    if item["used_count"] >= max_uses:
                        item["status"] = "disabled"
                    self._apply_item_to_row(row, item)
                    return dict(user_data), dict(item)

    def _locked_user(self, session: Session, user_id: str) -> UserRow | None:
        statement = select(UserRow).where(UserRow.user_id == user_id).execution_options(populate_existing=True)
        if session.get_bind().dialect.name == "postgresql":
            statement = statement.with_for_update()
        return session.execute(statement).scalar_one_or_none()

    def _locked_row_by_code(self, session: Session, code: str) -> RedeemCodeRow | None:
        statement = select(RedeemCodeRow).where(RedeemCodeRow.code == code).execution_options(populate_existing=True)
        if session.get_bind().dialect.name == "postgresql":
            statement = statement.with_for_update()
        return session.execute(statement).scalar_one_or_none()

    @staticmethod
    def _user_item(row: UserRow) -> dict[str, Any]:
        item = _data_copy(row.data)
        item.setdefault("id", row.user_id)
        item.setdefault("email", row.email)
        item.setdefault("role", row.role or "user")
        item.setdefault("status", row.status or "active")
        item.setdefault("quota", int(row.quota or 0))
        item.setdefault("quota_used", int(row.quota_used or 0))
        return item

    @staticmethod
    def _row_item(row: RedeemCodeRow) -> dict[str, Any]:
        item = _data_copy(row.data)
        item.setdefault("id", row.redeem_id)
        item.setdefault("code", row.code)
        item.setdefault("status", row.status or "enabled")
        item.setdefault("used_count", _non_negative_int(row.used_count))
        item.setdefault("max_uses", _positive_int(row.max_uses))
        return item


class SQLAlchemyChannelRepository(SQLAlchemyDatasetRepository, ChannelRepository):
    pass


class SQLAlchemyPromptRepository(SQLAlchemyDatasetRepository, PromptRepository):
    pass


class SQLAlchemyImageRecordRepository(SQLAlchemyDatasetRepository, ImageRecordRepository):
    def replace_all(self, items: list[dict[str, Any]]) -> None:
        super().replace_all([self._normalize_record(item) for item in items])

    def upsert(self, item: dict[str, Any]) -> None:
        super().upsert(self._normalize_record(item))

    def insert(self, item: dict[str, Any]) -> None:
        normalized = self._normalize_record(item)
        with self._session_factory() as session:
            with session.begin():
                row = ImageRecordRow()
                row.position = self._next_position(session)
                self._apply_item_to_row(row, normalized)
                session.add(row)

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
        conditions = self._filter_conditions(
            start_date=start_date,
            end_date=end_date,
            owner_user_id=owner_user_id,
            channel=channel,
            request_id=request_id,
        )
        with self._session_factory() as session:
            total = int(
                session.execute(
                    select(func.count()).select_from(ImageRecordRow).where(*conditions)
                ).scalar_one()
            )
            page_count = max(1, (total + normalized_page_size - 1) // normalized_page_size)
            safe_page = min(normalized_page, page_count)
            rows = session.execute(
                select(ImageRecordRow)
                .where(*conditions)
                .order_by(ImageRecordRow.created_at.desc(), ImageRecordRow.id.desc())
                .offset((safe_page - 1) * normalized_page_size)
                .limit(normalized_page_size)
            ).scalars()
            return {
                "items": [self._row_item(row) for row in rows],
                "total": total,
                "page": safe_page,
                "page_size": normalized_page_size,
                "page_count": page_count,
            }

    def _normalize_record(self, item: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(item, dict):
            return item
        normalized = dict(item)
        record_id = _clean(normalized.get("record_id") or normalized.get("id")) or uuid.uuid4().hex
        normalized["id"] = record_id
        normalized["record_id"] = record_id
        return normalized

    def _next_position(self, session: Session) -> int:
        current = session.execute(select(func.max(ImageRecordRow.position))).scalar_one()
        return int(current or 0) + 1

    def _filter_conditions(
        self,
        *,
        start_date: str,
        end_date: str,
        owner_user_id: str,
        channel: str,
        request_id: str,
    ) -> list[Any]:
        conditions: list[Any] = []
        normalized_owner = _clean(owner_user_id)
        normalized_channel = _clean(channel)
        normalized_request_id = _clean(request_id)
        normalized_start = _clean(start_date)
        normalized_end = _clean(end_date)
        if normalized_owner:
            conditions.append(ImageRecordRow.owner_user_id == normalized_owner)
        if normalized_channel:
            conditions.append(ImageRecordRow.channel == normalized_channel)
        if normalized_request_id:
            conditions.append(ImageRecordRow.request_id == normalized_request_id)
        if normalized_start:
            conditions.append(ImageRecordRow.created_at >= normalized_start)
        if normalized_end:
            conditions.append(ImageRecordRow.created_at < _next_day_text(normalized_end))
        return conditions

    @staticmethod
    def _row_item(row: ImageRecordRow) -> dict[str, Any]:
        item = _data_copy(row.data)
        record_id = _clean(item.get("record_id") or item.get("id") or row.record_id)
        if record_id:
            item.setdefault("id", record_id)
            item.setdefault("record_id", record_id)
        item.setdefault("owner_user_id", row.owner_user_id or "")
        item.setdefault("created_at", row.created_at or "")
        item.setdefault("channel", row.channel or "")
        item.setdefault("request_id", row.request_id or "")
        return item


class SQLAlchemyQuotaReservationRepository(QuotaReservationRepository):
    dataset_name = "quota_reservations"

    def __init__(self, session_factory: sessionmaker[Session]):
        self._session_factory = session_factory

    def reserve(self, user_id: str, amount: int, request_id: str, *, ttl_seconds: int = 900) -> dict[str, Any]:
        normalized_user_id = _clean(user_id)
        normalized_request_id = _clean(request_id)
        normalized_amount = int(amount or 0)
        if not normalized_user_id:
            raise ValueError("user id is required")
        if not normalized_request_id:
            raise ValueError("request id is required")
        if normalized_amount <= 0:
            raise ValueError("quota amount must be positive")

        try:
            with self._session_factory() as session:
                with session.begin():
                    self._expire_in_session(session)
                    existing = self._get_by_request_id(session, normalized_request_id)
                    if existing is not None:
                        return self._to_item(existing)

                    user = session.execute(
                        select(UserRow).where(UserRow.user_id == normalized_user_id)
                    ).scalar_one_or_none()
                    if user is None:
                        raise ValueError("user not found")
                    user_data = _data_copy(user.data)
                    role = _clean(user.role or user_data.get("role")) or "user"
                    if role == "admin":
                        raise ValueError("admin quota does not require reservation")
                    status = _clean(user.status or user_data.get("status")) or "active"
                    if status != "active":
                        raise ValueError("user is disabled")
                    user_changed = False
                    if user.quota is None:
                        user.quota = max(0, int(user_data.get("quota") or 0))
                        user_changed = True
                    if not user.role:
                        user.role = role
                        user_changed = True
                    if not user.status:
                        user.status = status
                        user_changed = True
                    if user_changed:
                        session.flush()

                    result = session.execute(
                        update(UserRow)
                        .where(UserRow.user_id == normalized_user_id)
                        .where(UserRow.role != "admin")
                        .where(UserRow.status == "active")
                        .where(UserRow.quota >= normalized_amount)
                        .values(quota=UserRow.quota - normalized_amount)
                    )
                    if int(result.rowcount or 0) != 1:
                        raise ValueError("insufficient image quota")

                    session.refresh(user)
                    now = _now_utc()
                    expires_at = now + timedelta(seconds=max(1, int(ttl_seconds or 900)))
                    self._set_user_data(user, quota=int(user.quota or 0), now=now)
                    reservation = self._new_row(
                        user_id=normalized_user_id,
                        request_id=normalized_request_id,
                        amount=normalized_amount,
                        status="reserved",
                        created_at=now,
                        expires_at=expires_at,
                    )
                    session.add(reservation)
                    session.flush()
                    return self._to_item(reservation)
        except IntegrityError:
            with self._session_factory() as session:
                existing = self._get_by_request_id(session, normalized_request_id)
                if existing is not None:
                    return self._to_item(existing)
            raise

    def confirm(self, request_id: str, *, amount: int | None = None) -> dict[str, Any] | None:
        normalized_request_id = _clean(request_id)
        if not normalized_request_id:
            return None
        with self._session_factory() as session:
            with session.begin():
                reservation = self._get_by_request_id(session, normalized_request_id)
                if reservation is None:
                    return None
                if reservation.status != "reserved":
                    return self._to_item(reservation)

                now = _now_utc()
                reserved_amount = max(0, int(reservation.amount or 0))
                confirmed_amount = reserved_amount if amount is None else max(0, min(int(amount or 0), reserved_amount))
                refund_amount = max(0, reserved_amount - confirmed_amount)
                user = session.execute(
                    select(UserRow).where(UserRow.user_id == reservation.user_id)
                ).scalar_one_or_none()
                if user is not None:
                    user_data = _data_copy(user.data)
                    next_quota = int(user.quota if user.quota is not None else user_data.get("quota") or 0) + refund_amount
                    next_used = int(user.quota_used if user.quota_used is not None else user_data.get("quota_used") or 0) + confirmed_amount
                    self._set_user_data(user, quota=next_quota, quota_used=next_used, now=now)

                data = self._to_item(reservation)
                data.update(
                    {
                        "status": "confirmed",
                        "confirmed_at": _iso(now),
                        "confirmed_amount": confirmed_amount,
                        "released_amount": refund_amount,
                    }
                )
                reservation.status = "confirmed"
                reservation.data = data
                return self._to_item(reservation)

    def release(self, request_id: str) -> dict[str, Any] | None:
        normalized_request_id = _clean(request_id)
        if not normalized_request_id:
            return None
        with self._session_factory() as session:
            with session.begin():
                reservation = self._get_by_request_id(session, normalized_request_id)
                if reservation is None:
                    return None
                if reservation.status != "reserved":
                    return self._to_item(reservation)
                now = _now_utc()
                self._refund_reserved_quota(session, reservation, now=now)
                data = self._to_item(reservation)
                data.update({"status": "released", "released_at": _iso(now)})
                reservation.status = "released"
                reservation.data = data
                return self._to_item(reservation)

    def expire(self) -> int:
        with self._session_factory() as session:
            with session.begin():
                return self._expire_in_session(session)

    def list(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            rows = session.execute(
                select(QuotaReservationRow).order_by(QuotaReservationRow.id.asc())
            ).scalars()
            return [self._to_item(row) for row in rows]

    def count(self) -> int:
        with self._session_factory() as session:
            return int(session.execute(select(func.count()).select_from(QuotaReservationRow)).scalar_one())

    def _expire_in_session(self, session: Session) -> int:
        now = _now_utc()
        rows = list(
            session.execute(
                select(QuotaReservationRow).where(QuotaReservationRow.status == "reserved")
            ).scalars()
        )
        expired = 0
        for row in rows:
            expires_at = _parse_iso(row.expires_at)
            if expires_at is None or expires_at > now:
                continue
            self._refund_reserved_quota(session, row, now=now)
            data = self._to_item(row)
            data.update({"status": "expired", "expired_at": _iso(now)})
            row.status = "expired"
            row.data = data
            expired += 1
        return expired

    def _refund_reserved_quota(self, session: Session, reservation: QuotaReservationRow, *, now: datetime) -> None:
        amount = max(0, int(reservation.amount or 0))
        if amount <= 0:
            return
        user = session.execute(
            select(UserRow).where(UserRow.user_id == reservation.user_id)
        ).scalar_one_or_none()
        if user is None:
            return
        user_data = _data_copy(user.data)
        next_quota = int(user.quota if user.quota is not None else user_data.get("quota") or 0) + amount
        self._set_user_data(user, quota=next_quota, now=now)

    def _get_by_request_id(self, session: Session, request_id: str) -> QuotaReservationRow | None:
        return session.execute(
            select(QuotaReservationRow).where(QuotaReservationRow.request_id == request_id)
        ).scalar_one_or_none()

    def _new_row(
        self,
        *,
        user_id: str,
        request_id: str,
        amount: int,
        status: str,
        created_at: datetime,
        expires_at: datetime,
    ) -> QuotaReservationRow:
        item = {
            "id": uuid.uuid4().hex,
            "user_id": user_id,
            "request_id": request_id,
            "amount": amount,
            "status": status,
            "created_at": _iso(created_at),
            "expires_at": _iso(expires_at),
        }
        return QuotaReservationRow(
            reservation_id=str(item["id"]),
            user_id=user_id,
            request_id=request_id,
            amount=amount,
            status=status,
            created_at=str(item["created_at"]),
            expires_at=str(item["expires_at"]),
            data=item,
        )

    @staticmethod
    def _set_user_data(
        user: UserRow,
        *,
        quota: int,
        now: datetime,
        quota_used: int | None = None,
    ) -> None:
        data = _data_copy(user.data)
        user.quota = max(0, int(quota))
        data["quota"] = user.quota
        if quota_used is not None:
            user.quota_used = max(0, int(quota_used))
            data["quota_used"] = user.quota_used
        data["updated_at"] = _iso(now)
        user.data = data

    @staticmethod
    def _to_item(row: QuotaReservationRow) -> dict[str, Any]:
        data = _data_copy(row.data)
        if not data:
            data = {}
        data.setdefault("id", row.reservation_id)
        data.setdefault("user_id", row.user_id)
        data.setdefault("request_id", row.request_id)
        data.setdefault("amount", int(row.amount or 0))
        data.setdefault("status", row.status)
        data.setdefault("created_at", row.created_at)
        data.setdefault("expires_at", row.expires_at)
        return data


class SQLAlchemySystemConfigRepository(SystemConfigRepository):
    def __init__(self, session_factory: sessionmaker[Session]):
        self._session_factory = session_factory

    def list_settings(self) -> dict[str, Any]:
        with self._session_factory() as session:
            rows = session.execute(select(SystemSettingRow).order_by(SystemSettingRow.setting_key.asc())).scalars()
            settings: dict[str, Any] = {}
            for row in rows:
                payload = _data_copy(row.data)
                settings[str(row.setting_key)] = payload.get("value")
            return settings

    def get_setting(self, key: str, default: Any = None) -> Any:
        normalized_key = _clean(key)
        if not normalized_key:
            return default
        with self._session_factory() as session:
            row = session.get(SystemSettingRow, normalized_key)
            if row is None:
                return default
            return _data_copy(row.data).get("value", default)

    def set_setting(self, key: str, value: Any) -> None:
        normalized_key = _clean(key)
        if not normalized_key:
            raise ValueError("setting key is required")
        now = _iso(_now_utc())
        with self._session_factory() as session:
            with session.begin():
                row = session.get(SystemSettingRow, normalized_key)
                if row is None:
                    row = SystemSettingRow(setting_key=normalized_key, updated_at=now, data={})
                    session.add(row)
                row.updated_at = now
                row.data = {"value": value}

    def delete_setting(self, key: str) -> bool:
        normalized_key = _clean(key)
        if not normalized_key:
            return False
        with self._session_factory() as session:
            with session.begin():
                result = session.execute(
                    delete(SystemSettingRow).where(SystemSettingRow.setting_key == normalized_key)
                )
            return bool(result.rowcount)


class SQLAlchemySystemLogRepository(SystemLogRepository):
    dataset_name = "system_logs"

    def __init__(self, session_factory: sessionmaker[Session]):
        self._session_factory = session_factory

    def add(self, item: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalize_item(item)
        with self._session_factory() as session:
            with session.begin():
                row = SystemLogRow(
                    log_id=str(normalized["id"]),
                    request_id=_clean(normalized.get("request_id")) or None,
                    type=_clean(normalized.get("type")) or None,
                    time=str(normalized["time"]),
                    summary=_clean(normalized.get("summary")) or None,
                    data=normalized,
                )
                session.add(row)
        return dict(normalized)

    def list(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            rows = session.execute(select(SystemLogRow).order_by(SystemLogRow.id.asc())).scalars()
            return [self._to_item(row) for row in rows]

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
        normalized_page, normalized_page_size = _normalize_page(page, page_size)
        normalized_status = _clean(status)
        conditions = self._filter_conditions(
            type=type,
            start_date=start_date,
            end_date=end_date,
            request_id=request_id,
        )
        with self._session_factory() as session:
            if normalized_status:
                rows = session.execute(
                    select(SystemLogRow)
                    .where(*conditions)
                    .order_by(SystemLogRow.time.desc(), SystemLogRow.id.desc())
                ).scalars()
                filtered_items = [
                    item
                    for item in (self._to_item(row) for row in rows)
                    if self._item_status(item) == normalized_status
                ]
                total = len(filtered_items)
                page_count = max(1, (total + normalized_page_size - 1) // normalized_page_size)
                safe_page = min(normalized_page, page_count)
                start = (safe_page - 1) * normalized_page_size
                return {
                    "items": filtered_items[start:start + normalized_page_size],
                    "total": total,
                    "page": safe_page,
                    "page_size": normalized_page_size,
                    "page_count": page_count,
                }
            total = int(
                session.execute(
                    select(func.count()).select_from(SystemLogRow).where(*conditions)
                ).scalar_one()
            )
            page_count = max(1, (total + normalized_page_size - 1) // normalized_page_size)
            safe_page = min(normalized_page, page_count)
            rows = session.execute(
                select(SystemLogRow)
                .where(*conditions)
                .order_by(SystemLogRow.time.desc(), SystemLogRow.id.desc())
                .offset((safe_page - 1) * normalized_page_size)
                .limit(normalized_page_size)
            ).scalars()
            return {
                "items": [self._to_item(row) for row in rows],
                "total": total,
                "page": safe_page,
                "page_size": normalized_page_size,
                "page_count": page_count,
            }

    def count(self) -> int:
        with self._session_factory() as session:
            return int(session.execute(select(func.count()).select_from(SystemLogRow)).scalar_one())

    @staticmethod
    def _normalize_item(item: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(item or {})
        log_id = _clean(normalized.get("id") or normalized.get("log_id")) or uuid.uuid4().hex
        normalized["id"] = log_id
        normalized["log_id"] = log_id
        normalized["time"] = _clean(normalized.get("time")) or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        normalized["type"] = _clean(normalized.get("type")) or "log"
        normalized["summary"] = _clean(normalized.get("summary"))
        detail = normalized.get("detail")
        normalized["detail"] = dict(detail) if isinstance(detail, dict) else {}
        request_id = _clean(normalized.get("request_id") or normalized["detail"].get("request_id"))
        if request_id:
            normalized["request_id"] = request_id
            normalized["detail"].setdefault("request_id", request_id)
        return normalized

    @staticmethod
    def _filter_conditions(
        *,
        type: str,
        start_date: str,
        end_date: str,
        request_id: str,
    ) -> list[Any]:
        conditions: list[Any] = []
        normalized_type = _clean(type)
        normalized_request_id = _clean(request_id)
        normalized_start = _clean(start_date)
        normalized_end = _clean(end_date)
        if normalized_type:
            conditions.append(SystemLogRow.type == normalized_type)
        if normalized_request_id:
            conditions.append(SystemLogRow.request_id == normalized_request_id)
        if normalized_start:
            conditions.append(SystemLogRow.time >= normalized_start)
        if normalized_end:
            conditions.append(SystemLogRow.time < _next_day_text(normalized_end))
        return conditions

    @staticmethod
    def _to_item(row: SystemLogRow) -> dict[str, Any]:
        item = _data_copy(row.data)
        item.setdefault("id", row.log_id)
        item.setdefault("log_id", row.log_id)
        item.setdefault("time", row.time or "")
        item.setdefault("type", row.type or "log")
        item.setdefault("summary", row.summary or "")
        item.setdefault("request_id", row.request_id or "")
        detail = item.get("detail")
        if not isinstance(detail, dict):
            item["detail"] = {}
        if row.request_id:
            item["detail"].setdefault("request_id", row.request_id)
        return item

    @staticmethod
    def _item_status(item: dict[str, Any]) -> str:
        detail = item.get("detail")
        detail_status = detail.get("status") if isinstance(detail, dict) else ""
        return _clean(item.get("status") or detail_status)


class SQLAlchemyAuditLogRepository(AuditLogRepository):
    dataset_name = "audit_logs"

    def __init__(self, session_factory: sessionmaker[Session]):
        self._session_factory = session_factory

    def add(self, item: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalize_item(item)
        with self._session_factory() as session:
            with session.begin():
                row = AuditLogRow(
                    audit_id=str(normalized["id"]),
                    request_id=_clean(normalized.get("request_id")) or None,
                    time=str(normalized["time"]),
                    actor_id=_clean(normalized.get("actor_id")) or None,
                    actor_role=_clean(normalized.get("actor_role")) or None,
                    action=_clean(normalized.get("action")) or None,
                    resource=_clean(normalized.get("resource")) or None,
                    target_id=_clean(normalized.get("target_id")) or None,
                    status=_clean(normalized.get("status")) or None,
                    data=normalized,
                )
                session.add(row)
        return dict(normalized)

    def list(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            rows = session.execute(select(AuditLogRow).order_by(AuditLogRow.id.asc())).scalars()
            return [self._to_item(row) for row in rows]

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
        normalized_page, normalized_page_size = _normalize_page(page, page_size)
        conditions = self._filter_conditions(
            action=action,
            resource=resource,
            start_date=start_date,
            end_date=end_date,
            request_id=request_id,
        )
        with self._session_factory() as session:
            total = int(
                session.execute(
                    select(func.count()).select_from(AuditLogRow).where(*conditions)
                ).scalar_one()
            )
            page_count = max(1, (total + normalized_page_size - 1) // normalized_page_size)
            safe_page = min(normalized_page, page_count)
            rows = session.execute(
                select(AuditLogRow)
                .where(*conditions)
                .order_by(AuditLogRow.time.desc(), AuditLogRow.id.desc())
                .offset((safe_page - 1) * normalized_page_size)
                .limit(normalized_page_size)
            ).scalars()
            return {
                "items": [self._to_item(row) for row in rows],
                "total": total,
                "page": safe_page,
                "page_size": normalized_page_size,
                "page_count": page_count,
            }

    def count(self) -> int:
        with self._session_factory() as session:
            return int(session.execute(select(func.count()).select_from(AuditLogRow)).scalar_one())

    @staticmethod
    def _normalize_item(item: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(item or {})
        audit_id = _clean(normalized.get("id") or normalized.get("audit_id")) or uuid.uuid4().hex
        normalized["id"] = audit_id
        normalized["audit_id"] = audit_id
        normalized["time"] = _clean(normalized.get("time")) or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        normalized["actor_id"] = _clean(normalized.get("actor_id"))
        normalized["actor_name"] = _clean(normalized.get("actor_name"))
        normalized["actor_role"] = _clean(normalized.get("actor_role"))
        normalized["action"] = _clean(normalized.get("action"))
        normalized["resource"] = _clean(normalized.get("resource"))
        normalized["target_id"] = _clean(normalized.get("target_id"))
        normalized["status"] = _clean(normalized.get("status")) or "success"
        normalized["type"] = "audit"
        normalized["summary"] = normalized["action"]
        detail = normalized.get("detail")
        normalized["detail"] = dict(detail) if isinstance(detail, dict) else {}
        request_id = _clean(normalized.get("request_id") or normalized["detail"].get("request_id"))
        if request_id:
            normalized["request_id"] = request_id
            normalized["detail"].setdefault("request_id", request_id)
        return normalized

    @staticmethod
    def _filter_conditions(
        *,
        action: str,
        resource: str,
        start_date: str,
        end_date: str,
        request_id: str,
    ) -> list[Any]:
        conditions: list[Any] = []
        normalized_action = _clean(action)
        normalized_resource = _clean(resource)
        normalized_request_id = _clean(request_id)
        normalized_start = _clean(start_date)
        normalized_end = _clean(end_date)
        if normalized_action:
            conditions.append(AuditLogRow.action == normalized_action)
        if normalized_resource:
            conditions.append(AuditLogRow.resource == normalized_resource)
        if normalized_request_id:
            conditions.append(AuditLogRow.request_id == normalized_request_id)
        if normalized_start:
            conditions.append(AuditLogRow.time >= normalized_start)
        if normalized_end:
            conditions.append(AuditLogRow.time < _next_day_text(normalized_end))
        return conditions

    @staticmethod
    def _to_item(row: AuditLogRow) -> dict[str, Any]:
        item = _data_copy(row.data)
        item.setdefault("id", row.audit_id)
        item.setdefault("audit_id", row.audit_id)
        item.setdefault("time", row.time or "")
        item.setdefault("request_id", row.request_id or "")
        item.setdefault("actor_id", row.actor_id or "")
        item.setdefault("actor_role", row.actor_role or "")
        item.setdefault("action", row.action or "")
        item.setdefault("resource", row.resource or "")
        item.setdefault("target_id", row.target_id or "")
        item.setdefault("status", row.status or "success")
        item.setdefault("type", "audit")
        item.setdefault("summary", item.get("action") or "")
        detail = item.get("detail")
        if not isinstance(detail, dict):
            item["detail"] = {}
        if row.request_id:
            item["detail"].setdefault("request_id", row.request_id)
        return item


class MemorySystemConfigRepository(SystemConfigRepository):
    def __init__(self):
        self._settings: dict[str, Any] = {}

    def list_settings(self) -> dict[str, Any]:
        return dict(self._settings)

    def get_setting(self, key: str, default: Any = None) -> Any:
        return self._settings.get(key, default)

    def set_setting(self, key: str, value: Any) -> None:
        self._settings[str(key)] = value

    def delete_setting(self, key: str) -> bool:
        return self._settings.pop(str(key), None) is not None


class SQLAlchemyRepositoryProvider(RepositoryProvider):
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.engine = create_engine(
            database_url,
            pool_pre_ping=True,
            pool_recycle=3600,
            future=True,
        )
        Base.metadata.create_all(self.engine)
        self._ensure_legacy_tables_have_columns()
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False, future=True)
        self._accounts = SQLAlchemyAccountRepository(self.Session, DEFINITIONS["accounts"])
        self._auth_keys = SQLAlchemyAuthKeyRepository(self.Session, DEFINITIONS["auth_keys"])
        self._users = SQLAlchemyUserRepository(self.Session, DEFINITIONS["users"])
        self._sessions = SQLAlchemySessionRepository(self.Session, DEFINITIONS["sessions"])
        self._redeem_codes = SQLAlchemyRedeemCodeRepository(self.Session, DEFINITIONS["redeem_codes"])
        self._channels = SQLAlchemyChannelRepository(self.Session, DEFINITIONS["channels"])
        self._prompts = SQLAlchemyPromptRepository(self.Session, DEFINITIONS["prompt_library"])
        self._image_records = SQLAlchemyImageRecordRepository(self.Session, DEFINITIONS["image_records"])
        self._quota_reservations = SQLAlchemyQuotaReservationRepository(self.Session)
        self._system_config = SQLAlchemySystemConfigRepository(self.Session)
        self._system_logs = SQLAlchemySystemLogRepository(self.Session)
        self._audit_logs = SQLAlchemyAuditLogRepository(self.Session)
        self._stamp_schema_version()

    @property
    def accounts(self) -> AccountRepository:
        return self._accounts

    @property
    def auth_keys(self) -> AuthKeyRepository:
        return self._auth_keys

    @property
    def users(self) -> UserRepository:
        return self._users

    @property
    def sessions(self) -> SessionRepository:
        return self._sessions

    @property
    def redeem_codes(self) -> RedeemCodeRepository:
        return self._redeem_codes

    @property
    def channels(self) -> ChannelRepository:
        return self._channels

    @property
    def prompts(self) -> PromptRepository:
        return self._prompts

    @property
    def image_records(self) -> ImageRecordRepository:
        return self._image_records

    @property
    def quota_reservations(self) -> QuotaReservationRepository:
        return self._quota_reservations

    @property
    def system_config(self) -> SystemConfigRepository:
        return self._system_config

    @property
    def system_logs(self) -> SystemLogRepository:
        return self._system_logs

    @property
    def audit_logs(self) -> AuditLogRepository:
        return self._audit_logs

    def repositories(self) -> tuple[Any, ...]:
        return (
            self.accounts,
            self.auth_keys,
            self.users,
            self.sessions,
            self.redeem_codes,
            self.channels,
            self.prompts,
            self.image_records,
            self.quota_reservations,
            self.system_logs,
            self.audit_logs,
        )

    def health_check(self) -> dict[str, Any]:
        try:
            with self.Session() as session:
                session.execute(text("SELECT 1"))
                migrations = [
                    str(row.version)
                    for row in session.execute(
                        select(SchemaMigrationRow).order_by(SchemaMigrationRow.applied_at.asc())
                    ).scalars()
                ]
            counts = {f"{repo.dataset_name}_count": repo.count() for repo in self.repositories()}
            return {
                "status": "healthy",
                "backend": "database",
                "db_type": self._db_type(),
                "database_url": self._mask_password(self.database_url),
                "schema_version": SCHEMA_VERSION,
                "migration_version": SCHEMA_VERSION,
                "schema_migrations": migrations,
                "available_image_accounts_count": self._available_image_accounts_count(),
                **counts,
            }
        except Exception as exc:
            return {
                "status": "unhealthy",
                "backend": "database",
                "db_type": self._db_type(),
                "error": str(exc),
            }

    def get_backend_info(self) -> dict[str, Any]:
        return {
            "type": "database",
            "db_type": self._db_type(),
            "description": f"数据库存储 ({self._db_type()})",
            "database_url": self._mask_password(self.database_url),
            "repository": "sqlalchemy",
            "schema_version": SCHEMA_VERSION,
            "migration_version": SCHEMA_VERSION,
        }

    def _available_image_accounts_count(self) -> int:
        now = _now_utc()
        count = 0
        for item in self.accounts.list():
            if not isinstance(item, dict):
                continue
            account = _reset_expired_account_lease(dict(item), now)
            if not _is_image_account_available(account):
                continue
            if _non_negative_int(account.get("inflight_count")) < _positive_int(account.get("max_concurrency"), 1):
                count += 1
        return count

    def _stamp_schema_version(self) -> None:
        with self.Session() as session:
            with session.begin():
                current = session.get(SchemaMigrationRow, SCHEMA_VERSION)
                if current is None:
                    session.add(
                        SchemaMigrationRow(
                            version=SCHEMA_VERSION,
                            applied_at=datetime.now(timezone.utc).isoformat(),
                        )
                    )

    def _ensure_legacy_tables_have_columns(self) -> None:
        inspector = inspect(self.engine)
        existing_tables = set(inspector.get_table_names())
        column_specs = _column_specs()
        preparer = self.engine.dialect.identifier_preparer
        with self.engine.begin() as connection:
            for table_name, specs in column_specs.items():
                if table_name not in existing_tables:
                    continue
                existing_columns = {
                    column["name"]
                    for column in inspector.get_columns(table_name)
                }
                for column_name, sql_type in specs.items():
                    if column_name in existing_columns:
                        continue
                    connection.execute(
                        text(
                            f"ALTER TABLE {preparer.quote(table_name)} "
                            f"ADD COLUMN {preparer.quote(column_name)} {sql_type}"
                        )
                    )

    def _db_type(self) -> str:
        url = self.database_url.lower()
        if "sqlite" in url:
            return "sqlite"
        if "postgresql" in url or "postgres" in url:
            return "postgresql"
        if "mysql" in url:
            return "mysql"
        return "unknown"

    @staticmethod
    def _mask_password(url: str) -> str:
        if "://" not in url:
            return url
        try:
            protocol, rest = url.split("://", 1)
            if "@" in rest:
                credentials, host = rest.split("@", 1)
                if ":" in credentials:
                    username, _ = credentials.split(":", 1)
                    return f"{protocol}://{username}:****@{host}"
            return url
        except Exception:
            return url


def _column_specs() -> dict[str, dict[str, str]]:
    return {
        "accounts": {
            "position": "INTEGER",
            "access_token_hash": "VARCHAR(64)",
            "status": "VARCHAR(64)",
            "quota": "INTEGER",
            "leased_until": "VARCHAR(80)",
            "lease_owner": "VARCHAR(255)",
            "inflight_count": "INTEGER DEFAULT 0",
            "max_concurrency": "INTEGER DEFAULT 1",
            "updated_at": "VARCHAR(80)",
        },
        "auth_keys": {
            "position": "INTEGER",
            "key_id": "VARCHAR(255)",
            "key_hash": "VARCHAR(255)",
            "role": "VARCHAR(32)",
            "enabled": "BOOLEAN",
        },
        "users": {
            "position": "INTEGER",
            "user_id": "VARCHAR(255)",
            "email": "VARCHAR(320)",
            "role": "VARCHAR(32)",
            "status": "VARCHAR(32)",
            "quota": "INTEGER",
            "quota_used": "INTEGER",
        },
        "sessions": {
            "position": "INTEGER",
            "session_id": "VARCHAR(255)",
            "token_hash": "VARCHAR(255)",
            "user_id": "VARCHAR(255)",
            "expires_at": "VARCHAR(80)",
        },
        "quota_reservations": {
            "reservation_id": "VARCHAR(255)",
            "user_id": "VARCHAR(255)",
            "request_id": "VARCHAR(255)",
            "amount": "INTEGER",
            "status": "VARCHAR(32)",
            "created_at": "VARCHAR(80)",
            "expires_at": "VARCHAR(80)",
        },
        "redeem_codes": {
            "position": "INTEGER",
            "redeem_id": "VARCHAR(255)",
            "code": "VARCHAR(255)",
            "status": "VARCHAR(32)",
            "used_count": "INTEGER",
            "max_uses": "INTEGER",
        },
        "channels": {
            "position": "INTEGER",
            "channel_id": "VARCHAR(255)",
            "enabled": "BOOLEAN",
            "priority": "INTEGER",
            "weight": "INTEGER",
        },
        "prompt_library": {
            "position": "INTEGER",
            "prompt_id": "VARCHAR(255)",
            "category": "VARCHAR(255)",
            "quick_access": "BOOLEAN",
        },
        "image_records": {
            "position": "INTEGER",
            "record_id": "VARCHAR(255)",
            "owner_user_id": "VARCHAR(255)",
            "created_at": "VARCHAR(80)",
            "channel": "VARCHAR(255)",
            "request_id": "VARCHAR(255)",
        },
        "system_settings": {
            "updated_at": "VARCHAR(80)",
        },
        "system_logs": {
            "log_id": "VARCHAR(255)",
            "request_id": "VARCHAR(255)",
            "type": "VARCHAR(64)",
            "time": "VARCHAR(80)",
            "summary": "TEXT",
        },
        "audit_logs": {
            "audit_id": "VARCHAR(255)",
            "request_id": "VARCHAR(255)",
            "time": "VARCHAR(80)",
            "actor_id": "VARCHAR(255)",
            "actor_role": "VARCHAR(32)",
            "action": "VARCHAR(255)",
            "resource": "VARCHAR(255)",
            "target_id": "VARCHAR(255)",
            "status": "VARCHAR(32)",
        },
    }
