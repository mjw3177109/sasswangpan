import logging

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.responses import error_payload

logger = logging.getLogger("mofan.errors")


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    code = "HTTP_ERROR"
    message = str(exc.detail)
    if isinstance(exc.detail, dict):
        code = str(exc.detail.get("code", code))
        message = str(exc.detail.get("message", message))
    return JSONResponse(
        status_code=exc.status_code, content=error_payload(code, message, request=request)
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=error_payload(
            "VALIDATION_ERROR", "请求参数校验失败", request=request, details=exc.errors()
        ),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "unhandled_exception request_id=%s path=%s",
        getattr(request.state, "request_id", "-"),
        request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content=error_payload("INTERNAL_ERROR", "服务器内部错误", request=request),
    )
