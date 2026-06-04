from __future__ import annotations

import json
import itertools
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, StreamingResponse

from services.config import DATA_DIR
from services.observability import get_current_request_id
from utils.helper import anthropic_sse_stream, sse_json_stream

LOG_TYPE_CALL = "call"
LOG_TYPE_ACCOUNT = "account"
LOG_TYPE_AUDIT = "audit"


class LogService:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def _system_log_repository(self):
        try:
            from services.config import config
            provider = config.get_repository_provider()
            return provider.system_logs if provider is not None else None
        except Exception:
            return None

    def add(
        self,
        type: str,
        summary: str = "",
        detail: dict[str, Any] | None = None,
        *,
        request_id: str | None = None,
        **data: Any,
    ) -> None:
        log_detail = dict(detail or data or {})
        normalized_request_id = str(request_id or log_detail.get("request_id") or get_current_request_id() or "").strip()
        if normalized_request_id:
            log_detail["request_id"] = normalized_request_id
        item = {
            "id": uuid.uuid4().hex,
            "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "type": type,
            "summary": summary,
            "detail": log_detail,
        }
        if normalized_request_id:
            item["request_id"] = normalized_request_id
        repo = self._system_log_repository()
        if repo is not None:
            try:
                repo.add(item)
                return
            except Exception:
                pass
        with self.path.open("a", encoding="utf-8") as file:
            file.write(json.dumps(item, ensure_ascii=False, separators=(",", ":")) + "\n")

    def query(
        self,
        type: str = "",
        start_date: str = "",
        end_date: str = "",
        request_id: str = "",
        status: str = "",
        page: int = 1,
        page_size: int = 200,
    ) -> dict[str, Any]:
        repo = self._system_log_repository()
        if repo is not None:
            try:
                return repo.query(
                    type=type,
                    start_date=start_date,
                    end_date=end_date,
                    request_id=request_id,
                    status=status,
                    page=page,
                    page_size=page_size,
                )
            except Exception:
                pass
        items = self._list_file(type=type, start_date=start_date, end_date=end_date, request_id=request_id, status=status)
        normalized_page = max(1, int(page or 1))
        normalized_page_size = max(1, min(200, int(page_size or 200)))
        total = len(items)
        page_count = max(1, (total + normalized_page_size - 1) // normalized_page_size)
        safe_page = min(normalized_page, page_count)
        start = (safe_page - 1) * normalized_page_size
        return {
            "items": items[start:start + normalized_page_size],
            "total": total,
            "page": safe_page,
            "page_size": normalized_page_size,
            "page_count": page_count,
        }

    def list(
        self,
        type: str = "",
        start_date: str = "",
        end_date: str = "",
        limit: int = 200,
        request_id: str = "",
        status: str = "",
    ) -> list[dict[str, Any]]:
        return self.query(
            type=type,
            start_date=start_date,
            end_date=end_date,
            request_id=request_id,
            status=status,
            page=1,
            page_size=limit,
        )["items"]

    def _list_file(
        self,
        type: str = "",
        start_date: str = "",
        end_date: str = "",
        request_id: str = "",
        status: str = "",
    ) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        items: list[dict[str, Any]] = []
        normalized_status = str(status or "").strip()
        for line in reversed(self.path.read_text(encoding="utf-8").splitlines()):
            try:
                item = json.loads(line)
            except Exception:
                continue
            t = str(item.get("time") or "")
            day = t[:10]
            if type and item.get("type") != type:
                continue
            item_detail = item.get("detail")
            detail_request_id = item_detail.get("request_id") if isinstance(item_detail, dict) else ""
            if request_id and str(item.get("request_id") or detail_request_id or "") != request_id:
                continue
            detail_status = item_detail.get("status") if isinstance(item_detail, dict) else ""
            if normalized_status and str(item.get("status") or detail_status or "").strip() != normalized_status:
                continue
            if start_date and day < start_date:
                continue
            if end_date and day > end_date:
                continue
            items.append(item)
        return items


log_service = LogService(DATA_DIR / "logs.jsonl")


class AuditService:
    def _audit_log_repository(self):
        try:
            from services.config import config
            provider = config.get_repository_provider()
            return provider.audit_logs if provider is not None else None
        except Exception:
            return None

    def add(
        self,
        *,
        actor: dict[str, object] | None,
        action: str,
        resource: str = "",
        target_id: str = "",
        detail: dict[str, Any] | None = None,
        status: str = "success",
        request_id: str | None = None,
    ) -> None:
        normalized_detail = dict(detail or {})
        normalized_request_id = str(request_id or normalized_detail.get("request_id") or get_current_request_id() or "").strip()
        if normalized_request_id:
            normalized_detail["request_id"] = normalized_request_id
        item = {
            "id": uuid.uuid4().hex,
            "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "type": LOG_TYPE_AUDIT,
            "summary": action,
            "actor_id": str((actor or {}).get("id") or ""),
            "actor_name": str((actor or {}).get("name") or ""),
            "actor_role": str((actor or {}).get("role") or ""),
            "action": action,
            "resource": resource,
            "target_id": target_id,
            "status": status,
            "detail": normalized_detail,
        }
        if normalized_request_id:
            item["request_id"] = normalized_request_id
        repo = self._audit_log_repository()
        if repo is not None:
            try:
                repo.add(item)
            except Exception:
                pass
        log_service.add(LOG_TYPE_AUDIT, action, item, request_id=normalized_request_id)

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
        repo = self._audit_log_repository()
        if repo is not None:
            try:
                return repo.query(
                    action=action,
                    resource=resource,
                    start_date=start_date,
                    end_date=end_date,
                    request_id=request_id,
                    page=page,
                    page_size=page_size,
                )
            except Exception:
                pass
        return log_service.query(
            type=LOG_TYPE_AUDIT,
            start_date=start_date,
            end_date=end_date,
            request_id=request_id,
            page=page,
            page_size=page_size,
        )


audit_service = AuditService()


def _collect_urls(value: object) -> list[str]:
    urls: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "url" and isinstance(item, str):
                urls.append(item)
            elif key == "urls" and isinstance(item, list):
                urls.extend(str(url) for url in item if isinstance(url, str))
            else:
                urls.extend(_collect_urls(item))
    elif isinstance(value, list):
        for item in value:
            urls.extend(_collect_urls(item))
    return urls


def _image_error_response(exc: Exception) -> JSONResponse:
    message = str(exc)
    if "no available image quota" in message.lower():
        return JSONResponse(
            status_code=429,
            content={
                "error": {
                    "message": "no available image quota",
                    "type": "insufficient_quota",
                    "param": None,
                    "code": "insufficient_quota",
                }
            },
        )
    if hasattr(exc, "to_openai_error") and hasattr(exc, "status_code"):
        return JSONResponse(status_code=int(exc.status_code), content=exc.to_openai_error())
    return JSONResponse(
        status_code=502,
        content={
            "error": {
                "message": message,
                "type": "server_error",
                "param": None,
                "code": "upstream_error",
            }
        },
    )


def _next_item(items):
    try:
        return True, next(items)
    except StopIteration:
        return False, None


@dataclass
class LoggedCall:
    identity: dict[str, object]
    endpoint: str
    model: str
    summary: str
    request_id: str = field(default_factory=get_current_request_id)
    started: float = field(default_factory=time.time)

    async def run(self, handler, *args, sse: str = "openai"):
        from services.protocol.conversation import ImageGenerationError

        try:
            result = await run_in_threadpool(handler, *args)
        except ImageGenerationError as exc:
            self.log("调用失败", status="failed", error=str(exc))
            return _image_error_response(exc)
        except HTTPException as exc:
            self.log("调用失败", status="failed", error=str(exc.detail))
            raise
        except Exception as exc:
            self.log("调用失败", status="failed", error=str(exc))
            raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc

        if isinstance(result, dict):
            self.log("调用完成", result)
            return result

        sender = anthropic_sse_stream if sse == "anthropic" else sse_json_stream
        try:
            has_first, first = await run_in_threadpool(_next_item, result)
        except ImageGenerationError as exc:
            self.log("调用失败", status="failed", error=str(exc))
            return _image_error_response(exc)
        except HTTPException as exc:
            self.log("调用失败", status="failed", error=str(exc.detail))
            raise
        except Exception as exc:
            self.log("调用失败", status="failed", error=str(exc))
            raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc
        if not has_first:
            self.log("流式调用结束")
            return StreamingResponse(sender(()), media_type="text/event-stream")
        return StreamingResponse(sender(self.stream(itertools.chain([first], result))), media_type="text/event-stream")

    def stream(self, items):
        urls: list[str] = []
        failed = False
        try:
            for item in items:
                urls.extend(_collect_urls(item))
                yield item
        except Exception as exc:
            failed = True
            self.log("流式调用失败", status="failed", error=str(exc), urls=urls)
            raise
        finally:
            if not failed:
                self.log("流式调用结束", urls=urls)

    def log(self, suffix: str, result: object = None, status: str = "success", error: str = "",
            urls: list[str] | None = None) -> None:
        detail = {
            "request_id": self.request_id,
            "key_id": self.identity.get("id"),
            "key_name": self.identity.get("name"),
            "role": self.identity.get("role"),
            "endpoint": self.endpoint,
            "model": self.model,
            "started_at": datetime.fromtimestamp(self.started).strftime("%Y-%m-%d %H:%M:%S"),
            "ended_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "duration_ms": int((time.time() - self.started) * 1000),
            "status": status,
        }
        if error:
            detail["error"] = error
        collected_urls = [*(urls or []), *_collect_urls(result)]
        if collected_urls:
            detail["urls"] = list(dict.fromkeys(collected_urls))
        log_service.add(LOG_TYPE_CALL, f"{self.summary}{suffix}", detail, request_id=self.request_id)
