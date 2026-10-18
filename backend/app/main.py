from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.api.attachments import router as attachments_router
from app.api.auth import router as auth_router
from app.api.billing import router as billing_router
from app.api.collaboration import router as collaboration_router
from app.api.comments import router as comments_router
from app.api.documents import router as documents_router
from app.api.folders import router as folders_router
from app.api.health import router as health_router
from app.api.history import router as history_router
from app.api.notifications import router as notifications_router
from app.api.publishing import router as publishing_router
from app.api.search import router as search_router
from app.api.team_documents import router as team_documents_router
from app.api.team_folders import router as team_folders_router
from app.api.teams import router as teams_router
from app.api.tools import router as tools_router
from app.api.workspace import router as workspace_router
from app.core.config import settings
from app.core.errors import (
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.core.responses import success

configure_logging()

app = FastAPI(title=settings.app_name, version=settings.app_version)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)
app.include_router(health_router, prefix=settings.api_prefix)
app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(billing_router, prefix=settings.api_prefix)
app.include_router(folders_router, prefix=settings.api_prefix)
app.include_router(documents_router, prefix=settings.api_prefix)
app.include_router(search_router, prefix=settings.api_prefix)
app.include_router(publishing_router, prefix=settings.api_prefix)
app.include_router(history_router, prefix=settings.api_prefix)
app.include_router(attachments_router, prefix=settings.api_prefix)
app.include_router(tools_router, prefix=settings.api_prefix)
app.include_router(workspace_router, prefix=settings.api_prefix)
app.include_router(teams_router, prefix=settings.api_prefix)
app.include_router(team_documents_router, prefix=settings.api_prefix)
app.include_router(team_folders_router, prefix=settings.api_prefix)
app.include_router(comments_router, prefix=settings.api_prefix)
app.include_router(notifications_router, prefix=settings.api_prefix)
app.include_router(collaboration_router, prefix=settings.api_prefix)


@app.get("/")
def root(request: Request) -> dict[str, object]:
    return success(
        {
            "name": settings.app_name,
            "version": settings.app_version,
            "docs": "/docs",
            "health": f"{settings.api_prefix}/health",
        },
        request=request,
    )
