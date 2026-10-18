import json
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.team_deps import team_view_access
from app.core.responses import success
from app.db.session import get_db
from app.models import ActivityLog, Comment, Document, Notification, User, WorkspaceMember
from app.models.core import utcnow
from app.schemas.team import CommentCreate, CommentPatch

router = APIRouter(
    prefix="/teams/{workspace_id}/documents/{document_id}/comments", tags=["comments"]
)


def comment_data(comment: Comment, author: User) -> dict[str, object]:
    return {
        "id": comment.id,
        "document_id": comment.document_id,
        "author": {"id": author.id, "name": author.name, "email": author.email},
        "parent_id": comment.parent_id,
        "body": comment.body,
        "resolved_at": comment.resolved_at.isoformat() if comment.resolved_at else None,
        "created_at": comment.created_at.isoformat(),
        "updated_at": comment.updated_at.isoformat(),
    }


def validate_document(db: Session, workspace_id: str, document_id: str) -> None:
    if not db.scalar(
        select(Document.id).where(Document.id == document_id, Document.workspace_id == workspace_id)
    ):
        raise HTTPException(404, {"code": "DOCUMENT_NOT_FOUND", "message": "文档不存在"})


def notify_mentions(
    db: Session, workspace_id: str, author_id: str, body: str, document_id: str, comment_id: str
) -> None:
    names = {item.strip().lower() for item in re.findall(r"@([\w.\-+]+(?:@[\w.\-]+)?)", body)}
    if not names:
        return
    rows = (
        db.execute(
            select(User)
            .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
            .where(WorkspaceMember.workspace_id == workspace_id)
        )
        .scalars()
        .all()
    )
    for user in rows:
        if user.id == author_id:
            continue
        local = user.email.split("@", 1)[0].lower()
        if user.email.lower() in names or local in names or user.name.lower() in names:
            db.add(
                Notification(
                    user_id=user.id,
                    kind="comment.mention",
                    payload=json.dumps(
                        {
                            "workspace_id": workspace_id,
                            "document_id": document_id,
                            "comment_id": comment_id,
                        },
                        ensure_ascii=False,
                    ),
                )
            )


@router.get("")
def list_comments(
    workspace_id: str,
    document_id: str,
    request: Request,
    access=Depends(team_view_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    validate_document(db, workspace_id, document_id)
    rows = db.execute(
        select(Comment, User)
        .join(User, User.id == Comment.author_id)
        .where(Comment.workspace_id == workspace_id, Comment.document_id == document_id)
        .order_by(Comment.created_at.asc())
    ).all()
    return success([comment_data(comment, author) for comment, author in rows], request=request)


@router.post("", status_code=201)
def create_comment(
    workspace_id: str,
    document_id: str,
    payload: CommentCreate,
    request: Request,
    access=Depends(team_view_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    validate_document(db, workspace_id, document_id)
    if payload.parent_id and not db.scalar(
        select(Comment.id).where(
            Comment.id == payload.parent_id, Comment.document_id == document_id
        )
    ):
        raise HTTPException(422, {"code": "INVALID_PARENT_COMMENT", "message": "父评论不存在"})
    comment = Comment(
        workspace_id=workspace_id,
        document_id=document_id,
        author_id=access.user.id,
        parent_id=payload.parent_id,
        body=payload.body.strip(),
    )
    db.add(comment)
    db.flush()
    notify_mentions(db, workspace_id, access.user.id, comment.body, document_id, comment.id)
    db.add(
        ActivityLog(
            workspace_id=workspace_id,
            actor_id=access.user.id,
            action="comment.created",
            entity_type="comment",
            entity_id=comment.id,
            payload="{}",
        )
    )
    db.commit()
    db.refresh(comment)
    return success(comment_data(comment, access.user), request=request)


@router.patch("/{comment_id}")
def update_comment(
    workspace_id: str,
    document_id: str,
    comment_id: str,
    payload: CommentPatch,
    request: Request,
    access=Depends(team_view_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    comment = db.scalar(
        select(Comment).where(
            Comment.id == comment_id,
            Comment.workspace_id == workspace_id,
            Comment.document_id == document_id,
        )
    )
    if comment is None:
        raise HTTPException(404, {"code": "COMMENT_NOT_FOUND", "message": "评论不存在"})
    can_manage = comment.author_id == access.user.id or access.role in {"owner", "admin", "editor"}
    if not can_manage:
        raise HTTPException(403, {"code": "COMMENT_FORBIDDEN", "message": "没有权限修改该评论"})
    if payload.body is not None:
        comment.body = payload.body.strip()
        notify_mentions(db, workspace_id, access.user.id, comment.body, document_id, comment.id)
    if payload.resolved is not None:
        if access.role == "viewer" and comment.author_id != access.user.id:
            raise HTTPException(
                403, {"code": "COMMENT_RESOLVE_FORBIDDEN", "message": "没有权限解决该评论"}
            )
        comment.resolved_at = utcnow() if payload.resolved else None
    comment.updated_at = utcnow()
    db.commit()
    db.refresh(comment)
    author = db.get(User, comment.author_id)
    return success(comment_data(comment, author), request=request)
