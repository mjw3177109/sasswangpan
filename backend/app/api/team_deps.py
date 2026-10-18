from dataclasses import dataclass

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User, Workspace, WorkspaceMember

ROLE_LEVEL = {"viewer": 1, "editor": 2, "admin": 3, "owner": 4}


@dataclass
class WorkspaceAccess:
    workspace: Workspace
    role: str
    user: User


def workspace_access(
    workspace_id: str,
    minimum_role: str = "viewer",
    user: User | None = None,
    db: Session | None = None,
) -> WorkspaceAccess:
    if user is None or db is None:
        raise RuntimeError("workspace_access requires user and db")
    workspace = db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(404, {"code": "WORKSPACE_NOT_FOUND", "message": "工作空间不存在"})
    role: str | None = None
    if workspace.owner_id == user.id:
        role = "owner"
    elif workspace.kind == "team":
        membership = db.scalar(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace.id,
                WorkspaceMember.user_id == user.id,
            )
        )
        if membership is not None:
            role = membership.role
    if role is None or ROLE_LEVEL.get(role, 0) < ROLE_LEVEL.get(minimum_role, 0):
        raise HTTPException(
            403, {"code": "WORKSPACE_FORBIDDEN", "message": "没有该工作空间的访问权限"}
        )
    return WorkspaceAccess(workspace=workspace, role=role, user=user)


def team_view_access(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkspaceAccess:
    return workspace_access(workspace_id, "viewer", user, db)


def team_edit_access(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkspaceAccess:
    return workspace_access(workspace_id, "editor", user, db)


def team_admin_access(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkspaceAccess:
    return workspace_access(workspace_id, "admin", user, db)
