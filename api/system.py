from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field

from api.support import require_admin, require_identity, resolve_image_base_url
from services.account_service import account_service
from services.auth_service import auth_service
from services.config import config
from services.image_service import delete_images, list_images
from services.log_service import LOG_TYPE_AUDIT, audit_service, log_service
from services.proxy_service import test_proxy


class SettingsUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")


class ProxyTestRequest(BaseModel):
    url: str = ""


class LoginRequest(BaseModel):
    email: str = ""
    password: str = ""


class ImageDeleteItem(BaseModel):
    id: str = ""
    record_id: str = ""
    url: str = ""


class ImageDeleteRequest(BaseModel):
    ids: list[str] = Field(default_factory=list)
    urls: list[str] = Field(default_factory=list)
    items: list[ImageDeleteItem] = Field(default_factory=list)


def create_router(app_version: str) -> APIRouter:
    router = APIRouter()

    def account_pool_health() -> dict[str, int]:
        accounts = account_service.list_accounts()
        total = len(accounts)
        available = 0
        for account in accounts:
            status = str(account.get("status") or "")
            if status in {"禁用", "限流", "异常"}:
                continue
            try:
                inflight = int(account.get("inflightCount") or account.get("inflight_count") or 0)
            except (TypeError, ValueError):
                inflight = 0
            try:
                max_concurrency = int(account.get("maxConcurrency") or account.get("max_concurrency") or 1)
            except (TypeError, ValueError):
                max_concurrency = 1
            image_quota_unknown = bool(account.get("imageQuotaUnknown") or account.get("image_quota_unknown"))
            try:
                quota = int(account.get("quota") or 0)
            except (TypeError, ValueError):
                quota = 0
            if (image_quota_unknown or quota > 0) and inflight < max(1, max_concurrency):
                available += 1
        return {"total": total, "available": available}

    def health_payload() -> dict[str, object]:
        storage = config.get_storage_backend()
        storage_health = storage.health_check()
        pool = account_pool_health()
        status = "healthy" if storage_health.get("status") == "healthy" and pool["available"] >= 0 else "unhealthy"
        return {
            "status": status,
            "version": app_version,
            "storage": storage_health,
            "account_pool": pool,
        }

    @router.post("/auth/login")
    async def login(body: LoginRequest | None = None, authorization: str | None = Header(default=None)):
        if body and body.email.strip():
            try:
                user, token = auth_service.login_user(email=body.email, password=body.password)
            except ValueError as exc:
                raise HTTPException(status_code=401, detail={"error": str(exc)}) from exc
            return {
                "ok": True,
                "version": app_version,
                "role": user.get("role"),
                "subject_id": user.get("id"),
                "name": user.get("name"),
                "email": user.get("email"),
                "quota": user.get("quota"),
                "token": token,
            }
        identity = require_identity(authorization)
        return {
            "ok": True,
            "version": app_version,
            "role": identity.get("role"),
            "subject_id": identity.get("id"),
            "name": identity.get("name"),
            "email": identity.get("email"),
            "quota": identity.get("quota"),
        }

    @router.get("/version")
    async def get_version():
        return {"version": app_version}

    @router.get("/health")
    async def health_check():
        return health_payload()

    @router.get("/api/health")
    async def api_health_check(authorization: str | None = Header(default=None)):
        require_admin(authorization)
        return health_payload()

    @router.get("/api/settings")
    async def get_settings(authorization: str | None = Header(default=None)):
        require_admin(authorization)
        return {"config": config.get()}

    @router.post("/api/settings")
    async def save_settings(body: SettingsUpdateRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        return {"config": config.update(body.model_dump(mode="python"))}

    @router.get("/api/images")
    async def get_images(
            request: Request,
            start_date: str = "",
            end_date: str = "",
            user_id: str = "",
            channel: str = "",
            request_id: str = "",
            page: int = 1,
            page_size: int = 48,
            authorization: str | None = Header(default=None),
    ):
        require_admin(authorization)
        return list_images(
            resolve_image_base_url(request),
            start_date=start_date.strip(),
            end_date=end_date.strip(),
            owner_user_id=user_id.strip(),
            channel=channel.strip(),
            request_id=request_id.strip(),
            page=page,
            page_size=page_size,
        )

    @router.delete("/api/images")
    async def delete_image_items(body: ImageDeleteRequest, authorization: str | None = Header(default=None)):
        admin = require_admin(authorization)
        record_ids = [
            *body.ids,
            *[item.record_id or item.id for item in body.items if item.record_id or item.id],
        ]
        urls = [
            *body.urls,
            *[item.url for item in body.items if item.url],
        ]
        if not any(str(value or "").strip() for value in [*record_ids, *urls]):
            raise HTTPException(status_code=400, detail={"error": "image ids or urls are required"})
        result = delete_images(record_ids=record_ids, urls=urls)
        audit_service.add(
            actor=admin,
            action="images.delete",
            resource="image",
            target_id=",".join(str(value) for value in record_ids[:5] if str(value).strip()),
            detail={
                "requested": len(body.items) or len(record_ids) or len(urls),
                **result,
            },
        )
        return result

    @router.get("/api/logs")
    async def get_logs(
            type: str = "",
            start_date: str = "",
            end_date: str = "",
            request_id: str = "",
            status: str = "",
            page: int = 1,
            page_size: int = 50,
            authorization: str | None = Header(default=None),
    ):
        require_admin(authorization)
        if type.strip() == LOG_TYPE_AUDIT:
            return audit_service.query(
                start_date=start_date.strip(),
                end_date=end_date.strip(),
                request_id=request_id.strip(),
                page=page,
                page_size=page_size,
            )
        return log_service.query(
            type=type.strip(),
            start_date=start_date.strip(),
            end_date=end_date.strip(),
            request_id=request_id.strip(),
            status=status.strip(),
            page=page,
            page_size=page_size,
        )

    @router.get("/api/audit-logs")
    async def get_audit_logs(
            action: str = "",
            resource: str = "",
            start_date: str = "",
            end_date: str = "",
            request_id: str = "",
            page: int = 1,
            page_size: int = 50,
            authorization: str | None = Header(default=None),
    ):
        require_admin(authorization)
        return audit_service.query(
            action=action.strip(),
            resource=resource.strip(),
            start_date=start_date.strip(),
            end_date=end_date.strip(),
            request_id=request_id.strip(),
            page=page,
            page_size=page_size,
        )

    @router.post("/api/proxy/test")
    async def test_proxy_endpoint(body: ProxyTestRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        candidate = (body.url or "").strip() or config.get_proxy_settings()
        if not candidate:
            raise HTTPException(status_code=400, detail={"error": "proxy url is required"})
        return {"result": await run_in_threadpool(test_proxy, candidate)}

    @router.get("/api/storage/info")
    async def get_storage_info(authorization: str | None = Header(default=None)):
        require_admin(authorization)
        storage = config.get_storage_backend()
        return {
            "backend": storage.get_backend_info(),
            "health": storage.health_check(),
        }

    return router
