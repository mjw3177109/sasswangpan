from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_personal_workspace
from app.api.documents import document_data, own_document
from app.core.responses import success
from app.db.session import get_db
from app.models import DocumentVersion, User, Workspace
from app.models.core import utcnow

router = APIRouter(prefix="/documents", tags=["history"])


def version_data(item: DocumentVersion, *, include_content: bool = False) -> dict[str, object]:
    data: dict[str, object] = {
        "id": item.id,
        "document_id": item.document_id,
        "version": item.version,
        "title": item.title,
        "created_by": item.created_by,
        "created_at": item.created_at.isoformat(),
    }
    if include_content:
        data["content"] = item.content
    return data


@router.get("/{document_id}/versions")
def list_versions(
    document_id: str,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = own_document(db, workspace, document_id)
    versions = db.scalars(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document.id)
        .order_by(DocumentVersion.version.desc())
        .limit(100)
    ).all()
    return success([version_data(item) for item in versions], request=request)


@router.get("/{document_id}/versions/{version_id}")
def get_version(
    document_id: str,
    version_id: str,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = own_document(db, workspace, document_id)
    version = db.scalar(
        select(DocumentVersion).where(
            DocumentVersion.id == version_id,
            DocumentVersion.document_id == document.id,
        )
    )
    if version is None:
        raise HTTPException(404, {"code": "VERSION_NOT_FOUND", "message": "历史版本不存在"})
    return success(version_data(version, include_content=True), request=request)


@router.post("/{document_id}/versions/{version_id}/restore")
def restore_version(
    document_id: str,
    version_id: str,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = own_document(db, workspace, document_id)
    target = db.scalar(
        select(DocumentVersion).where(
            DocumentVersion.id == version_id,
            DocumentVersion.document_id == document.id,
        )
    )
    if target is None:
        raise HTTPException(404, {"code": "VERSION_NOT_FOUND", "message": "历史版本不存在"})
    db.add(
        DocumentVersion(
            document_id=document.id,
            version=document.version,
            title=document.title,
            content=document.content,
            created_by=user.id,
        )
    )
    document.title = target.title
    document.content = target.content
    document.version += 1
    document.updated_at = utcnow()
    db.commit()
    db.refresh(document)
    return success(document_data(document), request=request)
