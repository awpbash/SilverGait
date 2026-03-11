"""
SilverGait Backend - Agentic Physiotherapist API.
FastAPI server for AI-powered elderly care.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from logging.handlers import RotatingFileHandler

from .core.config import get_settings
from .core.database import init_db, DB_DIR
from .routers import (
    health_router,
    assessment_router,
    intervention_router,
    voice_router,
    users_router,
    history_router,
    chat_router,
    exercises_router,
    agent_router,
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

# Include routers
app.include_router(health_router, prefix="/api")
app.include_router(assessment_router, prefix="/api")
app.include_router(intervention_router, prefix="/api")
app.include_router(voice_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(exercises_router, prefix="/api")
app.include_router(agent_router, prefix="/api")


@app.on_event("startup")
async def startup():
    """Initialize database on startup."""
    await init_db()
    logger.info("Database initialized")
    if not settings.gemini_api_key:
        logger.critical("GEMINI_API_KEY not set — chat and assessment features will fail!")


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "app": "SilverGait",
        "status": "running",
        "version": "1.0.0",
    }


@app.get("/api/health")
async def api_health():
    """API health check."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.backend_host,
        port=settings.backend_port,
        reload=True,
    )
