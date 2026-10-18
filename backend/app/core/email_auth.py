from __future__ import annotations

import hashlib
import hmac
import secrets
import smtplib
from email.message import EmailMessage

from fastapi import HTTPException

from app.core.config import settings
from app.core.redis_client import get_redis

_PURPOSE_LABELS = {
    "register": "注册墨帆",
    "login": "登录墨帆",
    "reset": "重置墨帆密码",
}


def _key(email: str, purpose: str) -> str:
    return f"auth:email-code:{purpose}:{email}"


def _digest(email: str, purpose: str, code: str) -> str:
    message = f"{purpose}:{email}:{code}".encode()
    return hmac.new(settings.session_secret.encode(), message, hashlib.sha256).hexdigest()


def generate_email_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def store_email_code(email: str, purpose: str, code: str) -> None:
    try:
        redis = get_redis()
        redis.set(
            _key(email, purpose),
            _digest(email, purpose, code),
            ex=settings.email_code_ttl_seconds,
        )
    except Exception as exc:
        raise HTTPException(
            503,
            {"code": "EMAIL_CODE_UNAVAILABLE", "message": "验证码服务暂时不可用，请稍后再试"},
        ) from exc


def verify_email_code(email: str, purpose: str, code: str, *, consume: bool = False) -> bool:
    try:
        redis = get_redis()
        stored = redis.get(_key(email, purpose))
        if not stored:
            return False
        valid = hmac.compare_digest(str(stored), _digest(email, purpose, code.strip()))
        if valid and consume:
            redis.delete(_key(email, purpose))
        return valid
    except Exception as exc:
        raise HTTPException(
            503,
            {"code": "EMAIL_CODE_UNAVAILABLE", "message": "验证码服务暂时不可用，请稍后再试"},
        ) from exc


def consume_email_code(email: str, purpose: str) -> None:
    try:
        get_redis().delete(_key(email, purpose))
    except Exception:
        pass


def send_email_code(email: str, purpose: str, code: str) -> None:
    if settings.app_env.lower() != "production" and email.endswith("@example.com"):
        return
    if not settings.email_host:
        raise HTTPException(
            503,
            {"code": "EMAIL_NOT_CONFIGURED", "message": "邮件服务尚未配置"},
        )

    message = EmailMessage()
    message["Subject"] = f"{_PURPOSE_LABELS.get(purpose, '墨帆')}验证码"
    message["From"] = (
        settings.default_from_email or settings.email_host_user or "noreply@mofan.local"
    )
    message["To"] = email
    message.set_content(
        f"你的墨帆验证码是：{code}\n\n"
        f"验证码 {settings.email_code_ttl_seconds // 60} 分钟内有效，请勿转发给他人。\n"
        "如果不是你本人操作，请忽略这封邮件。"
    )

    try:
        if settings.email_use_ssl:
            client = smtplib.SMTP_SSL(
                settings.email_host,
                settings.email_port,
                timeout=10,
            )
        else:
            client = smtplib.SMTP(
                settings.email_host,
                settings.email_port,
                timeout=10,
            )
            client.ehlo()
            if client.has_extn("starttls"):
                client.starttls()
                client.ehlo()
        with client:
            if settings.email_host_user:
                client.login(
                    settings.email_host_user,
                    settings.email_host_password or "",
                )
            client.send_message(message)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            503,
            {"code": "EMAIL_SEND_FAILED", "message": "验证码邮件发送失败，请稍后再试"},
        ) from exc
