"""Database setup with SQLAlchemy async — PostgreSQL (Railway) or SQLite (local)."""

import os
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

# Use DATABASE_URL env var (Railway PostgreSQL) or fall back to local SQLite
_DATABASE_URL = os.environ.get("DATABASE_URL", "")

if _DATABASE_URL:
    # Railway provides DATABASE_URL as postgres:// but SQLAlchemy needs postgresql+asyncpg://
    if _DATABASE_URL.startswith("postgres://"):
        _DATABASE_URL = _DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
    elif _DATABASE_URL.startswith("postgresql://"):
        _DATABASE_URL = _DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
    DATABASE_URL = _DATABASE_URL
    DB_DIR = Path(__file__).resolve().parent.parent.parent / "data"
else:
    # Local dev: SQLite in backend/data/
    DB_DIR = Path(__file__).resolve().parent.parent.parent / "data"
    DB_PATH = DB_DIR / "silvergait.db"
    DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH.as_posix()}"

_engine_kwargs = {"echo": False}
if _DATABASE_URL:
    # PostgreSQL: connection pooling with health checks
    _engine_kwargs.update(pool_pre_ping=True, pool_recycle=300, pool_size=5, max_overflow=10)
engine = create_async_engine(DATABASE_URL, **_engine_kwargs)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    """Create tables if they don't exist."""
    os.makedirs(DB_DIR, exist_ok=True)
    async with engine.begin() as conn:
        from ..models.db_models import (  # noqa: F401
            Session, User, Assessment, ExerciseLog, Intervention, AgentRun,
            HealthSnapshot, FrailtyEvaluation, CarePlan, ChatMessage, Alert,
        )
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    """FastAPI dependency for database sessions."""
    async with async_session() as session:
        yield session
