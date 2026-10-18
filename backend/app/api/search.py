from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_personal_workspace
from app.api.documents import document_summary
from app.core.responses import success
from app.db.session import get_db
from app.models import Document, Workspace

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
def search_documents(
    request: Request,
    q: str = Query(min_length=1, max_length=100),
    limit: int = Query(default=30, ge=1, le=100),
    workspace: Workspace = Depends(get_personal_workspace),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    pattern = f"%{q.strip()}%"
    documents = db.scalars(
        select(Document)
        .where(
            Document.workspace_id == workspace.id,
            Document.deleted_at.is_(None),
            or_(Document.title.like(pattern), Document.content.like(pattern)),
        )
        .order_by(Document.updated_at.desc())
        .limit(limit)
    ).all()
    return success(
        [document_summary(item) for item in documents],
        request=request,
        meta={"query": q, "count": len(documents)},
    )
