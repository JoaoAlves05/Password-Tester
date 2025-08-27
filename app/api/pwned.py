from fastapi import APIRouter, HTTPException, Request
from ..schemas import PwnedRequest, PwnedResponse, PwnedCheckRequest, PwnedCheckResponse
from ..core.hibp import get_pwned_from_cache
from slowapi.util import get_remote_address
from slowapi import Limiter
import hmac

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

@router.post("/pwned-range", response_model=PwnedResponse)
@limiter.limit("30/minute")
async def pwned_range(req: PwnedRequest, request: Request):
    prefix = req.prefix.upper()
    if len(prefix) != 5 or not all(c in "0123456789ABCDEF" for c in prefix):
        raise HTTPException(status_code=400, detail="prefix must be 5 hex characters")
    results, cache_hit = await get_pwned_from_cache(prefix)
    return {"prefix": prefix, "results": results, "cache_hit": cache_hit}

@router.post("/check", response_model=PwnedCheckResponse)
@limiter.limit("30/minute")
async def pwned_check(req: PwnedCheckRequest, request: Request):
    prefix = req.prefix.upper()
    if len(prefix) != 5 or not all(c in "0123456789ABCDEF" for c in prefix):
        raise HTTPException(status_code=400, detail="prefix must be 5 hex characters")

    results, _ = await get_pwned_from_cache(prefix)

    if req.suffix:
        suffix = req.suffix.upper()
        found = next((r for r in results if hmac.compare_digest(r["suffix"], suffix)), None)
        return {"pwned": bool(found), "count": found["count"] if found else 0}
    
    # If no suffix, return all results
    return {"prefix": prefix, "results": results}
