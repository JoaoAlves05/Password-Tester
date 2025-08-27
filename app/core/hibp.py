import httpx
import asyncio
from typing import List, Dict, Tuple
from .cache import get_redis
import json
import logging

HIBP_URL = "https://api.pwnedpasswords.com/range/{prefix}"
USER_AGENT = "PasswordStrengthTester/1.0"
CACHE_PREFIX = "hibp:"
CACHE_TTL = 86400  # 24h

logger = logging.getLogger("hibp")

async def fetch_hibp_range(prefix: str, retries: int = 3, backoff: float = 1.0) -> List[Dict[str, int]]:
    """
    Request HIBP for a SHA-1 prefix (5 hex chars).
    Implements retry/backoff on 429.
    """
    url = HIBP_URL.format(prefix=prefix)
    headers = {"User-Agent": USER_AGENT}
    for attempt in range(retries):
        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return parse_hibp_response(resp.text)
            elif resp.status_code == 429:
                logger.warning("HIBP rate limited, backing off %.1fs", backoff)
                await asyncio.sleep(backoff)
                backoff *= 2
            else:
                logger.error("HIBP error: %s", resp.status_code)
                resp.raise_for_status()
    raise httpx.HTTPStatusError("HIBP rate limit exceeded", request=None, response=resp)

def parse_hibp_response(text: str) -> List[Dict[str, int]]:
    """
    Parse HIBP response (suffix:count per line).
    """
    results = []
    for line in text.splitlines():
        if ":" in line:
            tail, cnt = line.split(":", 1)
            results.append({"suffix": tail.strip().upper(), "count": int(cnt.strip())})
    return results

async def get_pwned_from_cache(prefix: str) -> Tuple[List[Dict[str, int]], bool]:
    """
    Try to get from Redis, otherwise fetch and cache.
    If HIBP fails, return expired cache if available.
    """
    redis = await get_redis()
    cache_key = f"{CACHE_PREFIX}{prefix}"
    cached = await redis.get(cache_key)
    if cached:
        try:
            data = json.loads(cached)
            return data, True
        except Exception:
            logger.warning("Error reading HIBP cache")
    # Miss: fetch and cache
    try:
        data = await fetch_hibp_range(prefix)
        await redis.set(cache_key, json.dumps(data), ex=CACHE_TTL)
        return data, False
    except Exception as e:
        logger.error(f"HIBP fetch failed: {e}")
        # Try to return expired cache if available
        if cached:
            try:
                data = json.loads(cached)
                return data, True
            except Exception:
                pass
        raise
