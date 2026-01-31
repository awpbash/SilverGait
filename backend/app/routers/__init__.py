# Routers module
from .health import router as health_router
from .assessment import router as assessment_router
from .intervention import router as intervention_router

__all__ = ["health_router", "assessment_router", "intervention_router"]
