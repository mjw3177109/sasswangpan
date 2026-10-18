import asyncio
import json
import time
from contextlib import suppress
from datetime import datetime
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis as AsyncRedis
from sqlalchemy import select

from app.api.team_deps import ROLE_LEVEL, workspace_access
from app.core.config import settings
from app.core.security import hash_session_token
from app.db.session import SessionLocal
from app.models import Document, DocumentVersion, User, UserSession
from app.models.core import utcnow

router = APIRouter(tags=["collaboration"])


def redis_async() -> AsyncRedis:
    return AsyncRedis.from_url(
        settings.resolved_redis_url,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
    )


def authenticate_websocket(websocket: WebSocket, workspace_id: str, document_id: str):
    token = websocket.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    with SessionLocal() as db:
        session = db.scalar(
            select(UserSession).where(
                UserSession.token_hash == hash_session_token(token),
                UserSession.expires_at > datetime.utcnow(),
            )
        )
        if session is None:
            return None
        user = db.get(User, session.user_id)
        if user is None or not user.is_active:
            return None
        try:
            access = workspace_access(workspace_id, "viewer", user, db)
        except Exception:
            return None
        document = db.scalar(
            select(Document).where(
                Document.id == document_id,
                Document.workspace_id == workspace_id,
                Document.deleted_at.is_(None),
            )
        )
        if document is None:
            return None
        return {
            "user_id": user.id,
            "name": user.name,
            "email": user.email,
            "role": access.role,
            "document": {
                "id": document.id,
                "title": document.title,
                "content": document.content,
                "version": document.version,
                "updated_at": document.updated_at.isoformat(),
            },
        }


def apply_update(
    workspace_id: str,
    document_id: str,
    user_id: str,
    role: str,
    expected_version: int,
    title: str | None,
    content: str | None,
) -> dict[str, Any]:
    if ROLE_LEVEL.get(role, 0) < ROLE_LEVEL["editor"]:
        return {"type": "error", "code": "EDIT_FORBIDDEN", "message": "当前角色没有编辑权限"}
    with SessionLocal() as db:
        document = db.scalar(
            select(Document).where(
                Document.id == document_id,
                Document.workspace_id == workspace_id,
                Document.deleted_at.is_(None),
            )
        )
        if document is None:
            return {"type": "error", "code": "DOCUMENT_NOT_FOUND", "message": "文档不存在"}
        if document.version != expected_version:
            return {
                "type": "conflict",
                "code": "VERSION_CONFLICT",
                "current_version": document.version,
                "document": {
                    "id": document.id,
                    "title": document.title,
                    "content": document.content,
                    "version": document.version,
                    "updated_at": document.updated_at.isoformat(),
                },
            }
        db.add(
            DocumentVersion(
                document_id=document.id,
                version=document.version,
                title=document.title,
                content=document.content,
                created_by=user_id,
            )
        )
        if title is not None:
            document.title = title.strip() or "未命名文档"
        if content is not None:
            document.content = content
        document.version += 1
        document.updated_at = utcnow()
        db.commit()
        db.refresh(document)
        return {
            "type": "document.updated",
            "user_id": user_id,
            "document": {
                "id": document.id,
                "title": document.title,
                "content": document.content,
                "version": document.version,
                "updated_at": document.updated_at.isoformat(),
            },
        }


async def current_presence(
    redis: AsyncRedis, presence_key: str, details_key: str
) -> list[dict[str, Any]]:
    now = time.time()
    await redis.zremrangebyscore(presence_key, 0, now - 45)
    ids = await redis.zrange(presence_key, 0, -1)
    if not ids:
        return []
    raw = await redis.hmget(details_key, ids)
    result: list[dict[str, Any]] = []
    for user_id, value in zip(ids, raw, strict=False):
        if not value:
            continue
        try:
            item = json.loads(value)
        except json.JSONDecodeError:
            continue
        item["user_id"] = user_id
        result.append(item)
    return result


