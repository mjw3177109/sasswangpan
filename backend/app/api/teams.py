import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.team_deps import team_admin_access, team_view_access
from app.core.responses import success
from app.db.session import get_db
from app.models import ActivityLog, Invitation, Notification, User, Workspace, WorkspaceMember
from app.models.team import invitation_expiry, new_invitation_token
from app.schemas.team import InviteCreate, MemberRolePatch, TeamCreate

router = APIRouter(prefix="/teams", tags=["teams"])


def team_data(workspace: Workspace, role: str) -> dict[str, object]:
    return {
        "id": workspace.id,
        "name": workspace.name,
        "kind": workspace.kind,
        "role": role,
        "created_at": workspace.created_at.isoformat(),
        "updated_at": workspace.updated_at.isoformat(),
    }


def add_activity(
    db: Session,
    workspace_id: str,
    actor_id: str,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    payload: dict[str, object] | None = None,
) -> None:
    db.add(
        ActivityLog(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            payload=json.dumps(payload or {}, ensure_ascii=False),
        )
    )


@router.get("")
def list_teams(
    request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict[str, object]:
    owned = db.scalars(
        select(Workspace).where(Workspace.kind == "team", Workspace.owner_id == user.id)
    ).all()
    memberships = db.execute(
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(Workspace.kind == "team", WorkspaceMember.user_id == user.id)
    ).all()
    items = [team_data(item, "owner") for item in owned]
    owned_ids = {item.id for item in owned}
    items.extend(
        team_data(workspace, role)
        for workspace, role in memberships
        if workspace.id not in owned_ids
    )
    return success(items, request=request)


@router.post("", status_code=201)
def create_team(
    payload: TeamCreate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    workspace = Workspace(owner_id=user.id, name=payload.name.strip(), kind="team")
    db.add(workspace)
    db.flush()
    db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role="owner"))
    add_activity(db, workspace.id, user.id, "workspace.created", "workspace", workspace.id)
    db.commit()
    db.refresh(workspace)
    return success(team_data(workspace, "owner"), request=request)


@router.get("/{workspace_id}")
def get_team(
    workspace_id: str, request: Request, access=Depends(team_view_access)
) -> dict[str, object]:
    return success(team_data(access.workspace, access.role), request=request)


@router.get("/{workspace_id}/members")
def list_members(
    workspace_id: str,
    request: Request,
    access=Depends(team_view_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    rows = db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.joined_at.asc())
    ).all()
    return success(
        [
            {
                "id": member.id,
                "user_id": user.id,
                "email": user.email,
                "name": user.name,
                "avatar_url": user.avatar_url,
                "role": member.role,
                "joined_at": member.joined_at.isoformat(),
            }
            for member, user in rows
        ],
        request=request,
    )


@router.post("/{workspace_id}/invitations", status_code=201)
def invite_member(
    workspace_id: str,
    payload: InviteCreate,
    request: Request,
    access=Depends(team_admin_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    email = str(payload.email).strip().lower()
    existing_user = db.scalar(select(User).where(User.email == email))
    if existing_user and db.scalar(
        select(WorkspaceMember.id).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == existing_user.id,
        )
    ):
        raise HTTPException(409, {"code": "ALREADY_MEMBER", "message": "该用户已经是团队成员"})
    raw_token = new_invitation_token()
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    invitation = Invitation(
        workspace_id=workspace_id,
        email=email,
        role=payload.role,
        token_hash=token_hash,
        invited_by=access.user.id,
        expires_at=invitation_expiry(),
    )
    db.add(invitation)
    add_activity(
        db,
        workspace_id,
        access.user.id,
        "member.invited",
        "invitation",
        invitation.id,
        {"email": email, "role": payload.role},
    )
    db.commit()
    db.refresh(invitation)
    return success(
        {
            "id": invitation.id,
            "email": email,
            "role": invitation.role,
            "token": raw_token,
            "expires_at": invitation.expires_at.isoformat(),
        },
        request=request,
    )


@router.post("/invitations/{token}/accept")
def accept_invitation(
    token: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    invitation = db.scalar(select(Invitation).where(Invitation.token_hash == token_hash))
    if invitation is None or invitation.accepted_at is not None:
        raise HTTPException(404, {"code": "INVITATION_NOT_FOUND", "message": "邀请不存在或已使用"})
    from app.models.core import utcnow

    if invitation.expires_at <= utcnow():
        raise HTTPException(410, {"code": "INVITATION_EXPIRED", "message": "邀请已过期"})
    if invitation.email.lower() != user.email.lower():
        raise HTTPException(
            403, {"code": "INVITATION_EMAIL_MISMATCH", "message": "请使用被邀请邮箱登录"}
        )
    existing = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == invitation.workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    if existing is None:
        db.add(
            WorkspaceMember(
                workspace_id=invitation.workspace_id, user_id=user.id, role=invitation.role
            )
        )
    invitation.accepted_at = utcnow()
    db.add(
        Notification(
            user_id=user.id,
            kind="team.joined",
            payload=json.dumps({"workspace_id": invitation.workspace_id}, ensure_ascii=False),
        )
    )
    add_activity(db, invitation.workspace_id, user.id, "member.joined", "user", user.id)
    db.commit()
    workspace = db.get(Workspace, invitation.workspace_id)
    return success(team_data(workspace, invitation.role), request=request)


@router.patch("/{workspace_id}/members/{member_id}")
def update_member_role(
    workspace_id: str,
    member_id: str,
    payload: MemberRolePatch,
    request: Request,
    access=Depends(team_admin_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    member = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.id == member_id, WorkspaceMember.workspace_id == workspace_id
        )
    )
    if member is None:
        raise HTTPException(404, {"code": "MEMBER_NOT_FOUND", "message": "成员不存在"})
    if member.user_id == access.workspace.owner_id:
        raise HTTPException(409, {"code": "OWNER_ROLE_FIXED", "message": "不能修改团队所有者角色"})
    member.role = payload.role
    add_activity(
        db,
        workspace_id,
        access.user.id,
        "member.role_changed",
        "member",
        member.id,
        {"role": payload.role},
    )
    db.commit()
    return success(
        {"id": member.id, "user_id": member.user_id, "role": member.role}, request=request
    )


@router.delete("/{workspace_id}/members/{member_id}")
def remove_member(
    workspace_id: str,
    member_id: str,
    request: Request,
    access=Depends(team_admin_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    member = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.id == member_id, WorkspaceMember.workspace_id == workspace_id
        )
    )
    if member is None:
        raise HTTPException(404, {"code": "MEMBER_NOT_FOUND", "message": "成员不存在"})
    if member.user_id == access.workspace.owner_id:
        raise HTTPException(409, {"code": "OWNER_CANNOT_REMOVE", "message": "不能移除团队所有者"})
    db.execute(delete(WorkspaceMember).where(WorkspaceMember.id == member.id))
    add_activity(db, workspace_id, access.user.id, "member.removed", "member", member.id)
    db.commit()
    return success({"removed": True}, request=request)


@router.get("/{workspace_id}/activity")
def list_activity(
    workspace_id: str,
    request: Request,
    access=Depends(team_view_access),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    rows = db.scalars(
        select(ActivityLog)
        .where(ActivityLog.workspace_id == workspace_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(100)
    ).all()
    return success(
        [
            {
                "id": row.id,
                "actor_id": row.actor_id,
                "action": row.action,
                "entity_type": row.entity_type,
                "entity_id": row.entity_id,
                "payload": json.loads(row.payload or "{}"),
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ],
        request=request,
    )
