# Routers module
from .health import router as health_router
from .assessment import router as assessment_router
from .intervention import router as intervention_router
from .voice import router as voice_router
from .users import router as users_router
from .history import router as history_router
from .chat import router as chat_router
from .exercises import router as exercises_router
from .agent import router as agent_router

__all__ = [
    "health_router",
    "assessment_router",
    "intervention_router",
    "voice_router",
    "users_router",
    "history_router",
    "chat_router",
    "exercises_router",
    "agent_router",
]
