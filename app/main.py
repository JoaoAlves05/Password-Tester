import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from .core.logging import setup_logging
from .api import pwned, score
from .schemas import PwnedRequest, PwnedResponse
from .hibp import check_pwned_by_prefix

# Setup logging (JSON)
setup_logging()

# Rate limiter (por IP, configurável)
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Password Strength Tester")

# CORS: permitir localhost para demo
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
    results = await check_pwned_by_prefix(prefix)
    return {"prefix": prefix, "results": results}

# Healthcheck
@app.get("/health")
async def health():
    return {"status": "ok"}
