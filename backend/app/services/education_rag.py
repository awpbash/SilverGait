"""
Education RAG Service — retrieves relevant education chunks using pgvector.

Architecture:
  initialize_rag(api_key) → load docs, chunk, embed via Gemini, store in PostgreSQL (pgvector)
  retrieve(api_key, query, topic=None, top_k=3) → list of text chunks

Fallback chain: RAG+LLM → LLM-only → static content_library
If pgvector unavailable, retrieve() returns [] gracefully.
Falls back to in-memory search if PostgreSQL/pgvector not available (local SQLite dev).
"""

import re
import hashlib
import logging
import asyncio
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Docs directory (committed to repo, NOT in data/ which is volume-mounted)
_DOCS_DIR = Path(__file__).resolve().parent.parent.parent / "education_docs"

# Module-level state
_chunks_cache: list[dict] = []  # fallback in-memory store for SQLite dev
_embeddings_cache: list[list[float]] = []
_initialized = False
_use_pgvector = False


def _compute_docs_hash() -> str:
    """Compute a SHA256 hash of all markdown files in the docs directory."""
    hasher = hashlib.sha256()
    if not _DOCS_DIR.exists():
        return ""
    for f in sorted(_DOCS_DIR.glob("*.md")):
        hasher.update(f.read_bytes())
    return hasher.hexdigest()


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    """Extract YAML frontmatter and body from markdown text."""
    if not text.startswith("---"):
        return {}, text
    end = text.find("---", 3)
    if end == -1:
        return {}, text
    fm_text = text[3:end].strip()
    body = text[end + 3:].strip()

    metadata = {}
    for line in fm_text.split("\n"):
        if ":" in line:
            key, val = line.split(":", 1)
            key = key.strip()
            val = val.strip()
            if val.startswith("[") and val.endswith("]"):
                val = [v.strip().strip("'\"") for v in val[1:-1].split(",")]
            metadata[key] = val
    return metadata, body


def _chunk_document(filepath: Path) -> list[dict]:
    """Split a markdown document into chunks at ## headings."""
    text = filepath.read_text(encoding="utf-8")
    metadata, body = _parse_frontmatter(text)
    topic = metadata.get("topic", filepath.stem)
    tags = metadata.get("tags", [])
    if isinstance(tags, str):
        tags = [tags]

    sections = re.split(r'\n(?=## )', body)
    chunks = []

    for section in sections:
        section = section.strip()
        if not section or len(section) < 50:
            continue

        heading = ""
        if section.startswith("## "):
            first_line_end = section.find("\n")
            if first_line_end > 0:
                heading = section[3:first_line_end].strip()
        elif section.startswith("# "):
            first_line_end = section.find("\n")
            if first_line_end > 0:
                heading = section[2:first_line_end].strip()

        chunks.append({
            "text": section,
            "topic": topic,
            "tags": ",".join(tags) if isinstance(tags, list) else tags,
            "heading": heading,
            "source": filepath.name,
        })

    return chunks


def _embed_texts(api_key: str, texts: list[str]) -> list[list[float]]:
    """Embed texts via Gemini embedding API."""
    from google import genai
    client = genai.Client(api_key=api_key)
    embeddings = []
    BATCH_SIZE = 50
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        result = client.models.embed_content(
            model="gemini-embedding-001",
            contents=batch,
        )
        embeddings.extend([e.values for e in result.embeddings])
    return embeddings


