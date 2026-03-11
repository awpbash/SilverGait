"""SQLite database setup with SQLAlchemy async."""

import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

# DB file lives in backend/data/ (absolute path so it works regardless of CWD)
DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data")
DB_PATH = os.path.join(DB_DIR, "silvergait.db")
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    """Create tables if they don't exist."""
    os.makedirs(DB_DIR, exist_ok=True)
    async with engine.begin() as conn:
        from ..models.db_models import (  # noqa: F401
            User, Assessment, ExerciseLog, Intervention, AgentRun,
            HealthSnapshot, FrailtyEvaluation, CarePlan, ChatMessage, Alert,
        )
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    """FastAPI dependency for database sessions."""
    async with async_session() as session:
        yield session
