from __future__ import annotations

from datetime import datetime
from pathlib import Path
import uuid
from urllib.parse import urlparse

from services.config import config


def _clean(value: object) -> str:
    return str(value or "").strip()


def _record_to_item(record: dict[str, object], base_url: str) -> dict[str, object]:
    url = _clean(record.get("url"))
    parsed_path = urlparse(url).path
    name = Path(parsed_path).name or _clean(record.get("id")) or "image.png"
    size = int(record.get("size") or 0)
    if parsed_path.startswith("/images/"):
        local_path = config.images_dir / parsed_path.removeprefix("/images/")
        if local_path.exists() and local_path.is_file():
            size = local_path.stat().st_size
            if not url.startswith("http"):
                url = f"{base_url.rstrip('/')}{parsed_path}"
    created_at = _clean(record.get("created_at")) or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    day = created_at[:10]
    return {
        "id": record.get("id"),
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
        "channel": record.get("channel"),
        "quota_cost": int(record.get("quota_cost") or 0),
    }


def _group_items(items: list[dict[str, object]]) -> list[dict[str, object]]:
    groups: dict[str, list[dict[str, object]]] = {}
    for item in items:
        groups.setdefault(str(item["date"]), []).append(item)
    return [{"date": key, "items": value} for key, value in groups.items()]


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
        day = "-".join(parts[:3]) if len(parts) >= 4 else datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d")
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
            "size": path.stat().st_size,
            "url": url,
            "created_at": datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
        })
    items.sort(key=lambda item: str(item["created_at"]), reverse=True)
    return items


def list_images(
    base_url: str,
    start_date: str = "",
    end_date: str = "",
    owner_user_id: str = "",
    channel: str = "",
) -> dict[str, object]:
    storage = config.get_storage_backend()
    try:
        records = storage.load_image_records()
    except Exception:
        records = []
    items = []
    for record in records:
        if not isinstance(record, dict):
            continue
        created_at = _clean(record.get("created_at"))
        day = created_at[:10]
        if owner_user_id and _clean(record.get("owner_user_id")) != owner_user_id:
            continue
        if channel and _clean(record.get("channel")) != channel:
            continue
        if start_date and day < start_date:
            continue
        if end_date and day > end_date:
            continue
        items.append(_record_to_item(record, base_url))
    seen_urls = {str(item.get("url") or "") for item in items}
    if not owner_user_id:
        items.extend(_list_files(base_url, start_date, end_date, seen_urls))
    items.sort(key=lambda item: str(item["created_at"]), reverse=True)
    return {"items": items, "groups": _group_items(items)}


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
) -> list[dict[str, object]]:
    data = result.get("data") if isinstance(result, dict) else None
    if not isinstance(data, list):
        return []
    storage = config.get_storage_backend()
    try:
        records = storage.load_image_records()
    except Exception:
        records = []
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    owner_role = _clean(identity.get("role"))
    owner_user_id = _clean(identity.get("id")) if owner_role == "user" else ""
    created: list[dict[str, object]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        url = _clean(item.get("url"))
        if not url:
            continue
        record = {
            "id": uuid.uuid4().hex,
            "owner_user_id": owner_user_id,
            "owner_role": owner_role,
            "owner_name": identity.get("name"),
            "owner_email": identity.get("email"),
            "prompt": prompt,
            "mode": mode,
            "model": model,
            "size": size or "",
            "channel": channel,
            "url": url,
            "created_at": now,
            "quota_cost": quota_cost if owner_user_id else 0,
        }
        created.append(record)
    if created:
        storage.save_image_records([*created, *[record for record in records if isinstance(record, dict)]])
    return created
