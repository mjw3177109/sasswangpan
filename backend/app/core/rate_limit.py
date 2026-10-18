import logging

from app.core.redis_client import get_redis

logger = logging.getLogger("mofan.rate_limit")


def is_rate_limited(key: str, *, limit: int, window_seconds: int) -> bool:
    try:
        redis = get_redis()
        count = redis.incr(key)
        if count == 1:
            redis.expire(key, window_seconds)
        return int(count) > limit
    except Exception:
        logger.exception("rate_limit_redis_unavailable key=%s", key)
        return False