async def relay(pubsub, websocket: WebSocket) -> None:
    async for message in pubsub.listen():
        if message.get("type") != "message":
            continue
        try:
            data = json.loads(message["data"])
            await websocket.send_json(data)
        except (json.JSONDecodeError, RuntimeError):
            return


@router.websocket("/ws/teams/{workspace_id}/documents/{document_id}")
async def document_collaboration(websocket: WebSocket, workspace_id: str, document_id: str) -> None:
    auth = authenticate_websocket(websocket, workspace_id, document_id)
    if auth is None:
        await websocket.close(code=4401, reason="authentication or workspace access required")
        return

    await websocket.accept()
    redis = redis_async()
    channel = f"mofan:collab:{workspace_id}:{document_id}"
    presence_key = f"mofan:presence:{workspace_id}:{document_id}"
    details_key = f"mofan:presence:details:{workspace_id}:{document_id}"
    user_id = str(auth["user_id"])
    presence_data = {
        "name": auth["name"],
        "email": auth["email"],
        "role": auth["role"],
        "cursor": None,
        "selection": None,
    }
    await redis.zadd(presence_key, {user_id: time.time()})
    await redis.hset(details_key, user_id, json.dumps(presence_data, ensure_ascii=False))
    await redis.expire(presence_key, 120)
    await redis.expire(details_key, 120)

    pubsub = redis.pubsub()
    await pubsub.subscribe(channel)
    await websocket.send_json(
        {
            "type": "snapshot",
            "role": auth["role"],
            "document": auth["document"],
            "presence": await current_presence(redis, presence_key, details_key),
        }
    )
    relay_task = asyncio.create_task(relay(pubsub, websocket))
    await redis.publish(
        channel,
        json.dumps(
            {"type": "presence.join", "user_id": user_id, **presence_data}, ensure_ascii=False
        ),
    )

    try:
        while True:
            message = await websocket.receive_json()
            kind = message.get("type")
            if kind == "ping":
                await redis.zadd(presence_key, {user_id: time.time()})
                await websocket.send_json({"type": "pong"})
                continue
            if kind == "presence":
                presence_data["cursor"] = message.get("cursor")
                presence_data["selection"] = message.get("selection")
                await redis.zadd(presence_key, {user_id: time.time()})
                await redis.hset(
                    details_key, user_id, json.dumps(presence_data, ensure_ascii=False)
                )
                await redis.publish(
                    channel,
                    json.dumps(
                        {"type": "presence.update", "user_id": user_id, **presence_data},
                        ensure_ascii=False,
                    ),
                )
                continue
            if kind == "update":
                try:
                    expected_version = int(message.get("expected_version"))
                except (TypeError, ValueError):
                    await websocket.send_json(
                        {"type": "error", "code": "INVALID_VERSION", "message": "缺少有效版本号"}
                    )
                    continue
                result = await asyncio.to_thread(
                    apply_update,
                    workspace_id,
                    document_id,
                    user_id,
                    str(auth["role"]),
                    expected_version,
                    message.get("title"),
                    message.get("content"),
                )
                if result["type"] == "document.updated":
                    await redis.publish(channel, json.dumps(result, ensure_ascii=False))
                else:
                    await websocket.send_json(result)
                continue
            await websocket.send_json(
                {"type": "error", "code": "UNKNOWN_MESSAGE", "message": "未知协作消息"}
            )
    except WebSocketDisconnect:
        pass
    finally:
        relay_task.cancel()
        with suppress(asyncio.CancelledError):
            await relay_task
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()
        await redis.zrem(presence_key, user_id)
        await redis.hdel(details_key, user_id)
        with suppress(Exception):
            await redis.publish(
                channel,
                json.dumps({"type": "presence.leave", "user_id": user_id}, ensure_ascii=False),
            )
        await redis.aclose(close_connection_pool=True)