async def _init_pgvector(api_key: str, all_chunks: list[dict]) -> bool:
    """Store chunks + embeddings in PostgreSQL with pgvector."""
    global _use_pgvector

    import os
    if not os.environ.get("DATABASE_URL"):
        return False

    try:
        from sqlalchemy import text as sa_text
        from ..core.database import engine, async_session

        # Enable pgvector extension
        async with engine.begin() as conn:
            await conn.execute(sa_text("CREATE EXTENSION IF NOT EXISTS vector"))

        # Create education_chunks table
        async with engine.begin() as conn:
            await conn.execute(sa_text("""
                CREATE TABLE IF NOT EXISTS education_chunks (
                    id SERIAL PRIMARY KEY,
                    content TEXT NOT NULL,
                    topic VARCHAR(100),
                    heading VARCHAR(200),
                    source VARCHAR(100),
                    tags VARCHAR(500),
                    content_hash VARCHAR(64),
                    embedding vector(768)
                )
            """))
            # Create index for vector similarity search
            await conn.execute(sa_text("""
                CREATE INDEX IF NOT EXISTS idx_education_chunks_embedding
                ON education_chunks USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 10)
            """))

        # Check if we need to rebuild (content hash check)
        current_hash = _compute_docs_hash()
        async with async_session() as session:
            result = await session.execute(
                sa_text("SELECT content_hash FROM education_chunks LIMIT 1")
            )
            row = result.first()
            if row and row[0] == current_hash:
                count_result = await session.execute(
                    sa_text("SELECT COUNT(*) FROM education_chunks")
                )
                count = count_result.scalar()
                if count and count > 0:
                    _use_pgvector = True
                    logger.info(f"[education_rag] Reusing existing pgvector index ({count} chunks, hash unchanged)")
                    return True

        # Rebuild: embed all chunks
        logger.info("[education_rag] Embedding chunks for pgvector...")
        texts = [c["text"] for c in all_chunks]
        embeddings = await asyncio.to_thread(_embed_texts, api_key, texts)
        logger.info(f"[education_rag] Embedded {len(embeddings)} chunks")

        # Clear and re-insert
        async with engine.begin() as conn:
            await conn.execute(sa_text("DELETE FROM education_chunks"))
            for i, chunk in enumerate(all_chunks):
                emb_str = "[" + ",".join(str(v) for v in embeddings[i]) + "]"
                await conn.execute(
                    sa_text("""
                        INSERT INTO education_chunks (content, topic, heading, source, tags, content_hash, embedding)
                        VALUES (:content, :topic, :heading, :source, :tags, :hash, :embedding::vector)
                    """),
                    {
                        "content": chunk["text"],
                        "topic": chunk["topic"],
                        "heading": chunk["heading"],
                        "source": chunk["source"],
                        "tags": chunk["tags"],
                        "hash": current_hash,
                        "embedding": emb_str,
                    },
                )

        _use_pgvector = True
        logger.info(f"[education_rag] pgvector index built: {len(all_chunks)} chunks")
        return True

    except Exception as e:
        logger.warning(f"[education_rag] pgvector init failed, will use in-memory fallback: {e}")
        return False


async def _retrieve_pgvector(api_key: str, query: str, topic: Optional[str], top_k: int) -> list[str]:
    """Retrieve chunks from PostgreSQL using pgvector cosine similarity."""
    try:
        from google import genai
        from sqlalchemy import text as sa_text
        from ..core.database import async_session

        # Embed query
        client = genai.Client(api_key=api_key)
        result = await asyncio.to_thread(
            client.models.embed_content,
            model="gemini-embedding-001",
            contents=[query],
        )
        query_emb = result.embeddings[0].values
        emb_str = "[" + ",".join(str(v) for v in query_emb) + "]"

        # Query with optional topic filter
        for use_topic in ([True, False] if topic else [False]):
            if use_topic:
                sql = sa_text("""
                    SELECT content FROM education_chunks
                    WHERE topic = :topic
                    ORDER BY embedding <=> :embedding::vector
                    LIMIT :top_k
                """)
                params = {"topic": topic, "embedding": emb_str, "top_k": top_k}
            else:
                sql = sa_text("""
                    SELECT content FROM education_chunks
                    ORDER BY embedding <=> :embedding::vector
                    LIMIT :top_k
                """)
                params = {"embedding": emb_str, "top_k": top_k}

            async with async_session() as session:
                result = await session.execute(sql, params)
                rows = result.all()
                if rows:
                    chunks = [r[0] for r in rows]
                    logger.info(f"[education_rag] pgvector retrieved {len(chunks)} chunks for query={query!r} topic={topic}")
                    return chunks

        return []

    except Exception as e:
        logger.error(f"[education_rag] pgvector retrieve failed: {e}")
        return []


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


