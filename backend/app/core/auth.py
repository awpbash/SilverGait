"""Lightweight session-based auth for user isolation (no passwords)."""

import secrets
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .database import get_db
from ..models.db_models import Session


async def create_session(db: AsyncSession, user_id: str) -> str:
    """Generate a session token for a user, insert into DB, return token."""
    settings = get_settings()
    token = secrets.token_urlsafe(32)
    session = Session(
        token=token,
        user_id=user_id,
        expires_at=datetime.utcnow() + timedelta(days=settings.session_expiry_days),
    )
    db.add(session)
    await db.flush()
    return token


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> str:
    """Validate Bearer token, check expiry, return user_id. Raises 401/403."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header[7:]
    result = await db.execute(select(Session).where(Session.token == token))
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=401, detail="Invalid session token")
    if session.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Session expired")

    # Enforce user isolation: if a {user_id} path param exists, it must match
    user_id_param = request.path_params.get("user_id")
    if user_id_param and user_id_param != session.user_id:
        raise HTTPException(status_code=403, detail="Access denied: user mismatch")

    return session.user_id


# FastAPI dependency alias
require_auth = Depends(get_current_user)
