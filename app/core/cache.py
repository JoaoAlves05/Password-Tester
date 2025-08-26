import redis.asyncio as redis
import os

_redis = None

async def get_redis():
    global _redis
    if _redis is None:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        _redis = await redis.from_url(redis_url, encoding="utf-8", decode_responses=True)
    return _redis
