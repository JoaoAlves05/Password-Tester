import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from .core.logging import setup_logging
from .api import pwned, score
from .schemas import PwnedRequest, PwnedResponse
from .core.hibp import get_pwned_from_cache
from fastapi.staticfiles import StaticFiles

# Setup JSON logging
setup_logging()

# Rate limiter (per IP, configurable)
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Password Strength Tester")

# Serve the web/ folder as static files at /web
app.mount("/web", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "../web")), name="web")

# CORS: allow localhost for demo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:8000", "http://127.0.0.1:8000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limit handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Routers
app.include_router(pwned.router, prefix="/api/v1")
app.include_router(score.router, prefix="/api/v1")

@app.post("/api/v1/pwned-range", response_model=PwnedResponse)
async def pwned_range(req: PwnedRequest):
    prefix = req.prefix.upper()
    if len(prefix) != 5 or not all(c in "0123456789ABCDEF" for c in prefix):
        raise HTTPException(status_code=400, detail="prefix must be 5 hex characters")
    results, cache_hit = await get_pwned_from_cache(prefix)
    return {"prefix": prefix, "results": results, "cache_hit": cache_hit}

# Healthcheck
@app.get("/health")
async def health():
    return {"status": "ok"}
