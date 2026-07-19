"""Typed, redacted MusicCloud SDK errors."""

from __future__ import annotations

import asyncio
import json
import re
import socket
import ssl
from typing import Any, Mapping, Optional, Union
from uuid import UUID


class MusiccloudErrorCode:
    AUTHENTICATION_REQUIRED = "MC-AUTH-0001"
    PERMISSION_DENIED = "MC-AUTH-0002"
    RATE_LIMITED = "MC-API-0003"
    REQUEST_TIMEOUT = "MC-API-0005"
    INVALID_REQUEST = "MC-REQ-0001"
    REQUEST_CONFLICT = "MC-REQ-0002"
    RESOURCE_NOT_FOUND = "MC-RES-0003"
    UNEXPECTED_SERVER_ERROR = "MC-SYS-0001"
    BACKEND_UNAVAILABLE = "MC-SYS-0002"


_MC_ERROR_CODE_PATTERN = re.compile(
    r"^MC-(URL|API|AUTH|RES|DB|CFG|MAP|REQ|SYS)-\d{3,4}$"
)
_SENSITIVE_CONTEXT_KEY = re.compile(
    r"authorization|dpop|api[-_]?key|private[-_]?key|password|secret|token",
    re.IGNORECASE,
)
_RETRY_HEADER_NAMES = {
    "retry-after",
    "ratelimit-limit",
    "ratelimit-remaining",
    "ratelimit-reset",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
}


class MusiccloudApiError(Exception):
    def __init__(
        self,
        *,
        code: str,
        safe_message: str,
        error_id: str,
        status: int,
        context: Optional[Mapping[str, Union[str, int, float]]] = None,
        retry_headers: Optional[Mapping[str, str]] = None,
    ) -> None:
        super().__init__(safe_message)
        self.code = code
        self.safe_message = safe_message
        self.error_id = error_id
        self.status = status
        self.context = dict(context) if context else None
        self.retry_headers = dict(retry_headers or {})

    @property
    def is_authentication_error(self) -> bool:
        return self.status in (401, 403) or self.code.startswith("MC-AUTH-")

    @property
    def is_rate_limit_error(self) -> bool:
        return self.status == 429 or self.code == MusiccloudErrorCode.RATE_LIMITED

    @property
    def is_retryable(self) -> bool:
        return self.status in (408, 429) or self.status >= 500

    @property
    def retry_after_seconds(self) -> Optional[float]:
        value: object = self.retry_headers.get("retry-after")
        if value is None and self.context:
            value = self.context.get("retryAfterSeconds")
        try:
            parsed = float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None
        return parsed if parsed >= 0 else None

    def __str__(self) -> str:
        return (
            f"{self.safe_message} "
            f"[{self.code}; errorId={self.error_id}; status={self.status}]"
        )


class MusiccloudProtocolError(Exception):
    def __init__(
        self,
        status: int,
        reason: str,
        body_length: int,
        content_type: Optional[str],
    ) -> None:
        super().__init__(
            f"MusicCloud returned an invalid error response ({reason}; status={status})."
        )
        self.status = status
        self.reason = reason
        self.body_length = body_length
        self.content_type = content_type


class MusiccloudTransportError(Exception):
    def __init__(self, kind: str) -> None:
        super().__init__(
            "The MusicCloud request failed before an HTTP error response was "
            f"received ({kind})."
        )
        self.kind = kind


def parse_musiccloud_error_response(
    status: int, headers: Optional[Mapping[str, str]], body: str
) -> Union[MusiccloudApiError, MusiccloudProtocolError]:
    normalized_headers = {
        str(key).lower(): str(value) for key, value in (headers or {}).items()
    }
    content_type = normalized_headers.get("content-type")
    body_length = len(body.encode("utf-8"))
    stripped_body = body.strip()
    if not stripped_body:
        return MusiccloudProtocolError(status, "empty-body", body_length, content_type)

    if content_type is not None and "json" not in content_type.lower():
        return MusiccloudProtocolError(
            status, "unexpected-content-type", body_length, content_type
        )

    try:
        payload = json.loads(stripped_body, parse_constant=_reject_json_constant)
    except (json.JSONDecodeError, TypeError, ValueError):
        return MusiccloudProtocolError(status, "invalid-json", body_length, content_type)

    if not _is_error_envelope(payload):
        return MusiccloudProtocolError(
            status, "invalid-envelope", body_length, content_type
        )

    context = {
        key: value
        for key, value in (payload.get("context") or {}).items()
        if not _SENSITIVE_CONTEXT_KEY.search(key)
    }
    retry_headers = {
        key: value
        for key, value in normalized_headers.items()
        if key in _RETRY_HEADER_NAMES
    }
    return MusiccloudApiError(
        code=payload["error"],
        safe_message=payload["message"],
        error_id=payload["errorId"],
        status=status,
        context=context or None,
        retry_headers=retry_headers,
    )


def classify_musiccloud_transport_error(
    cause: BaseException,
) -> MusiccloudTransportError:
    causes = list(_transport_causes(cause))
    class_names = [type(item).__name__.lower() for item in causes]
    if any(isinstance(item, asyncio.CancelledError) for item in causes):
        return MusiccloudTransportError("cancelled")
    if any(isinstance(item, TimeoutError) for item in causes) or any(
        "timeout" in name for name in class_names
    ):
        return MusiccloudTransportError("timeout")
    if any(isinstance(item, socket.gaierror) for item in causes) or any(
        "nameresolution" in name or "dns" in name for name in class_names
    ):
        return MusiccloudTransportError("dns")
    if any(isinstance(item, ssl.SSLError) for item in causes) or any(
        "ssl" in name or "tls" in name or "certificate" in name
        for name in class_names
    ):
        return MusiccloudTransportError("tls")
    return MusiccloudTransportError("network")


def _transport_causes(cause: BaseException):
    pending = [cause]
    seen = set()
    while pending:
        current = pending.pop(0)
        if id(current) in seen:
            continue
        seen.add(id(current))
        yield current
        for attribute in ("reason", "__cause__", "__context__"):
            nested = getattr(current, attribute, None)
            if isinstance(nested, BaseException):
                pending.append(nested)


def _is_error_envelope(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    code = value.get("error")
    message = value.get("message")
    error_id = value.get("errorId")
    if not isinstance(code, str) or not _MC_ERROR_CODE_PATTERN.fullmatch(code):
        return False
    if not isinstance(message, str) or not message:
        return False
    if not isinstance(error_id, str) or not _is_uuid(error_id):
        return False
    context = value.get("context")
    if context is None:
        return True
    if not isinstance(context, dict):
        return False
    return all(
        isinstance(key, str)
        and not isinstance(item, bool)
        and isinstance(item, (str, int, float))
        for key, item in context.items()
    )


def _reject_json_constant(value: str):
    raise ValueError(f"Invalid JSON constant: {value}")


def _is_uuid(value: str) -> bool:
    try:
        UUID(value)
    except ValueError:
        return False
    return True
