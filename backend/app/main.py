"""
SilverGait Backend - Agentic Physiotherapist API.
FastAPI server for AI-powered elderly care.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from .core.config import get_settings
from .routers import health_router, assessment_router, intervention_router, voice_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
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
