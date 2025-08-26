import httpx
import asyncio
from typing import List, Dict, Tuple
from .cache import get_redis
import json
import logging

HIBP_URL = "https://api.pwnedpasswords.com/range/{prefix}"
USER_AGENT = "PasswordTesterLocal/1.0"
CACHE_PREFIX = "hibp:"
CACHE_TTL = 86400  # 24h

logger = logging.getLogger("hibp")

async def fetch_hibp_range(prefix: str, retries: int = 3, backoff: float = 1.0) -> List[Dict[str, int]]:
    """
    Faz request ao HIBP para um prefixo SHA-1 (5 hex chars).
    Implementa retry/backoff em caso de 429.
    """
    url = HIBP_URL.format(prefix=prefix)
    headers = {"User-Agent": USER_AGENT}
    for attempt in range(retries):
        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return parse_hibp_response(resp.text)
            elif resp.status_code == 429:
                logger.warning("HIBP rate limited, backoff %.1fs", backoff)
                await asyncio.sleep(backoff)
                backoff *= 2
            else:
                logger.error("HIBP error: %s", resp.status_code)
                resp.raise_for_status()
    raise httpx.HTTPStatusError("HIBP rate limit exceeded", request=None, response=resp)

def parse_hibp_response(text: str) -> List[Dict[str, int]]:
    """
    Parse resposta HIBP (suffix:count por linha).
    """
    results = []
    for line in text.splitlines():
        if ":" in line:
            tail, cnt = line.split(":", 1)
            results.append({"suffix": tail.strip().upper(), "count": int(cnt.strip())})
    return results

async def get_pwned_from_cache(prefix: str) -> Tuple[List[Dict[str, int]], bool]:
    """
    Tenta obter do Redis, senão faz fetch e cacheia.
    """
    redis = await get_redis()
    cache_key = f"{CACHE_PREFIX}{prefix}"
    cached = await redis.get(cache_key)
    if cached:
        # Limitar tamanho resposta para segurança
        try:
            data = json.loads(cached)
            return data, True
        except Exception:
            logger.warning("Erro ao ler cache HIBP")
    # Miss: fetch e cachear
    data = await fetch_hibp_range(prefix)
    await redis.set(cache_key, json.dumps(data), ex=CACHE_TTL)
    return data, False
