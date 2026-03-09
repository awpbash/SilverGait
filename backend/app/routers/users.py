"""User management endpoints — lightweight, no auth."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..models.db_models import User

router = APIRouter(prefix="/users", tags=["Users"])


class UserCreate(BaseModel):
    id: str
    display_name: str = ""
    language: str = "en"


class UserResponse(BaseModel):
    id: str
    display_name: str
    language: str
    created_at: str


class UserUpdate(BaseModel):
    display_name: str | None = None
    language: str | None = None


@router.post("", response_model=UserResponse)
async def create_or_get_user(body: UserCreate, db: AsyncSession = Depends(get_db)):
    """Create a user if they don't exist, or return existing."""
    result = await db.execute(select(User).where(User.id == body.id))
    user = result.scalar_one_or_none()

    if not user:
        user = User(id=body.id, display_name=body.display_name, language=body.language)
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return UserResponse(
        id=user.id,
        display_name=user.display_name,
        language=user.language,
        created_at=user.created_at.isoformat(),
    )


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, body: UserUpdate, db: AsyncSession = Depends(get_db)):
    """Update user display name or language."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        user = User(id=user_id)
        db.add(user)

    if body.display_name is not None:
        user.display_name = body.display_name
    if body.language is not None:
        user.language = body.language

    await db.commit()
    await db.refresh(user)

    return UserResponse(
        id=user.id,
        display_name=user.display_name,
        language=user.language,
        created_at=user.created_at.isoformat(),
    )
