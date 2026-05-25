from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from api.support import require_admin, require_identity, resolve_image_base_url
from services.auth_service import auth_service
from services.channel_service import channel_service
from services.image_service import list_images


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str = ""


class ProfileUpdateRequest(BaseModel):
    name: str | None = None


class RedeemRequest(BaseModel):
    code: str


class AdminUserCreateRequest(BaseModel):
    email: str
    password: str
    name: str = ""
    quota: int = 0
    status: str = "active"


class AdminUserUpdateRequest(BaseModel):
    email: str | None = None
    name: str | None = None
    status: str | None = None
    quota: int | None = None


class AdminUserQuotaRequest(BaseModel):
    amount: int
    mode: str = "add"


class ResetPasswordRequest(BaseModel):
    password: str = ""


class RedeemCodeCreateRequest(BaseModel):
    quota: int = Field(default=1, ge=1)
    count: int = Field(default=1, ge=1, le=500)
    max_uses: int = Field(default=1, ge=1)
    expires_at: str | None = None
    note: str = ""


class RedeemCodeUpdateRequest(BaseModel):
    status: str | None = None
    quota: int | None = None
    max_uses: int | None = None
    expires_at: str | None = None
    note: str | None = None


class ChannelRequest(BaseModel):
    name: str = ""
    base_url: str = ""
    api_key: str = ""
    models: list[str] | str = Field(default_factory=lambda: ["gpt-image-1", "gpt-image-2"])
    weight: int = 1
    priority: int = 0
    timeout: int = 60
    enabled: bool = True


class ChannelUpdateRequest(BaseModel):
    name: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    models: list[str] | str | None = None
    weight: int | None = None
    priority: int | None = None
    timeout: int | None = None
    enabled: bool | None = None


