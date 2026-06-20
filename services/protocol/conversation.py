from __future__ import annotations

import base64
import hashlib
import json
import re
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Iterator

import tiktoken

from services.account_service import account_service
from services.config import config
from services.log_service import LOG_TYPE_ACCOUNT, log_service
from services.observability import get_current_request_id
from services.openai_backend_api import OpenAIBackendAPI
from utils.helper import IMAGE_MODELS, anonymize_token
from utils.log import logger
from utils.timezone import china_now_text


class ImageGenerationError(Exception):
    def __init__(
        self,
        message: str,
        status_code: int = 502,
        error_type: str = "server_error",
        code: str | None = "upstream_error",
        param: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_type = error_type
        self.code = code
        self.param = param

    def to_openai_error(self) -> dict[str, Any]:
        return {
            "error": {
                "message": str(self),
                "type": self.error_type,
                "param": self.param,
                "code": self.code,
            }
        }


def is_token_invalid_error(message: str) -> bool:
    text = str(message or "").lower()
    return (
        "token_invalidated" in text
        or "token_revoked" in text
        or "authentication token has been invalidated" in text
        or "invalidated oauth token" in text
    )


def encode_images(images: Iterable[tuple[bytes, str, str]]) -> list[str]:
    return [base64.b64encode(data).decode("ascii") for data, _, _ in images if data]


def save_image_bytes(image_data: bytes, base_url: str | None = None) -> str:
    config.cleanup_old_images()
    file_hash = hashlib.md5(image_data).hexdigest()
    filename = f"{file_hash}_{uuid.uuid4().hex}.png"
    relative_dir = Path(*china_now_text()[:10].split("-"))
    file_path = config.images_dir / relative_dir / filename
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(image_data)
    return f"{(base_url or config.base_url)}/images/{relative_dir.as_posix()}/{filename}"


TEXT_CONTENT_TYPES = {"text", "input_text", "output_text"}
IMAGE_CONTENT_TYPES = {"image_url", "input_image"}


def message_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and str(item.get("type") or "") in TEXT_CONTENT_TYPES:
                parts.append(str(item.get("text") or ""))
        return "".join(parts)
    return ""


def _image_url_from_content_block(item: dict[str, Any]) -> tuple[str, str | None]:
    image_url = item.get("image_url") or item.get("url")
    detail = item.get("detail")
    if isinstance(image_url, dict):
        detail = image_url.get("detail") or detail
        image_url = image_url.get("url") or image_url.get("image_url")
    return str(image_url or "").strip(), str(detail).strip() if detail else None


def normalize_content_block(item: Any) -> dict[str, Any] | None:
    if isinstance(item, str):
        return {"type": "text", "text": item}
    if not isinstance(item, dict):
        return None
    item_type = str(item.get("type") or "").strip()
    if item_type in TEXT_CONTENT_TYPES:
        text = str(item.get("text") or item.get("input_text") or "").strip()
        return {"type": "text", "text": text} if text else None
    if item_type in IMAGE_CONTENT_TYPES:
        image_url, detail = _image_url_from_content_block(item)
        file_id = str(item.get("file_id") or "").strip()
        block: dict[str, Any] = {"type": "input_image"}
        if image_url:
            block["image_url"] = image_url
        if file_id:
            block["file_id"] = file_id
        if detail:
            block["detail"] = detail
        for key in (
            "file_name",
            "filename",
            "name",
            "mime_type",
            "mimeType",
            "file_size",
            "size",
            "size_bytes",
            "width",
            "height",
        ):
            if key in item:
                block[key] = item[key]
        return block if image_url or file_id else None
    text = content_value_text(item)
    return {"type": "text", "text": text} if text else None


def normalize_message_content(content: Any) -> str | list[dict[str, Any]]:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return message_text(content)
    blocks = [block for item in content if (block := normalize_content_block(item)) is not None]
    if any(str(block.get("type") or "") in IMAGE_CONTENT_TYPES for block in blocks):
        return blocks
    return message_text(blocks)


def normalize_messages(messages: object, system: Any = None) -> list[dict[str, Any]]:
    normalized = []
    system_text = message_text(system)
    if system_text:
        normalized.append({"role": "system", "content": system_text})
    if isinstance(messages, list):
        for message in messages:
            if isinstance(message, dict):
                normalized.append({
                    "role": message.get("role", "user"),
                    "content": normalize_message_content(message.get("content", "")),
                })
    return normalized


def assistant_history_text(messages: list[dict[str, Any]]) -> str:
    return "".join(message_text(item.get("content", "")) for item in messages if item.get("role") == "assistant")


def assistant_history_messages(messages: list[dict[str, Any]]) -> list[str]:
    return [
        text
        for item in messages
        if item.get("role") == "assistant" and (text := message_text(item.get("content", "")))
    ]


def build_image_prompt(prompt: str, size: str | None) -> str:
    if not size:
        return prompt
    if size not in {"1:1", "16:9", "9:16", "4:3", "3:4"}:
        return f"{prompt.strip()}\n\n输出图片，宽高比为 {size}。"
    hint = {
        "1:1": "输出为 1:1 正方形构图，主体居中，适合正方形画幅。",
        "16:9": "输出为 16:9 横屏构图，适合宽画幅展示。",
        "9:16": "输出为 9:16 竖屏构图，适合竖版画幅展示。",
        "4:3": "输出为 4:3 比例，兼顾宽度与高度，适合展示画面细节。",
        "3:4": "输出为 3:4 比例，纵向构图，适合人物肖像或竖向场景。",
    }[size]
    return f"{prompt.strip()}\n\n{hint}"


def encoding_for_model(model: str):
    try:
        return tiktoken.encoding_for_model(model)
    except KeyError:
        try:
            return tiktoken.get_encoding("o200k_base")
        except KeyError:
            return tiktoken.get_encoding("cl100k_base")


def count_message_tokens(messages: list[dict[str, Any]], model: str) -> int:
    encoding = encoding_for_model(model)
    total = 0
    for message in messages:
        total += 3
        for key, value in message.items():
            if key == "content" and not isinstance(value, str):
                value = message_text(value)
            if not isinstance(value, str):
                continue
            total += len(encoding.encode(value))
            if key == "name":
                total += 1
    return total + 3


def count_text_tokens(text: str, model: str) -> int:
    return len(encoding_for_model(model).encode(text))


def format_image_result(
    items: list[dict[str, Any]],
    prompt: str,
    response_format: str,
    base_url: str | None = None,
    created: int | None = None,
    message: str = "",
) -> dict[str, Any]:
    data: list[dict[str, Any]] = []
    for item in items:
        b64_json = str(item.get("b64_json") or "").strip()
        if not b64_json:
            continue
        revised_prompt = str(item.get("revised_prompt") or prompt).strip() or prompt
        if response_format == "b64_json":
            data.append({
                "b64_json": b64_json,
                "url": save_image_bytes(base64.b64decode(b64_json), base_url),
                "revised_prompt": revised_prompt,
            })
        else:
            data.append({
                "url": save_image_bytes(base64.b64decode(b64_json), base_url),
                "revised_prompt": revised_prompt,
            })
    result: dict[str, Any] = {"created": created or int(time.time()), "data": data}
    if message and not data:
        result["message"] = message
    return result


@dataclass
class ConversationRequest:
    model: str = "auto"
    prompt: str = ""
    messages: list[dict[str, Any]] | None = None
    images: list[str] | None = None
    n: int = 1
    size: str | None = None
    response_format: str = "b64_json"
    base_url: str | None = None
    request_id: str = ""
    message_as_error: bool = False


@dataclass
class ConversationState:
    text: str = ""
    conversation_id: str = ""
    file_ids: list[str] = field(default_factory=list)
    sediment_ids: list[str] = field(default_factory=list)
    blocked: bool = False
    tool_invoked: bool | None = None
    turn_use_case: str = ""


@dataclass
class ImageOutput:
    kind: str
    model: str
    index: int
    total: int
    created: int = field(default_factory=lambda: int(time.time()))
    text: str = ""
    upstream_event_type: str = ""
    data: list[dict[str, Any]] = field(default_factory=list)

    def to_chunk(self) -> dict[str, Any]:
        chunk: dict[str, Any] = {
            "object": "image.generation.chunk",
            "created": self.created,
            "model": self.model,
            "index": self.index,
            "total": self.total,
            "progress_text": self.text,
            "upstream_event_type": self.upstream_event_type,
            "data": [],
        }
        if self.kind == "message":
            chunk.update({
                "object": "image.generation.message",
                "message": self.text,
            })
            chunk.pop("progress_text", None)
            chunk.pop("upstream_event_type", None)
        elif self.kind == "result":
            chunk.update({
                "object": "image.generation.result",
                "data": self.data,
            })
            chunk.pop("progress_text", None)
            chunk.pop("upstream_event_type", None)
        return chunk


def content_value_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(content_value_text(item) for item in value)
    if not isinstance(value, dict):
        return ""
    for key in ("text", "value", "plain_text"):
        text = value.get(key)
        if isinstance(text, str):
            return text
    nested_content = value.get("content")
    nested_text = content_value_text(nested_content)
    if nested_text:
        return nested_text
    parts = value.get("parts")
    if isinstance(parts, list):
        return "".join(content_value_text(part) for part in parts)
    return ""


def assistant_message_from_candidate(candidate: dict[str, Any]) -> dict[str, Any] | None:
    message = candidate.get("message")
    if isinstance(message, dict):
        return message
    if isinstance(candidate.get("author"), dict) and "content" in candidate:
        return candidate
    return None


def assistant_message_text(message: dict[str, Any]) -> str:
    return content_value_text(message.get("content"))


def strip_history(text: str, history_text: str = "") -> str:
    text = str(text or "")
    history_text = str(history_text or "")
    while history_text and text.startswith(history_text):
        text = text[len(history_text):]
    return text


def assistant_text(event: dict[str, Any], current_text: str = "", history_text: str = "") -> str:
    for candidate in (event, event.get("v")):
        if not isinstance(candidate, dict):
            continue
        message = assistant_message_from_candidate(candidate)
        if message is None:
            continue
        role = str((message.get("author") or {}).get("role") or "").strip().lower()
        if role != "assistant":
            continue
        text = assistant_message_text(message)
        if text:
            return strip_history(text, history_text)
    return apply_text_patch(event, current_text, history_text)


def event_assistant_text(event: dict[str, Any], history_text: str = "") -> str:
    for candidate in (event, event.get("v")):
        if not isinstance(candidate, dict):
            continue
        message = assistant_message_from_candidate(candidate)
        if isinstance(message, dict) and (message.get("author") or {}).get("role") == "assistant":
            return strip_history(assistant_message_text(message), history_text)
    return ""


def is_text_patch_path(path: object) -> bool:
    text = str(path or "")
    return bool(re.match(r"^/message/content(?:/.*)?$", text))


def is_upstream_control_text(value: object) -> bool:
    text = str(value or "").strip() if isinstance(value, str) else ""
    if not text:
        return False
    if "referenced_image_ids" in text or "referenced_image_urls" in text:
        return True
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return False
    return isinstance(parsed, dict) and bool(parsed.get("skipped_mainline"))


def is_image_turn_use_case(value: object) -> bool:
    text = re.sub(r"[_-]+", " ", str(value or "").strip().lower())
    return "image" in text or "picture" in text


def apply_text_patch(event: dict[str, Any], current_text: str = "", history_text: str = "") -> str:
    if is_text_patch_path(event.get("p")):
        return apply_patch_op(event, current_text, history_text)

    if not event.get("p") and event.get("o") in {"add", "append", "replace"}:
        return apply_patch_op(event, current_text, history_text)

    operations = event.get("v")
    if isinstance(operations, str) and not event.get("p") and not event.get("o"):
        if is_upstream_control_text(operations):
            return current_text
        return current_text + operations

    if event.get("o") == "patch" and isinstance(operations, list):
        text = current_text
        for item in operations:
            if isinstance(item, dict):
                text = apply_text_patch(item, text, history_text)
        return text

    if not isinstance(operations, list):
        return current_text

    text = current_text
    for item in operations:
        if isinstance(item, dict):
            text = apply_text_patch(item, text, history_text)
    return text


def apply_patch_op(operation: dict[str, Any], current_text: str, history_text: str = "") -> str:
    op = operation.get("o")
    value = content_value_text(operation.get("v"))
    if is_upstream_control_text(value):
        return current_text
    if op in {"add", "append"}:
        return current_text + value
    if op == "replace":
        return strip_history(value, history_text)
    return current_text


def add_unique(values: list[str], candidates: list[str]) -> None:
    for candidate in candidates:
        if candidate and candidate not in values:
            values.append(candidate)


def extract_conversation_ids(payload: str) -> tuple[str, list[str], list[str]]:
    conversation_match = re.search(r'"conversation_id"\s*:\s*"([^"]+)"', payload)
    conversation_id = conversation_match.group(1) if conversation_match else ""
    file_ids = re.findall(r"(file[-_][A-Za-z0-9]+)", payload)
    sediment_ids = re.findall(r"sediment://([A-Za-z0-9_-]+)", payload)
    return conversation_id, file_ids, sediment_ids


def is_image_tool_event(event: dict[str, Any]) -> bool:
    value = event.get("v")
    message = event.get("message") or (value.get("message") if isinstance(value, dict) else None)
    if not isinstance(message, dict):
        return False
    metadata = message.get("metadata") or {}
    author = message.get("author") or {}
    return author.get("role") == "tool" and metadata.get("async_task_type") == "image_gen"


def update_conversation_state(state: ConversationState, payload: str, event: dict[str, Any] | None = None) -> None:
    conversation_id, file_ids, sediment_ids = extract_conversation_ids(payload)
    if conversation_id and not state.conversation_id:
        state.conversation_id = conversation_id
    if isinstance(event, dict) and is_image_tool_event(event):
        add_unique(state.file_ids, file_ids)
        add_unique(state.sediment_ids, sediment_ids)
    if not isinstance(event, dict):
        return
    state.conversation_id = str(event.get("conversation_id") or state.conversation_id)
    value = event.get("v")
    if isinstance(value, dict):
        state.conversation_id = str(value.get("conversation_id") or state.conversation_id)
    if event.get("type") == "moderation":
        moderation = event.get("moderation_response")
        if isinstance(moderation, dict) and moderation.get("blocked") is True:
            state.blocked = True
    if event.get("type") == "server_ste_metadata":
        metadata = event.get("metadata")
        if isinstance(metadata, dict):
            if isinstance(metadata.get("tool_invoked"), bool):
                state.tool_invoked = metadata["tool_invoked"]
            state.turn_use_case = str(metadata.get("turn_use_case") or state.turn_use_case)


def conversation_base_event(event_type: str, state: ConversationState, **extra: Any) -> dict[str, Any]:
    return {
        "type": event_type,
        "text": state.text,
        "conversation_id": state.conversation_id,
        "file_ids": list(state.file_ids),
        "sediment_ids": list(state.sediment_ids),
        "blocked": state.blocked,
        "tool_invoked": state.tool_invoked,
        "turn_use_case": state.turn_use_case,
        **extra,
    }


def iter_conversation_payloads(payloads: Iterator[str], history_text: str = "",
                               history_messages: list[str] | None = None) -> Iterator[dict[str, Any]]:
    state = ConversationState()
    history_messages = history_messages or []
    history_index = 0
    for payload in payloads:
        # print(f"[upstream_sse] {payload}", flush=True)
        if not payload:
            continue
        if payload == "[DONE]":
            yield conversation_base_event("conversation.done", state, done=True)
            break
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            update_conversation_state(state, payload)
            yield conversation_base_event("conversation.raw", state, payload=payload)
            continue
        if not isinstance(event, dict):
            yield conversation_base_event("conversation.event", state, raw=event)
            continue
        update_conversation_state(state, payload, event)
        if history_index < len(history_messages) and event_assistant_text(event, history_text) == history_messages[history_index]:
            history_index += 1
            state.text = ""
            continue
        next_text = assistant_text(event, state.text, history_text)
        if next_text != state.text:
            delta = next_text[len(state.text):] if next_text.startswith(state.text) else next_text
            state.text = next_text
            yield conversation_base_event("conversation.delta", state, raw=event, delta=delta)
            continue
        yield conversation_base_event("conversation.event", state, raw=event)


def conversation_events(
    backend: OpenAIBackendAPI,
    messages: list[dict[str, Any]] | None = None,
    model: str = "auto",
    prompt: str = "",
    images: list[str] | None = None,
    size: str | None = None,
) -> Iterator[dict[str, Any]]:
    normalized = normalize_messages(messages or ([{"role": "user", "content": prompt}] if prompt else []))
    image_model = str(model or "").strip() in IMAGE_MODELS
    history_text = "" if image_model else assistant_history_text(normalized)
    history_messages = [] if image_model else assistant_history_messages(normalized)
    final_prompt = build_image_prompt(prompt, size) if image_model else prompt
    payloads = backend.stream_conversation(
        messages=normalized,
        model=model,
        prompt=final_prompt,
        images=images if image_model else None,
        system_hints=["picture_v2"] if image_model else None,
    )
    yield from iter_conversation_payloads(payloads, history_text, history_messages)


def text_backend() -> OpenAIBackendAPI:
    return OpenAIBackendAPI(access_token=account_service.get_text_access_token())


def stream_text_deltas(backend: OpenAIBackendAPI, request: ConversationRequest) -> Iterator[str]:
    for event in conversation_events(backend, messages=request.messages, model=request.model, prompt=request.prompt):
        if event.get("type") != "conversation.delta":
            continue
        delta = str(event.get("delta") or "")
        if delta:
            yield delta


def collect_text(backend: OpenAIBackendAPI, request: ConversationRequest) -> str:
    return "".join(stream_text_deltas(backend, request))


def stream_image_outputs(
        backend: OpenAIBackendAPI,
        request: ConversationRequest,
        index: int = 1,
        total: int = 1,
) -> Iterator[ImageOutput]:
    last: dict[str, Any] = {}
    for event in conversation_events(
            backend,
            prompt=request.prompt,
            model=request.model,
            images=request.images or [],
            size=request.size,
    ):
        last = event
        if event.get("type") == "conversation.delta":
            yield ImageOutput(
                kind="progress",
                model=request.model,
                index=index,
                total=total,
                text=str(event.get("delta") or ""),
                upstream_event_type="conversation.delta",
            )
            continue
        if event.get("type") == "conversation.event":
            raw = event.get("raw")
            raw_type = str(raw.get("type") or "") if isinstance(raw, dict) else ""
            yield ImageOutput(
                kind="progress",
                model=request.model,
                index=index,
                total=total,
                upstream_event_type=raw_type,
            )

    conversation_id = str(last.get("conversation_id") or "")
    file_ids = [str(item) for item in last.get("file_ids") or []]
    sediment_ids = [str(item) for item in last.get("sediment_ids") or []]
    message = str(last.get("text") or "").strip()
    image_turn = is_image_turn_use_case(last.get("turn_use_case"))
    is_text_response = (
        str(last.get("turn_use_case") or "").strip().lower() == "text"
        or (last.get("tool_invoked") is False and not image_turn)
    )
    logger.info({
        "event": "image_stream_resolve_start",
        "conversation_id": conversation_id,
        "file_ids": file_ids,
        "sediment_ids": sediment_ids,
        "tool_invoked": last.get("tool_invoked"),
        "turn_use_case": last.get("turn_use_case"),
    })
    if message and not file_ids and not sediment_ids and (last.get("blocked") or is_text_response):
        yield ImageOutput(kind="message", model=request.model, index=index, total=total, text=message)
        return

    image_urls = backend.resolve_conversation_image_urls(conversation_id, file_ids, sediment_ids)
    if image_urls:
        image_items = [
            {"b64_json": base64.b64encode(image_data).decode("ascii")}
            for image_data in backend.download_image_bytes(image_urls)
        ]
        data = format_image_result(
            image_items,
            request.prompt,
            request.response_format,
            request.base_url,
            int(time.time()),
        )["data"]
        if data:
            yield ImageOutput(kind="result", model=request.model, index=index, total=total, data=data)
        return

    if message and not image_turn:
        yield ImageOutput(kind="message", model=request.model, index=index, total=total, text=message)
        return

    raise ImageGenerationError(
        "image generation timed out before returning an image result",
        status_code=504,
        error_type="server_error",
        code="image_generation_timeout",
    )


def stream_image_outputs_with_pool(request: ConversationRequest) -> Iterator[ImageOutput]:
    if str(request.model or "").strip() not in IMAGE_MODELS:
        raise ImageGenerationError("unsupported image model,supported models: " + ", ".join(IMAGE_MODELS))

    emitted = False
    last_error = ""
    lease_owner = str(request.request_id or get_current_request_id() or "").strip() or None
    for index in range(1, request.n + 1):
        while True:
            try:
                lease = account_service.lease_available_account(lease_owner=lease_owner)
                token = lease.access_token
                log_service.add(
                    LOG_TYPE_ACCOUNT,
                    "获取账号租约",
                    {
                        "request_id": lease.lease_owner,
                        "lease_owner": lease.lease_owner,
                        "token": anonymize_token(token),
                        "index": index,
                        "total": request.n,
                    },
                    request_id=lease.lease_owner,
                )
            except RuntimeError as exc:
                if emitted:
                    return
                raise ImageGenerationError(str(exc) or "image generation failed") from exc

            emitted_for_token = False
            returned_message = False
            returned_result = False
            released = False

            def release_lease(success: bool | None, reason: str, error: str = "") -> None:
                nonlocal released
                if released:
                    return
                account_service.release_image_account(lease, success)
                released = True
                detail = {
                    "request_id": lease.lease_owner,
                    "lease_owner": lease.lease_owner,
                    "token": anonymize_token(token),
                    "success": success,
                    "reason": reason,
                }
                if error:
                    detail["error"] = error
                log_service.add(LOG_TYPE_ACCOUNT, "释放账号租约", detail, request_id=lease.lease_owner)

            try:
                backend = OpenAIBackendAPI(access_token=token)
                for output in stream_image_outputs(backend, request, index, request.n):
                    if output.kind == "message" and request.message_as_error:
                        raise ImageGenerationError(
                            output.text or "Image generation was rejected by upstream policy.",
                            status_code=400,
                            error_type="invalid_request_error",
                            code="content_policy_violation",
                        )
                    emitted = True
                    emitted_for_token = True
                    returned_message = output.kind == "message"
                    returned_result = returned_result or output.kind == "result"
                    yield output
                if returned_message or not returned_result:
                    release_lease(False, "message")
                    return
                release_lease(True, "result")
                break
            except ImageGenerationError:
                release_lease(False, "image_generation_error")
                raise
            except Exception as exc:
                last_error = str(exc)
                release_lease(False, "exception", last_error)
                logger.warning({
                    "event": "image_stream_fail",
                    "request_id": lease_owner,
                    "request_token": token,
                    "error": last_error,
                })
                if not emitted_for_token and is_token_invalid_error(last_error):
                    account_service.remove_invalid_token(token, "image_stream")
                    continue
                raise ImageGenerationError(last_error or "image generation failed") from exc
            finally:
                if not released:
                    if returned_result:
                        release_lease(True, "generator_closed_after_result")
                    elif emitted_for_token or returned_message:
                        release_lease(False, "generator_closed")
                    else:
                        release_lease(False, "generator_closed_before_output")

    if not emitted:
        raise ImageGenerationError(last_error or "image generation failed")


def stream_image_chunks(outputs: Iterable[ImageOutput]) -> Iterator[dict[str, Any]]:
    for output in outputs:
        yield output.to_chunk()


def collect_image_outputs(outputs: Iterable[ImageOutput]) -> dict[str, Any]:
    created = None
    data: list[dict[str, Any]] = []
    message = ""
    progress_parts: list[str] = []
    for output in outputs:
        created = created or output.created
        if output.kind == "progress" and output.text:
            progress_parts.append(output.text)
        elif output.kind == "message":
            message = output.text
        elif output.kind == "result":
            data.extend(output.data)

    result: dict[str, Any] = {"created": created or int(time.time()), "data": data}
    if not data:
        text = message or "".join(progress_parts).strip()
        if text:
            result["message"] = text
    return result
