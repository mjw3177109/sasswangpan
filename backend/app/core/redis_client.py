from redis import Redis

from app.core.config import settings


def get_redis() -> Redis:
    return Redis.from_url(
        settings.resolved_redis_url,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
    )


def check_redis() -> bool:
    return bool(get_redis().ping())
