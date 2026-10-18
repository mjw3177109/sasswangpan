from datetime import datetime

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_session_token
from app.db.session import get_db
from app.models import User, UserSession, Workspace


def get_current_user(
    db: Session = Depends(get_db),
    session_token: str | None = Cookie(default=None, alias=settings.session_cookie_name),
) -> User:
    if not session_token:
        raise HTTPException(401, {"code": "AUTH_REQUIRED", "message": "请先登录"})
    token_hash = hash_session_token(session_token)
    session = db.scalar(
        select(UserSession).where(
            UserSession.token_hash == token_hash,
            UserSession.expires_at > datetime.utcnow(),
        )
    )
    if session is None:
        raise HTTPException(401, {"code": "SESSION_INVALID", "message": "登录状态已失效"})
    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(403, {"code": "USER_DISABLED", "message": "账号不可用"})
    return user


def get_personal_workspace(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Workspace:
    workspace = db.scalar(
        select(Workspace).where(Workspace.owner_id == user.id, Workspace.kind == "personal")
    )
    if workspace is None:
        raise HTTPException(500, {"code": "WORKSPACE_MISSING", "message": "个人空间不存在"})
    return workspace


def require_site_admin(user: User = Depends(get_current_user)) -> User:
    if user.email.strip().lower() not in settings.site_admin_email_set:
        raise HTTPException(403, {"code": "SITE_ADMIN_REQUIRED", "message": "需要站点管理员权限"})
    return user
