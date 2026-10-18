from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_personal_workspace
from app.api.documents import own_document
from app.core.markdown import render_markdown_html
from app.core.responses import success
from app.db.session import get_db
from app.models import Publication, Workspace
from app.models.core import utcnow
from app.schemas.publishing import PublishInput

router = APIRouter(tags=["publishing"])


def publication_data(publication: Publication) -> dict[str, object]:
    return {
        "id": publication.id,
        "document_id": publication.document_id,
        "slug": publication.slug,
        "title": publication.published_title,
        "content": publication.published_content,
        "published_at": publication.published_at.isoformat(),
        "updated_at": publication.updated_at.isoformat(),
        "revoked_at": publication.revoked_at.isoformat() if publication.revoked_at else None,
    }


@router.get("/documents/{document_id}/publish")
def publication_status(
    document_id: str,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = own_document(db, workspace, document_id)
    publication = db.scalar(select(Publication).where(Publication.document_id == document.id))
    if publication is None:
        return success({"published": False, "publication": None}, request=request)
    return success(
        {"published": publication.revoked_at is None, "publication": publication_data(publication)},
        request=request,
    )


@router.post("/documents/{document_id}/publish")
def publish_document(
    document_id: str,
    payload: PublishInput,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = own_document(db, workspace, document_id)
    publication = db.scalar(select(Publication).where(Publication.document_id == document.id))
    now = utcnow()
    if publication is None:
        publication = Publication(
            document_id=document.id,
            slug=payload.slug,
            published_title=document.title,
            published_content=document.content,
            published_at=now,
        )
        db.add(publication)
    else:
        publication.slug = payload.slug
        publication.published_title = document.title
        publication.published_content = document.content
        publication.published_at = now
        publication.updated_at = now
        publication.revoked_at = None
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, {"code": "SLUG_EXISTS", "message": "该公开地址已被使用"}) from exc
    db.refresh(publication)
    return success(publication_data(publication), request=request)


@router.delete("/documents/{document_id}/publish")
def revoke_publication(
    document_id: str,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = own_document(db, workspace, document_id)
    publication = db.scalar(select(Publication).where(Publication.document_id == document.id))
    if publication is None:
        raise HTTPException(404, {"code": "PUBLICATION_NOT_FOUND", "message": "文档尚未发布"})
    publication.revoked_at = utcnow()
    db.commit()
    return success({"revoked": True}, request=request)


@router.get("/documents/{document_id}/export")
def export_document(
    document_id: str,
    request: Request,
    format: str = Query(default="markdown", pattern="^(markdown|html)$"),
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = own_document(db, workspace, document_id)
    if format == "html":
        body = render_markdown_html(document.content)
        safe_title = bleach_title(document.title)
        content = (
            "<!doctype html><html><head><meta charset='utf-8'>"
            f"<title>{safe_title}</title></head><body>{body}</body></html>"
        )
        return success(
            {
                "content": content,
                "filename": f"{document.title}.html",
                "mime_type": "text/html;charset=utf-8",
            },
            request=request,
        )
    return success(
        {
            "content": document.content,
            "filename": f"{document.title}.md",
            "mime_type": "text/markdown;charset=utf-8",
        },
        request=request,
    )


def bleach_title(value: str) -> str:
    import html

    return html.escape(value, quote=True)


@router.get("/publications/{slug}")
def get_publication(
    slug: str, request: Request, db: Session = Depends(get_db)
) -> dict[str, object]:
    publication = db.scalar(
        select(Publication).where(Publication.slug == slug, Publication.revoked_at.is_(None))
    )
    if publication is None:
        raise HTTPException(
            404, {"code": "PUBLICATION_NOT_FOUND", "message": "公开页面不存在或已撤回"}
        )
    return success(publication_data(publication), request=request)
