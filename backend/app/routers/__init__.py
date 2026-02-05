# Routers module
from .health import router as health_router
from .assessment import router as assessment_router
from .intervention import router as intervention_router
from .voice import router as voice_router

__all__ = ["health_router", "assessment_router", "intervention_router", "voice_router"]
