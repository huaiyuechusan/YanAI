from __future__ import annotations

from fastapi import APIRouter, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from api.support import require_identity, resolve_image_base_url
from services.auth_service import auth_service
from services.channel_service import channel_service
from services.image_service import record_image_result
from services.log_service import LoggedCall, SSE_RESPONSE_HEADERS
from services.observability import request_id_from_request
from services.protocol import (
    anthropic_v1_messages,
    openai_v1_chat_complete,
    openai_v1_image_edit,
    openai_v1_image_generations,
    openai_v1_models,
    openai_v1_response,
)
from utils.helper import sse_json_stream


class ImageGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    model: str = "gpt-image-2"
    n: int = Field(default=1, ge=1, le=4)
    size: str | None = None
    response_format: str = "url"
    history_disabled: bool = True
    stream: bool | None = None


class ChatCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    model: str | None = None
    prompt: str | None = None
    n: int | None = None
    stream: bool | None = None
    modalities: list[str] | None = None
    messages: list[dict[str, object]] | None = None


class ResponseCreateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    model: str | None = None
    input: object | None = None
    tools: list[dict[str, object]] | None = None
    tool_choice: object | None = None
    stream: bool | None = None


class AnthropicMessageRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    model: str | None = None
    messages: list[dict[str, object]] | None = None
    system: object | None = None
    stream: bool | None = None