def initialize_rag(api_key: str) -> bool:
    """
    Load markdown docs, chunk, embed via Gemini, store in pgvector or in-memory.
    Returns True if successful, False otherwise.
    """
    global _chunks_cache, _embeddings_cache, _initialized

    if not _DOCS_DIR.exists() or not any(_DOCS_DIR.glob("*.md")):
        logger.warning(f"[education_rag] No docs found in {_DOCS_DIR}")
        return False

    try:
        # 1. Load and chunk all docs
        all_chunks = []
        for md_file in sorted(_DOCS_DIR.glob("*.md")):
            chunks = _chunk_document(md_file)
            all_chunks.extend(chunks)
            logger.info(f"[education_rag] {md_file.name}: {len(chunks)} chunks")

        if not all_chunks:
            logger.warning("[education_rag] No chunks extracted from docs")
            return False

        # 2. Try pgvector (async — run in event loop if available)
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # We're in an async context (FastAPI startup) — schedule as task
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    pgvector_ok = pool.submit(
                        asyncio.run, _init_pgvector(api_key, all_chunks)
                    ).result(timeout=120)
            else:
                pgvector_ok = asyncio.run(_init_pgvector(api_key, all_chunks))
        except Exception as e:
            logger.warning(f"[education_rag] pgvector attempt failed: {e}")
            pgvector_ok = False

        if pgvector_ok:
            _initialized = True
            return True

        # 3. Fallback: in-memory with embeddings (for local SQLite dev)
        logger.info("[education_rag] Using in-memory vector search (no pgvector)")
        texts = [c["text"] for c in all_chunks]
        embeddings = _embed_texts(api_key, texts)
        _chunks_cache = all_chunks
        _embeddings_cache = embeddings
        _initialized = True
        logger.info(f"[education_rag] In-memory index built: {len(all_chunks)} chunks")
        return True

    except Exception as e:
        logger.error(f"[education_rag] Failed to initialize: {e}")
        return False


def retrieve(
    api_key: str,
    query: str,
    topic: Optional[str] = None,
    top_k: int = 3,
) -> list[str]:
    """
    Retrieve relevant education chunks for a query.
    Returns list of text chunks, or [] if RAG unavailable.
    """
    if not _initialized:
        return []

    # pgvector path (async)
    if _use_pgvector:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    return pool.submit(
                        asyncio.run, _retrieve_pgvector(api_key, query, topic, top_k)
                    ).result(timeout=30)
            else:
                return asyncio.run(_retrieve_pgvector(api_key, query, topic, top_k))
        except Exception as e:
            logger.error(f"[education_rag] pgvector retrieve wrapper failed: {e}")
            return []

    # In-memory fallback
    if not _chunks_cache or not _embeddings_cache:
        return []

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        result = client.models.embed_content(
            model="gemini-embedding-001",
            contents=[query],
        )
        query_emb = result.embeddings[0].values

        # Score all chunks
        scored = []
        for i, emb in enumerate(_embeddings_cache):
            chunk = _chunks_cache[i]
            if topic and chunk["topic"] != topic:
                continue
            sim = _cosine_similarity(query_emb, emb)
            scored.append((sim, chunk["text"]))

        # If topic filter returned nothing, try without
        if not scored and topic:
            for i, emb in enumerate(_embeddings_cache):
                sim = _cosine_similarity(query_emb, emb)
                scored.append((sim, _chunks_cache[i]["text"]))

        scored.sort(key=lambda x: x[0], reverse=True)
        chunks = [text for _, text in scored[:top_k]]
        logger.info(f"[education_rag] In-memory retrieved {len(chunks)} chunks for query={query!r} topic={topic}")
        return chunks

    except Exception as e:
        logger.error(f"[education_rag] In-memory retrieve failed: {e}")
        return []
