import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

# Ensure app/ is in sys.path for local imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from .core.logging import setup_logging
from .api import pwned, score

# --- Security Headers Middleware ---
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' https://cdnjs.cloudflare.com; "
            "style-src 'self' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
        )
        return response

# Setup JSON logging
setup_logging()

# Rate limiter (per IP, configurable)
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Password Strength Tester")

# Serve the web/ folder as static files at /web
app.mount("/web", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "../web")), name="web")

# Security headers
app.add_middleware(SecurityHeadersMiddleware)

# CORS: allow origins from env or default to localhost for demo
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost,http://127.0.0.1:8000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limit handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Routers
app.include_router(pwned.router, prefix="/api/v1")
app.include_router(score.router, prefix="/api/v1")

# Root endpoint for /
@app.get("/")
async def root():
    return {"message": "Password Strength Tester API. See /docs for API documentation."}

# Healthcheck
@app.get("/health")
async def health():
    return {"status": "ok"}
