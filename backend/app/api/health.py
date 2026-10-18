from fastapi import APIRouter, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.core.redis_client import check_redis
from app.core.responses import success
from app.db.session import check_database

router = APIRouter(tags=["system"])


def dependency_status() -> dict[str, bool]:
    services = {"supabase_postgres": False, "redis": False}
    try:
        services["supabase_postgres"] = check_database()
    except Exception:
        services["supabase_postgres"] = False
    try:
        services["redis"] = check_redis()
    except Exception:
        services["redis"] = False
    return services


@router.get("/health")
def health(request: Request) -> dict[str, object]:
    services = dependency_status()
    return success(
        {"status": "ok" if all(services.values()) else "degraded", "services": services},
        request=request,
    )


@router.get("/ping")
def ping(request: Request) -> dict[str, object]:
    return success({"message": "pong"}, request=request)


@router.get("/ready")
def ready(request: Request) -> dict[str, object]:
    services = dependency_status()
    if not all(services.values()):
        from fastapi import HTTPException

        raise HTTPException(
            503, {"code": "NOT_READY", "message": "依赖服务尚未就绪", "services": services}
        )
    return success({"ready": True, "services": services}, request=request)


@router.get("/metrics", include_in_schema=False)
def metrics() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
