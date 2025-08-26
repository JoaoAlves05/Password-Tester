import httpx
import time
from typing import List, Dict

_CACHE = {}
CACHE_TTL = 24 * 3600
USER_AGENT = "PasswordTesterLocal/1.0"

async def fetch_hibp_range(prefix: str) -> List[Dict[str,int]]:
    url = f"https://api.pwnedpasswords.com/range/{prefix}"
    headers = {"User-Agent": USER_AGENT}
    async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
        r = await client.get(url)
        r.raise_for_status()
        text = r.text
    results = []
    for line in text.splitlines():
        if ":" in line:
            tail, cnt = line.split(":", 1)
            results.append({"suffix": tail.strip().upper(), "count": int(cnt.strip())})
    return results

async def check_pwned_by_prefix(prefix: str) -> List[Dict[str,int]]:
    now = time.time()
    cached = _CACHE.get(prefix)
    if cached:
        ts, data = cached
        if now - ts < CACHE_TTL:
            return data
    data = await fetch_hibp_range(prefix)
    _CACHE[prefix] = (now, data)
    return data
