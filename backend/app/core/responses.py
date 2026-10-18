from typing import Any

from fastapi import Request


def success(
    data: Any = None, *, request: Request | None = None, meta: dict[str, Any] | None = None
) -> dict[str, Any]:
    response_meta: dict[str, Any] = dict(meta or {})
    if request is not None:
        request_id = getattr(request.state, "request_id", None)
        if request_id:
            response_meta["request_id"] = request_id
    return {"data": data, "meta": response_meta}


def error_payload(
    code: str, message: str, *, request: Request | None = None, details: Any = None
) -> dict[str, Any]:
    payload: dict[str, Any] = {"error": {"code": code, "message": message}}
    if details is not None:
        payload["error"]["details"] = details
    request_id = getattr(request.state, "request_id", None) if request is not None else None
    if request_id:
        payload["meta"] = {"request_id": request_id}
    return payload
