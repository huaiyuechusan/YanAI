from __future__ import annotations

from datetime import datetime
from pathlib import Path
import uuid
from urllib.parse import unquote, urlparse

from services.config import config
from services.observability import get_current_request_id
from services.repositories.base import ImageRecordRepository
from services.storage.base import StorageBackend


def _clean(value: object) -> str:
    return str(value or "").strip()


def _int_or_zero(value: object) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


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


def _record_to_item(record: dict[str, object], base_url: str) -> dict[str, object]:
    url = _clean(record.get("url"))
    parsed_path = urlparse(url).path
    record_id = _clean(record.get("record_id") or record.get("id"))
    name = Path(parsed_path).name or record_id or "image.png"
    size = _int_or_zero(record.get("size"))
    image_size = _clean(record.get("image_size"))
    if not image_size and record.get("size") is not None and size == 0:
        image_size = _clean(record.get("size"))
    if parsed_path.startswith("/images/"):
        local_path = config.images_dir / parsed_path.removeprefix("/images/")
        if local_path.exists() and local_path.is_file():
            size = local_path.stat().st_size
            if not url.startswith("http"):
                url = f"{base_url.rstrip('/')}{parsed_path}"
    created_at = _clean(record.get("created_at")) or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    day = created_at[:10]
    return {
        "id": record_id,
        "record_id": record_id,
        "name": name,
        "date": day,
        "size": size,
        "url": url,
        "created_at": created_at,
        "owner_user_id": record.get("owner_user_id"),
        "owner_name": record.get("owner_name"),
        "owner_email": record.get("owner_email"),
        "prompt": record.get("prompt"),
        "mode": record.get("mode"),
        "model": record.get("model"),
        "image_size": image_size,
        "channel": record.get("channel"),
        "request_id": record.get("request_id"),
        "quota_cost": _int_or_zero(record.get("quota_cost")),
    }


def _group_items(items: list[dict[str, object]]) -> list[dict[str, object]]:
    groups: dict[str, list[dict[str, object]]] = {}
    for item in items:
        groups.setdefault(str(item["date"]), []).append(item)
    return [{"date": key, "items": value} for key, value in groups.items()]


def _image_record_source() -> ImageRecordRepository | StorageBackend:
    get_repository_provider = getattr(config, "get_repository_provider", None)
    repositories = get_repository_provider() if callable(get_repository_provider) else None
    if repositories is not None:
        return repositories.image_records
    return config.get_storage_backend()


def _dedupe_text(values: list[str] | tuple[str, ...] | None) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values or []:
        normalized = _clean(value)
        if normalized and normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result


def _record_id(record: dict[str, object]) -> str:
    return _clean(record.get("record_id") or record.get("id"))