def create_router() -> APIRouter:
    router = APIRouter()

    def successful_image_count(result: object) -> int:
        if not isinstance(result, dict) or not isinstance(result.get("data"), list):
            return 0
        return sum(
            1
            for item in result.get("data") or []
            if isinstance(item, dict) and (item.get("b64_json") or item.get("url"))
        )

    def reserve_image_quota(identity: dict[str, object], amount: int, request_id: str) -> str | None:
        if identity.get("role") != "user":
            return None
        try:
            auth_service.reserve_quota(str(identity.get("id") or ""), amount, request_id)
        except ValueError as exc:
            raise HTTPException(status_code=429, detail={"error": str(exc)}) from exc
        return request_id

    def attach_personal_image_channel(identity: dict[str, object], payload: dict[str, object], model: str | None) -> bool:
        if identity.get("role") != "user":
            return False
        user_id = str(identity.get("id") or "")
        personal_channel = auth_service.get_user_image_channel_config(
            user_id,
            include_api_key=True,
        )
        payload["_owner_user_id"] = user_id
        payload["_personal_image_channel"] = personal_channel
        return channel_service.has_usable_personal_channel(
            model,
            personal_channel,
            owner_user_id=user_id,
        )

    def finalize_quota(request_id: str | None, count: int) -> None:
        if not request_id:
            return
        if count > 0:
            auth_service.confirm_quota(request_id, count)
        else:
            auth_service.release_quota(request_id)

    def finalize_image_result(
            identity: dict[str, object],
            result: dict[str, object],
            *,
            prompt: str,
            mode: str,
            model: str,
            size: str | None,
            channel: str,
            request_id: str,
    ) -> int:
        count = successful_image_count(result)
        if count <= 0:
            return 0
        record_image_result(
            identity,
            result,
            prompt=prompt,
            mode=mode,
            model=model,
            size=size,
            channel=channel,
            quota_cost=image_quota_cost(identity, channel),
            request_id=request_id,
        )
        return count

    def stream_image_result_recorder(
            identity: dict[str, object],
            *,
            prompt: str,
            mode: str,
            model: str,
            size: str | None,
            channel: str,
            request_id: str,
    ):
        def record(item: object):
            if not isinstance(item, dict) or item.get("object") != "image.generation.result":
                return item
            result = {
                "created": item.get("created"),
                "data": item.get("data") if isinstance(item.get("data"), list) else [],
            }
            finalize_image_result(
                identity,
                result,
                prompt=prompt,
                mode=mode,
                model=model,
                size=size,
                channel=channel,
                request_id=request_id,
            )
            next_item = dict(item)
            next_item["data"] = result["data"]
            return next_item

        return record

    def external_image_stream_response(result: dict[str, object]) -> StreamingResponse:
        data = result.get("data") if isinstance(result.get("data"), list) else []
        return StreamingResponse(
            sse_json_stream([{
                "object": "image.generation.result",
                "created": result.get("created"),
                "data": data,
            }]),
            media_type="text/event-stream",
            headers=SSE_RESPONSE_HEADERS,
        )

    def require_internal_pool_enabled(payload: dict[str, object], call: LoggedCall) -> None:
        if not channel_service.is_internal_pool_enabled():
            external_error = payload.get("_channel_error")
            attempted = bool(payload.get("_external_channel_attempted") or external_error)
            if attempted:
                message = f"外部生图渠道调用失败，内置账号池已禁用：{external_error or '上游未返回图片'}"
            else:
                model = str(payload.get("model") or "gpt-image-2")
                message = f"内置账号池已禁用，未找到支持模型 {model} 的已启用外部渠道，请检查渠道开关和模型配置"
            call.log("渠道调用失败", status="failed", error=message)
            raise HTTPException(
                status_code=502 if attempted else 503,
                detail={"error": message},
            )

    def require_personal_channel_success(payload: dict[str, object]) -> None:
        personal_error = str(payload.get("_personal_channel_error") or "").strip()
        if personal_error:
            raise HTTPException(
                status_code=502,
                detail={"error": f"personal image channel failed: {personal_error}"},
            )

    def image_quota_cost(identity: dict[str, object], channel: str) -> int:
        if identity.get("role") != "user":
            return 0
        if str(channel or "").startswith("个人渠道/"):
            return 0
        return 1

    @router.get("/v1/models")
    async def list_models(authorization: str | None = Header(default=None)):
        require_identity(authorization)
        try:
            return await run_in_threadpool(openai_v1_models.list_models)
        except Exception as exc:
            raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc

    @router.post("/v1/images/generations")
    async def generate_images(
            body: ImageGenerationRequest,
            request: Request,
            authorization: str | None = Header(default=None),
    ):
        identity = require_identity(authorization)
        if identity.get("role") == "user" and body.stream:
            raise HTTPException(status_code=400, detail={"error": "stream is not supported for personal image tasks"})
        request_id = request_id_from_request(request)
        payload = body.model_dump(mode="python")
        payload["base_url"] = resolve_image_base_url(request)
        payload["request_id"] = request_id
        payload["_image_storage_identity"] = identity
        use_personal_quota_free = attach_personal_image_channel(identity, payload, body.model)
        quota_request_id = None if use_personal_quota_free else reserve_image_quota(identity, int(body.n or 1), request_id)
        call = LoggedCall(identity, "/v1/images/generations", body.model, "文生图", request_id=request_id)
        try:
            routed = await run_in_threadpool(channel_service.call_generation, payload)
            if routed is not None:
                result, channel_name = routed
                call.log("渠道调用完成", result)
                count = finalize_image_result(
                    identity,
                    result,
                    prompt=body.prompt,
                    mode="generate",
                    model=body.model,
                    size=body.size,
                    channel=channel_name,
                    request_id=request_id,
                )
                finalize_quota(quota_request_id, count)
                if body.stream:
                    return external_image_stream_response(result)
                return result
            require_personal_channel_success(payload)
            require_internal_pool_enabled(payload, call)
            result = await call.run(
                openai_v1_image_generations.handle,
                payload,
                on_stream_item=stream_image_result_recorder(
                    identity,
                    prompt=body.prompt,
                    mode="generate",
                    model=body.model,
                    size=body.size,
                    channel="internal_pool",
                    request_id=request_id,
                ) if body.stream else None,
            )
            count = 0
            if isinstance(result, dict):
                count = finalize_image_result(
                    identity,
                    result,
                    prompt=body.prompt,
                    mode="generate",
                    model=body.model,
                    size=body.size,
                    channel="internal_pool",
                    request_id=request_id,
                )
            finalize_quota(quota_request_id, count)
            return result
        except Exception:
            if quota_request_id:
                auth_service.release_quota(quota_request_id)
            raise

    @router.post("/v1/images/edits")
    async def edit_images(
            request: Request,
            authorization: str | None = Header(default=None),
            image: list[UploadFile] | None = File(default=None),
            image_list: list[UploadFile] | None = File(default=None, alias="image[]"),
            prompt: str = Form(...),
            model: str = Form(default="gpt-image-2"),
            n: int = Form(default=1),
            size: str | None = Form(default=None),
            response_format: str = Form(default="url"),
            stream: bool | None = Form(default=None),
    ):
        identity = require_identity(authorization)
        if identity.get("role") == "user" and stream:
            raise HTTPException(status_code=400, detail={"error": "stream is not supported for personal image tasks"})
        if n < 1 or n > 4:
            raise HTTPException(status_code=400, detail={"error": "n must be between 1 and 4"})
        uploads = [*(image or []), *(image_list or [])]
        if not uploads:
            raise HTTPException(status_code=400, detail={"error": "image file is required"})
        images: list[tuple[bytes, str, str]] = []
        for upload in uploads:
            image_data = await upload.read()
            if not image_data:
                raise HTTPException(status_code=400, detail={"error": "image file is empty"})
            images.append((image_data, upload.filename or "image.png", upload.content_type or "image/png"))
        request_id = request_id_from_request(request)
        payload = {
            "prompt": prompt,
            "images": images,
            "model": model,
            "n": n,
            "size": size,
            "response_format": response_format,
            "stream": stream,
            "base_url": resolve_image_base_url(request),
            "request_id": request_id,
            "_image_storage_identity": identity,
        }
        use_personal_quota_free = attach_personal_image_channel(identity, payload, model)
        quota_request_id = None if use_personal_quota_free else reserve_image_quota(identity, int(n or 1), request_id)
        call = LoggedCall(identity, "/v1/images/edits", model, "图生图", request_id=request_id)
        try:
            routed = await run_in_threadpool(channel_service.call_edit, payload)
            if routed is not None:
                result, channel_name = routed
                call.log("渠道调用完成", result)
                count = finalize_image_result(
                    identity,
                    result,
                    prompt=prompt,
                    mode="edit",
                    model=model,
                    size=size,
                    channel=channel_name,
                    request_id=request_id,
                )
                finalize_quota(quota_request_id, count)
                if stream:
                    return external_image_stream_response(result)
                return result
            require_personal_channel_success(payload)
            require_internal_pool_enabled(payload, call)
            result = await call.run(
                openai_v1_image_edit.handle,
                payload,
                on_stream_item=stream_image_result_recorder(
                    identity,
                    prompt=prompt,
                    mode="edit",
                    model=model,
                    size=size,
                    channel="internal_pool",
                    request_id=request_id,
                ) if stream else None,
            )
            count = 0
            if isinstance(result, dict):
                count = finalize_image_result(
                    identity,
                    result,
                    prompt=prompt,
                    mode="edit",
                    model=model,
                    size=size,
                    channel="internal_pool",
                    request_id=request_id,
                )
            finalize_quota(quota_request_id, count)
            return result
        except Exception:
            if quota_request_id:
                auth_service.release_quota(quota_request_id)
            raise

    @router.post("/v1/chat/completions")
    async def create_chat_completion(
            body: ChatCompletionRequest,
            request: Request,
            authorization: str | None = Header(default=None),
    ):
        identity = require_identity(authorization)
        if identity.get("role") == "user":
            raise HTTPException(status_code=403, detail={"error": "personal users can only use image features"})
        payload = body.model_dump(mode="python")
        model = str(payload.get("model") or "auto")
        request_id = request_id_from_request(request)
        payload["request_id"] = request_id
        payload["_image_storage_identity"] = identity
        call = LoggedCall(identity, "/v1/chat/completions", model, "文本生成", request_id=request_id)
        return await call.run(openai_v1_chat_complete.handle, payload)

    @router.post("/v1/responses")
    async def create_response(
            body: ResponseCreateRequest,
            request: Request,
            authorization: str | None = Header(default=None),
    ):
        identity = require_identity(authorization)
        if identity.get("role") == "user":
            raise HTTPException(status_code=403, detail={"error": "personal users can only use image features"})
        payload = body.model_dump(mode="python")
        model = str(payload.get("model") or "auto")
        request_id = request_id_from_request(request)
        payload["request_id"] = request_id
        payload["_image_storage_identity"] = identity
        call = LoggedCall(identity, "/v1/responses", model, "Responses", request_id=request_id)
        return await call.run(openai_v1_response.handle, payload)

    @router.post("/v1/messages")
    async def create_message(
            body: AnthropicMessageRequest,
            request: Request,
            authorization: str | None = Header(default=None),
            x_api_key: str | None = Header(default=None, alias="x-api-key"),
            anthropic_version: str | None = Header(default=None, alias="anthropic-version"),
    ):
        identity = require_identity(authorization or (f"Bearer {x_api_key}" if x_api_key else None))
        if identity.get("role") == "user":
            raise HTTPException(status_code=403, detail={"error": "personal users can only use image features"})
        payload = body.model_dump(mode="python")
        model = str(payload.get("model") or "auto")
        request_id = request_id_from_request(request)
        payload["request_id"] = request_id
        call = LoggedCall(identity, "/v1/messages", model, "Messages", request_id=request_id)
        return await call.run(anthropic_v1_messages.handle, payload, sse="anthropic")

    return router
