"""Simple in-memory rate limiter — no external deps. Suitable for single-process POC."""

import asyncio
import time
from collections import defaultdict
from fastapi import HTTPException


class RateLimiter:
    """Token-bucket rate limiter keyed by user_id. Thread-safe via asyncio.Lock."""

    def __init__(self, max_requests: int = 10, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._buckets: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()

    def _clean(self, key: str):
        cutoff = time.time() - self.window_seconds
        self._buckets[key] = [t for t in self._buckets[key] if t > cutoff]

    async def check(self, key: str):
        async with self._lock:
            self._clean(key)
            if len(self._buckets[key]) >= self.max_requests:
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests. Please wait before trying again.",
                    headers={"Retry-After": str(self.window_seconds)},
                )
            self._buckets[key].append(time.time())


# Shared instances
chat_limiter = RateLimiter(max_requests=10, window_seconds=60)
assessment_limiter = RateLimiter(max_requests=5, window_seconds=60)
