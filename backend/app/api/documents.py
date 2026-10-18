from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_personal_workspace
from app.core.responses import success
from app.db.session import get_db
from app.models import Document, DocumentVersion, Folder, User, Workspace
from app.models.core import utcnow
from app.schemas.documents import DocumentCreate, DocumentPatch

router = APIRouter(prefix="/documents", tags=["documents"])


def document_summary(document: Document) -> dict[str, object]:
    return {
        "id": document.id,
        "folder_id": document.folder_id,
        "title": document.title,
        "is_favorite": document.is_favorite,
        "version": document.version,
        "deleted_at": document.deleted_at.isoformat() if document.deleted_at else None,
        "created_at": document.created_at.isoformat(),
        "updated_at": document.updated_at.isoformat(),
    }


def document_data(document: Document) -> dict[str, object]:
    data = document_summary(document)
    data["content"] = document.content
    return data


def own_document(db: Session, workspace: Workspace, document_id: str) -> Document:
    document = db.scalar(
        select(Document).where(Document.id == document_id, Document.workspace_id == workspace.id)
    )
    if document is None:
        raise HTTPException(404, {"code": "DOCUMENT_NOT_FOUND", "message": "文档不存在"})
    return document


def validate_folder(db: Session, workspace: Workspace, folder_id: str | None) -> None:
    if folder_id is None:
        return
    exists = db.scalar(
        select(Folder.id).where(
            Folder.id == folder_id,
            Folder.workspace_id == workspace.id,
            Folder.deleted_at.is_(None),
        )
    )
    if not exists:
        raise HTTPException(422, {"code": "INVALID_FOLDER", "message": "目标文件夹不存在"})


@router.get("")
def list_documents(
    request: Request,
    scope: str = Query(default="all", pattern="^(all|favorites|recent|trash)$"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    stmt = select(Document).where(Document.workspace_id == workspace.id)
    if scope == "trash":
        stmt = stmt.where(Document.deleted_at.is_not(None))
    else:
        stmt = stmt.where(Document.deleted_at.is_(None))
    if scope == "favorites":
        stmt = stmt.where(Document.is_favorite.is_(True))
    stmt = stmt.order_by(Document.updated_at.desc()).limit(limit).offset(offset)
    documents = db.scalars(stmt).all()
    return success(
        [document_summary(item) for item in documents],
        request=request,
        meta={"limit": limit, "offset": offset, "count": len(documents)},
    )


@router.post("", status_code=201)
def create_document(
    payload: DocumentCreate,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    validate_folder(db, workspace, payload.folder_id)
    document = Document(
        workspace_id=workspace.id,
        author_id=user.id,
        folder_id=payload.folder_id,
        title=payload.title.strip() or "未命名文档",
        content=payload.content,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return success(document_data(document), request=request)


@router.get("/{document_id}")
def get_document(
    document_id: str,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return success(document_data(own_document(db, workspace, document_id)), request=request)


@router.patch("/{document_id}")
def update_document(
    document_id: str,
    payload: DocumentPatch,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = own_document(db, workspace, document_id)
    if document.deleted_at is not None:
        raise HTTPException(409, {"code": "DOCUMENT_DELETED", "message": "回收站中的文档不能编辑"})
    if payload.version != document.version:
        raise HTTPException(
            409,
            {
                "code": "VERSION_CONFLICT",
                "message": "文档已在其他位置被更新，请刷新后重试",
                "current_version": document.version,
            },
        )
    values = payload.model_dump(exclude_unset=True)
    values.pop("version", None)
    if "folder_id" in values:
        validate_folder(db, workspace, values["folder_id"])
    content_changed = any(key in values for key in ("title", "content"))
    if content_changed:
        db.add(
            DocumentVersion(
                document_id=document.id,
                version=document.version,
                title=document.title,
                content=document.content,
                created_by=user.id,
            )
        )
    for key, value in values.items():
        if key == "title" and value is not None:
            value = value.strip() or "未命名文档"
        setattr(document, key, value)
    document.version += 1
    document.updated_at = utcnow()
    db.commit()
    db.refresh(document)
    return success(document_data(document), request=request)


@router.delete("/{document_id}")
def delete_document(
    document_id: str,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = own_document(db, workspace, document_id)
    document.deleted_at = utcnow()
    document.updated_at = utcnow()
    db.commit()
    return success({"deleted": True}, request=request)


@router.post("/{document_id}/restore")
def restore_document(
    document_id: str,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = own_document(db, workspace, document_id)
    document.deleted_at = None
    document.updated_at = utcnow()
    db.commit()
    db.refresh(document)
    return success(document_data(document), request=request)


@router.delete("/{document_id}/permanent")
def permanent_delete_document(
    document_id: str,
    request: Request,
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = own_document(db, workspace, document_id)
    db.execute(delete(Document).where(Document.id == document.id))
    db.commit()
    return success({"deleted": True, "permanent": True}, request=request)