def _local_image_path_from_url(url: str) -> Path | None:
    parsed_path = unquote(urlparse(_clean(url)).path)
    if not parsed_path.startswith("/images/"):
        return None
    relative_path = parsed_path.removeprefix("/images/").strip("/")
    if not relative_path:
        return None
    root = config.images_dir.resolve()
    candidate = (root / relative_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


def _record_has_available_image(record: dict[str, object]) -> bool:
    url = _clean(record.get("url"))
    if not url:
        return False
    path = _local_image_path_from_url(url)
    if path is None:
        return True
    try:
        return path.is_file() and path.stat().st_size > 0
    except OSError:
        return False


def _record_matches_filters(
    record: dict[str, object],
    *,
    start_date: str,
    end_date: str,
    owner_user_id: str,
    channel: str,
    request_id: str,
) -> bool:
    created_at = _clean(record.get("created_at"))
    day = created_at[:10]
    if owner_user_id and _clean(record.get("owner_user_id")) != owner_user_id:
        return False
    if channel and _clean(record.get("channel")) != channel:
        return False
    if request_id and _clean(record.get("request_id")) != request_id:
        return False
    if start_date and day < start_date:
        return False
    if end_date and day > end_date:
        return False
    return True


def _paginated_image_response(
    items: list[dict[str, object]],
    *,
    page: int,
    page_size: int,
) -> dict[str, object]:
    items.sort(key=lambda item: str(item["created_at"]), reverse=True)
    total = len(items)
    page_count = max(1, (total + page_size - 1) // page_size)
    safe_page = min(page, page_count)
    start = (safe_page - 1) * page_size
    page_items = items[start:start + page_size]
    return {
        "items": page_items,
        "groups": _group_items(page_items),
        "pagination": {
            "page": safe_page,
            "page_size": page_size,
            "total": total,
            "page_count": page_count,
        },
    }


def _prune_empty_image_dirs(path: Path) -> None:
    root = config.images_dir.resolve()
    current = path.resolve()
    while current != root:
        try:
            current.relative_to(root)
        except ValueError:
            return
        try:
            current.rmdir()
        except OSError:
            return
        current = current.parent


def _delete_local_image_file(url: str) -> bool:
    path = _local_image_path_from_url(url)
    if path is None or not path.is_file():
        return False
    path.unlink()
    _prune_empty_image_dirs(path.parent)
    return True


def _list_files(base_url: str, start_date: str = "", end_date: str = "", seen_urls: set[str] | None = None) -> list[dict[str, object]]:
    config.cleanup_old_images()
    seen = seen_urls or set()
    items = []
    root = config.images_dir
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        parts = rel.split("/")
        stat = path.stat()
        if stat.st_size <= 0:
            continue
        day = "-".join(parts[:3]) if len(parts) >= 4 else datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d")
        if start_date and day < start_date:
            continue
        if end_date and day > end_date:
            continue
        url = f"{base_url.rstrip('/')}/images/{rel}"
        if url in seen:
            continue
        items.append({
            "name": path.name,
            "date": day,
            "size": stat.st_size,
            "url": url,
            "created_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
        })
    items.sort(key=lambda item: str(item["created_at"]), reverse=True)
    return items


def list_images(
    base_url: str,
    start_date: str = "",
    end_date: str = "",
    owner_user_id: str = "",
    channel: str = "",
    request_id: str = "",
    page: int = 1,
    page_size: int = 48,
) -> dict[str, object]:
    storage = _image_record_source()
    normalized_page, normalized_page_size = _normalize_page(page, page_size)
    normalized_start_date = start_date.strip()
    normalized_end_date = end_date.strip()
    normalized_owner_user_id = owner_user_id.strip()
    normalized_channel = channel.strip()
    normalized_request_id = request_id.strip()
    try:
        if isinstance(storage, ImageRecordRepository):
            records = storage.list()
        else:
            records = storage.load_image_records()
    except Exception:
        records = []
    items = []
    for record in records:
        if not isinstance(record, dict):
            continue
        if not _record_has_available_image(record):
            continue
        if not _record_matches_filters(
            record,
            start_date=normalized_start_date,
            end_date=normalized_end_date,
            owner_user_id=normalized_owner_user_id,
            channel=normalized_channel,
            request_id=normalized_request_id,
        ):
            continue
        items.append(_record_to_item(record, base_url))
    seen_urls = {str(item.get("url") or "") for item in items}
    if not normalized_owner_user_id:
        items.extend(_list_files(base_url, normalized_start_date, normalized_end_date, seen_urls))
    return _paginated_image_response(items, page=normalized_page, page_size=normalized_page_size)


def delete_images(
    *,
    record_ids: list[str] | tuple[str, ...] | None = None,
    urls: list[str] | tuple[str, ...] | None = None,
) -> dict[str, object]:
    requested_ids = set(_dedupe_text(record_ids))
    requested_urls = set(_dedupe_text(urls))
    if not requested_ids and not requested_urls:
        return {
            "removed": 0,
            "removed_records": 0,
            "removed_files": 0,
            "ids": [],
            "urls": [],
        }

    storage = _image_record_source()
    try:
        records = storage.list() if isinstance(storage, ImageRecordRepository) else storage.load_image_records()
    except Exception:
        records = []

    matched_records: list[dict[str, object]] = []
    remaining_records: list[dict[str, object]] = []
    for record in records:
        if not isinstance(record, dict):
            continue
        record_id = _record_id(record)
        record_url = _clean(record.get("url"))
        if (record_id and record_id in requested_ids) or (record_url and record_url in requested_urls):
            matched_records.append(record)
        else:
            remaining_records.append(record)

    removed_record_ids: list[str] = []
    if matched_records:
        if isinstance(storage, ImageRecordRepository):
            for record in matched_records:
                record_id = _record_id(record)
                if record_id and storage.delete(record_id):
                    removed_record_ids.append(record_id)
        else:
            storage.save_image_records(remaining_records)
            removed_record_ids = [_record_id(record) for record in matched_records if _record_id(record)]

    removed_record_id_set = set(removed_record_ids)
    record_urls = [
        _clean(record.get("url"))
        for record in matched_records
        if not isinstance(storage, ImageRecordRepository) or _record_id(record) in removed_record_id_set
    ]
    urls_to_delete = _dedupe_text([*requested_urls, *record_urls])
    removed_file_urls = [url for url in urls_to_delete if _delete_local_image_file(url)]

    removed_images: set[str] = set()
    for record in matched_records:
        record_id = _record_id(record)
        if isinstance(storage, ImageRecordRepository) and record_id not in removed_record_id_set:
            continue
        removed_images.add(_clean(record.get("url")) or record_id)
    removed_images.update(removed_file_urls)

    return {
        "removed": len(removed_images),
        "removed_records": len(removed_record_ids),
        "removed_files": len(removed_file_urls),
        "ids": removed_record_ids,
        "urls": removed_file_urls,
    }


def record_image_result(
    identity: dict[str, object],
    result: dict[str, object],
    *,
    prompt: str,
    mode: str,
    model: str,
    size: str | None = None,
    channel: str = "internal_pool",
    quota_cost: int = 0,
    request_id: str = "",
) -> list[dict[str, object]]:
    data = result.get("data") if isinstance(result, dict) else None
    if not isinstance(data, list):
        return []
    storage = _image_record_source()
    records: list[dict[str, object]] = []
    if not isinstance(storage, ImageRecordRepository):
        try:
            records = storage.load_image_records()
        except Exception:
            records = []
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    owner_role = _clean(identity.get("role"))
    owner_user_id = _clean(identity.get("id")) if owner_role == "user" else ""
    normalized_request_id = _clean(request_id) or get_current_request_id()
    created: list[dict[str, object]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        url = _clean(item.get("url"))
        if not url:
            continue
        record_id = uuid.uuid4().hex
        record = {
            "id": record_id,
            "record_id": record_id,
            "owner_user_id": owner_user_id,
            "owner_role": owner_role,
            "owner_name": identity.get("name"),
            "owner_email": identity.get("email"),
            "prompt": prompt,
            "mode": mode,
            "model": model,
            "image_size": size or "",
            "channel": channel,
            "request_id": normalized_request_id,
            "url": url,
            "created_at": now,
            "quota_cost": quota_cost if owner_user_id else 0,
        }
        created.append(record)
    if created:
        if isinstance(storage, ImageRecordRepository):
            for record in created:
                storage.insert(record)
        else:
            storage.save_image_records([*created, *[record for record in records if isinstance(record, dict)]])
    return created