def create_router() -> APIRouter:
    router = APIRouter()

    @router.post("/auth/register")
    async def register(body: RegisterRequest):
        try:
            user, token = auth_service.register_user(email=body.email, password=body.password, name=body.name)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        return {"ok": True, "user": user, "token": token}

    @router.get("/api/me")
    async def get_me(authorization: str | None = Header(default=None)):
        identity = require_identity(authorization)
        if identity.get("role") == "user":
            user = auth_service.get_user(str(identity.get("id") or ""))
            if user is not None:
                return {"user": user}
        return {"user": identity}

    @router.post("/api/me/profile")
    async def update_profile(body: ProfileUpdateRequest, authorization: str | None = Header(default=None)):
        identity = require_identity(authorization)
        if identity.get("role") != "user":
            return {"user": identity}
        try:
            user = auth_service.update_user(str(identity.get("id") or ""), body.model_dump(exclude_none=True))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        if user is None:
            raise HTTPException(status_code=404, detail={"error": "user not found"})
        return {"user": user}

    @router.post("/api/me/redeem")
    async def redeem(body: RedeemRequest, authorization: str | None = Header(default=None)):
        identity = require_identity(authorization)
        if identity.get("role") != "user":
            raise HTTPException(status_code=403, detail={"error": "user permission required"})
        try:
            user, code = auth_service.redeem_code(str(identity.get("id") or ""), body.code)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        return {"user": user, "redeem_code": code}

    @router.get("/api/me/images")
    async def get_my_images(
            request: Request,
            start_date: str = "",
            end_date: str = "",
            authorization: str | None = Header(default=None),
    ):
        identity = require_identity(authorization)
        if identity.get("role") != "user":
            raise HTTPException(status_code=403, detail={"error": "user permission required"})
        return list_images(
            resolve_image_base_url(request),
            start_date=start_date.strip(),
            end_date=end_date.strip(),
            owner_user_id=str(identity.get("id") or ""),
        )

    @router.get("/api/admin/users")
    async def admin_list_users(
            query: str = "",
            status: str = "",
            role: str = "",
            authorization: str | None = Header(default=None),
    ):
        require_admin(authorization)
        return {"items": auth_service.list_users(query=query, status=status, role=role)}

    @router.post("/api/admin/users")
    async def admin_create_user(body: AdminUserCreateRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        try:
            user, password_or_token = auth_service.create_user(
                email=body.email,
                password=body.password,
                name=body.name,
                quota=body.quota,
                status=body.status,
                role="user",
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        return {"item": user, "password": body.password, "session_token": password_or_token, "items": auth_service.list_users()}

    @router.post("/api/admin/users/{user_id}")
    async def admin_update_user(user_id: str, body: AdminUserUpdateRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        try:
            user = auth_service.update_user(user_id, body.model_dump(exclude_none=True))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        if user is None:
            raise HTTPException(status_code=404, detail={"error": "user not found"})
        return {"item": user, "items": auth_service.list_users()}

    @router.post("/api/admin/users/{user_id}/quota")
    async def admin_update_user_quota(user_id: str, body: AdminUserQuotaRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        user = auth_service.adjust_user_quota(user_id, body.amount, body.mode)
        if user is None:
            raise HTTPException(status_code=404, detail={"error": "user not found"})
        return {"item": user, "items": auth_service.list_users()}

    @router.post("/api/admin/users/{user_id}/reset-password")
    async def admin_reset_password(user_id: str, body: ResetPasswordRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        try:
            result = auth_service.reset_password(user_id, body.password)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        if result is None:
            raise HTTPException(status_code=404, detail={"error": "user not found"})
        user, password = result
        return {"item": user, "password": password}

    @router.get("/api/admin/redeem-codes")
    async def admin_list_redeem_codes(query: str = "", status: str = "", authorization: str | None = Header(default=None)):
        require_admin(authorization)
        return {"items": auth_service.list_redeem_codes(query=query, status=status)}

    @router.post("/api/admin/redeem-codes")
    async def admin_create_redeem_code(body: RedeemCodeCreateRequest, authorization: str | None = Header(default=None)):
        admin = require_admin(authorization)
        items = auth_service.create_redeem_codes(
            quota=body.quota,
            count=1,
            max_uses=body.max_uses,
            expires_at=body.expires_at,
            created_by=str(admin.get("id") or ""),
            note=body.note,
        )
        return {"items": auth_service.list_redeem_codes(), "created": items}

    @router.post("/api/admin/redeem-codes/batch")
    async def admin_create_redeem_code_batch(body: RedeemCodeCreateRequest, authorization: str | None = Header(default=None)):
        admin = require_admin(authorization)
        created = auth_service.create_redeem_codes(
            quota=body.quota,
            count=body.count,
            max_uses=body.max_uses,
            expires_at=body.expires_at,
            created_by=str(admin.get("id") or ""),
            note=body.note,
        )
        return {"items": auth_service.list_redeem_codes(), "created": created}

    @router.post("/api/admin/redeem-codes/{code_id}")
    async def admin_update_redeem_code(code_id: str, body: RedeemCodeUpdateRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        item = auth_service.update_redeem_code(code_id, body.model_dump(exclude_none=True))
        if item is None:
            raise HTTPException(status_code=404, detail={"error": "redeem code not found"})
        return {"item": item, "items": auth_service.list_redeem_codes()}

    @router.get("/api/admin/channels")
    async def admin_list_channels(authorization: str | None = Header(default=None)):
        require_admin(authorization)
        return {"items": channel_service.list_channels()}

    @router.post("/api/admin/channels")
    async def admin_create_channel(body: ChannelRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        try:
            item = channel_service.create_channel(body.model_dump(mode="python"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        return {"item": item, "items": channel_service.list_channels()}

    @router.post("/api/admin/channels/{channel_id}")
    async def admin_update_channel(channel_id: str, body: ChannelUpdateRequest, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        try:
            item = channel_service.update_channel(channel_id, body.model_dump(exclude_none=True, mode="python"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
        if item is None:
            raise HTTPException(status_code=404, detail={"error": "channel not found"})
        return {"item": item, "items": channel_service.list_channels()}

    @router.delete("/api/admin/channels/{channel_id}")
    async def admin_delete_channel(channel_id: str, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        if not channel_service.delete_channel(channel_id):
            raise HTTPException(status_code=404, detail={"error": "channel not found"})
        return {"items": channel_service.list_channels()}

    return router
