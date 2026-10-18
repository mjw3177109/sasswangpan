import logging
import time
from uuid import uuid4

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.core.metrics import HTTP_DURATION, HTTP_REQUESTS

logger = logging.getLogger("mofan.request")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or uuid4().hex
        request.state.request_id = request_id
        started = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.info(
                "request method=%s path=%s request_id=%s duration_ms=%.2f",
                request.method,
                request.url.path,
                request_id,
                elapsed_ms,
            )
        response.headers["X-Request-ID"] = request_id
        route = request.scope.get("route")
        path_label = getattr(route, "path", request.url.path)
        HTTP_REQUESTS.labels(request.method, path_label, str(response.status_code)).inc()
        HTTP_DURATION.labels(request.method, path_label).observe(elapsed_ms / 1000.0)
        return response
