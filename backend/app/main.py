"""
SilverGait Backend - Agentic Physiotherapist API.
FastAPI server for AI-powered elderly care.
"""

import os
from pathlib import Path
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import logging
from logging.handlers import RotatingFileHandler

from .core.config import get_settings
from .core.database import init_db, DB_DIR
from .core.auth import get_current_user
from .routers import (
    health_router,
    assessment_router,
    voice_router,
    users_router,
    chat_router,
    exercises_router,
)

# Configure logging — console + rotating file in backend/data/
_log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

# Ensure log directory exists
os.makedirs(DB_DIR, exist_ok=True)

_root_logger = logging.getLogger()
_root_logger.setLevel(logging.INFO)

# Console handler
_console_handler = logging.StreamHandler()
_console_handler.setFormatter(logging.Formatter(_log_format))
_root_logger.addHandler(_console_handler)

# File handler (rotating: 5 MB per file, keep 3 backups)
_file_handler = RotatingFileHandler(
    os.path.join(DB_DIR, "silvergait.log"),
    maxBytes=5 * 1024 * 1024,
    backupCount=3,
    encoding="utf-8",
)
_file_handler.setFormatter(logging.Formatter(_log_format))
_root_logger.addHandler(_file_handler)

logger = logging.getLogger(__name__)

# Initialize app
app = FastAPI(
    title="SilverGait API",
    description="Physiotherapist-in-your-pocket for Singaporean elderly",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# CORS middleware
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers — public (no auth)
app.include_router(health_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(voice_router, prefix="/api")  # public: needed during onboarding TTS/STT

# Include routers — protected (require valid session token)
_auth = [Depends(get_current_user)]
app.include_router(assessment_router, prefix="/api", dependencies=_auth)
app.include_router(chat_router, prefix="/api", dependencies=_auth)
app.include_router(exercises_router, prefix="/api", dependencies=_auth)


@app.on_event("startup")
async def startup():
    """Initialize database on startup."""
    await init_db()
    logger.info("Database initialized")
    if not settings.gemini_api_key:
        logger.critical("GEMINI_API_KEY not set — chat and assessment features will fail!")


@app.get("/api/health")
async def api_health():
    """API health check."""
    return {"status": "healthy"}


# ── Serve frontend in production ────────────────────────────────────
# If frontend/dist exists (i.e. built for production), serve it.
# In local dev, dist/ doesn't exist — Vite proxy handles /api instead.
_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if _FRONTEND_DIST.is_dir():
    # Cache hashed assets forever (Vite includes content hash in filenames)
    @app.middleware("http")
    async def cache_assets(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/assets/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response

    # Serve static assets (JS, CSS, images) at /assets
    app.mount("/assets", StaticFiles(directory=_FRONTEND_DIST / "assets"), name="assets")

    # SPA fallback: any non-/api route returns index.html
    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        # Try to serve an exact static file first (favicon.ico, etc.)
        file_path = (_FRONTEND_DIST / full_path).resolve()
        if full_path and file_path.is_file() and str(file_path).startswith(str(_FRONTEND_DIST)):
            return FileResponse(file_path)
        # Never cache index.html — ensures browser fetches new asset hashes after redeploy
        return FileResponse(
            _FRONTEND_DIST / "index.html",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )

    logger.info(f"Serving frontend from {_FRONTEND_DIST}")
else:
    # Local dev — just a simple health check at /
    @app.get("/")
    async def root():
        return {"app": "SilverGait", "status": "running", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.backend_host,
        port=settings.backend_port,
        reload=True,
    )
