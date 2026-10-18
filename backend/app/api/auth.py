from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.email_auth import (
    consume_email_code,
    generate_email_code,
    send_email_code,
    store_email_code,
    verify_email_code,
)
from app.core.rate_limit import is_rate_limited
from app.core.responses import success
from app.core.security import (
    hash_password,
    hash_session_token,
    new_session_token,
    session_expiry,
    verify_password,
)
from app.db.session import get_db
from app.models import Document, User, UserSession, Workspace
from app.schemas.auth import (
    EmailCodeLoginInput,
    LoginInput,
    RegisterInput,
    ResetPasswordInput,
    SendEmailCodeInput,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def normalize_email(value: str) -> str:
    return value.strip().lower()


def auth_data(user: User, workspace: Workspace) -> dict[str, object]:
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "plan": user.plan,
            "storage_quota_bytes": user.storage_quota_bytes,
            "is_site_admin": user.email.strip().lower() in settings.site_admin_email_set,
        },
        "workspace": {
            "id": workspace.id,
            "name": workspace.name,
            "kind": workspace.kind,
            "unfiled_name": workspace.unfiled_name,
        },
    }


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def personal_workspace(db: Session, user_id: str) -> Workspace | None:
    return db.scalar(
        select(Workspace).where(
            Workspace.owner_id == user_id,
            Workspace.kind == "personal",
        )
    )


def create_session(db: Session, user: User, response: Response) -> None:
    token = new_session_token()
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_session_token(token),
            expires_at=session_expiry(settings.session_days),
        )
    )
    db.commit()
    set_session_cookie(response, token)


@router.post("/email-code")
def request_email_code(
    payload: SendEmailCodeInput,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    email = normalize_email(str(payload.email))
    purpose = payload.purpose
    client_host = request.client.host if request.client else "unknown"
    rate_key = f"rate:email-code:{client_host}:{purpose}:{email}"
    if is_rate_limited(rate_key, limit=3, window_seconds=300):
        raise HTTPException(
            429,
            {"code": "RATE_LIMITED", "message": "验证码发送过于频繁，请稍后再试"},
        )

    user_exists = bool(db.scalar(select(User.id).where(User.email == email)))
    if purpose == "register" and user_exists:
        raise HTTPException(409, {"code": "EMAIL_EXISTS", "message": "该邮箱已注册"})

    # Login/reset use a generic success response for unknown addresses to avoid account enumeration.
    if purpose in {"login", "reset"} and not user_exists:
        return success(
            {"sent": True, "expires_in": settings.email_code_ttl_seconds},
            request=request,
        )

    code = generate_email_code()
    store_email_code(email, purpose, code)
    try:
        send_email_code(email, purpose, code)
    except Exception:
        consume_email_code(email, purpose)
        raise

    data: dict[str, object] = {
        "sent": True,
        "expires_in": settings.email_code_ttl_seconds,
    }
    if settings.app_env.lower() != "production":
        data["debug_code"] = code
    return success(data, request=request)


@router.post("/register", status_code=201)
def register(
    payload: RegisterInput,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    email = normalize_email(str(payload.email))
    client_host = request.client.host if request.client else "unknown"
    rate_key = f"rate:register:{client_host}:{email}"
    if is_rate_limited(rate_key, limit=5, window_seconds=60):
        raise HTTPException(
            429,
            {"code": "RATE_LIMITED", "message": "操作过于频繁，请稍后再试"},
        )
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, {"code": "EMAIL_EXISTS", "message": "该邮箱已注册"})
    if not verify_email_code(email, "register", payload.code):
        raise HTTPException(
            400, {"code": "INVALID_EMAIL_CODE", "message": "邮箱验证码错误或已过期"}
        )

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        name=payload.name.strip(),
        plan="free",
        storage_quota_bytes=settings.default_user_storage_quota_bytes,
    )
    db.add(user)
    db.flush()
    workspace = Workspace(
        owner_id=user.id,
        name=f"{user.name}的空间",
        kind="personal",
        unfiled_name="未归档",
    )
    db.add(workspace)
    db.flush()
    db.add(
        Document(
            workspace_id=workspace.id,
            author_id=user.id,
            title="欢迎使用墨帆",
            content=(
                "# 欢迎使用墨帆\n\n这是你的第一篇云端 Markdown 文档。\n\n开始写下你的想法吧。"
            ),
        )
    )
    token = new_session_token()
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_session_token(token),
            expires_at=session_expiry(settings.session_days),
        )
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            409,
            {"code": "EMAIL_EXISTS", "message": "该邮箱已注册"},
        ) from exc
    consume_email_code(email, "register")
    db.refresh(user)
    db.refresh(workspace)
    set_session_cookie(response, token)
    return success(auth_data(user, workspace), request=request)


@router.post("/login")
def login(
    payload: LoginInput,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    email = normalize_email(str(payload.email))
    client_host = request.client.host if request.client else "unknown"
    rate_key = f"rate:login:{client_host}:{email}"
    if is_rate_limited(rate_key, limit=10, window_seconds=60):
        raise HTTPException(
            429,
            {"code": "RATE_LIMITED", "message": "登录尝试过多，请稍后再试"},
        )
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            401,
            {"code": "INVALID_CREDENTIALS", "message": "邮箱或密码错误"},
        )
    if not user.is_active:
        raise HTTPException(403, {"code": "USER_DISABLED", "message": "账号不可用"})
    workspace = personal_workspace(db, user.id)
    if workspace is None:
        raise HTTPException(500, {"code": "WORKSPACE_MISSING", "message": "个人空间不存在"})
    create_session(db, user, response)
    return success(auth_data(user, workspace), request=request)


@router.post("/login/code")
def login_with_email_code(
    payload: EmailCodeLoginInput,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    email = normalize_email(str(payload.email))
    if not verify_email_code(email, "login", payload.code):
        raise HTTPException(
            401, {"code": "INVALID_EMAIL_CODE", "message": "邮箱验证码错误或已过期"}
        )
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        raise HTTPException(
            401, {"code": "INVALID_EMAIL_CODE", "message": "邮箱验证码错误或已过期"}
        )
    if not user.is_active:
        raise HTTPException(403, {"code": "USER_DISABLED", "message": "账号不可用"})
    workspace = personal_workspace(db, user.id)
    if workspace is None:
        raise HTTPException(500, {"code": "WORKSPACE_MISSING", "message": "个人空间不存在"})
    create_session(db, user, response)
    consume_email_code(email, "login")
    return success(auth_data(user, workspace), request=request)


@router.post("/password/reset")
def reset_password(
    payload: ResetPasswordInput,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    email = normalize_email(str(payload.email))
    if not verify_email_code(email, "reset", payload.code):
        raise HTTPException(
            400, {"code": "INVALID_EMAIL_CODE", "message": "邮箱验证码错误或已过期"}
        )
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        raise HTTPException(
            400, {"code": "INVALID_EMAIL_CODE", "message": "邮箱验证码错误或已过期"}
        )
    user.password_hash = hash_password(payload.new_password)
    db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    db.commit()
    consume_email_code(email, "reset")
    return success({"reset": True}, request=request)


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        db.execute(delete(UserSession).where(UserSession.token_hash == hash_session_token(token)))
        db.commit()
    response.delete_cookie(settings.session_cookie_name, path="/")
    return success({"logged_out": True}, request=request)


@router.get("/me")
def me(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    workspace = personal_workspace(db, user.id)
    if workspace is None:
        raise HTTPException(500, {"code": "WORKSPACE_MISSING", "message": "个人空间不存在"})
    return success(auth_data(user, workspace), request=request)
