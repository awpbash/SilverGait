"""
Education RAG Service — retrieves relevant education chunks using pgvector.

Architecture:
  initialize_rag(api_key) → load docs, chunk, embed via Gemini, store in PostgreSQL (pgvector)
  retrieve(api_key, query, topic=None, top_k=3) → list of text chunks

Fallback chain: RAG+LLM → LLM-only → static content_library
Falls back to in-memory search if PostgreSQL/pgvector not available (local SQLite dev).
"""

import os
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
_chunks_cache: list[dict] = []
_embeddings_cache: list[list[float]] = []
_initialized = False
_use_pgvector = False


def _compute_docs_hash() -> str:
    hasher = hashlib.sha256()
    if not _DOCS_DIR.exists():
        return ""
    for f in sorted(_DOCS_DIR.glob("*.md")):
        hasher.update(f.read_bytes())
    return hasher.hexdigest()


def _parse_frontmatter(text: str) -> tuple[dict, str]:
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
            nl = section.find("\n")
            if nl > 0:
                heading = section[3:nl].strip()
        elif section.startswith("# "):
            nl = section.find("\n")
            if nl > 0:
                heading = section[2:nl].strip()
        chunks.append({
            "text": section,
            "topic": topic,
            "tags": ",".join(tags) if isinstance(tags, list) else tags,
            "heading": heading,
            "source": filepath.name,
        })
    return chunks


def _embed_texts(api_key: str, texts: list[str]) -> list[list[float]]:
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


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


async def initialize_rag(api_key: str) -> bool:
    """
    Load markdown docs, chunk, embed via Gemini, store in pgvector or in-memory.
    This is async — call with await from FastAPI startup.
    """
    global _chunks_cache, _embeddings_cache, _initialized, _use_pgvector

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

        # 2. Try pgvector if PostgreSQL is available
        if os.environ.get("DATABASE_URL"):
            try:
                pgvector_ok = await _init_pgvector(api_key, all_chunks)
                if pgvector_ok:
                    _initialized = True
                    return True
            except Exception as e:
                logger.warning(f"[education_rag] pgvector failed: {e}")

        # 3. Fallback: in-memory with embeddings (for local SQLite dev)
        logger.info("[education_rag] Using in-memory vector search (no pgvector)")
        texts = [c["text"] for c in all_chunks]
        embeddings = await asyncio.to_thread(_embed_texts, api_key, texts)
        _chunks_cache = all_chunks
        _embeddings_cache = embeddings
        _initialized = True
        logger.info(f"[education_rag] In-memory index built: {len(all_chunks)} chunks")
        return True

    except Exception as e:
        logger.error(f"[education_rag] Failed to initialize: {e}")
        return False


async def _init_pgvector(api_key: str, all_chunks: list[dict]) -> bool:
    """Store chunks + embeddings in PostgreSQL with pgvector."""
    global _use_pgvector

    from sqlalchemy import text as sa_text
    from ..core.database import engine, async_session

    # Enable pgvector extension
    async with engine.begin() as conn:
        await conn.execute(sa_text("CREATE EXTENSION IF NOT EXISTS vector"))

    # Create table
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

    # Check content hash — skip if unchanged
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

    # Embed all chunks
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
                    VALUES (:content, :topic, :heading, :source, :tags, :hash, CAST(:emb AS vector))
                """),
                {
                    "content": chunk["text"],
                    "topic": chunk["topic"],
                    "heading": chunk["heading"],
                    "source": chunk["source"],
                    "tags": chunk["tags"],
                    "hash": current_hash,
                    "emb": emb_str,
                },
            )

    # Create index after data is inserted (ivfflat needs data)
    async with engine.begin() as conn:
        await conn.execute(sa_text(
            "DROP INDEX IF EXISTS idx_education_chunks_embedding"
        ))
        await conn.execute(sa_text("""
            CREATE INDEX idx_education_chunks_embedding
            ON education_chunks USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 10)
        """))

    _use_pgvector = True
    logger.info(f"[education_rag] pgvector index built: {len(all_chunks)} chunks")
    return True


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

    if _use_pgvector:
        try:
            loop = asyncio.get_running_loop()
            # We're in an async context — use a thread to run the async retrieval
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(
                    asyncio.run, _retrieve_pgvector(api_key, query, topic, top_k)
                ).result(timeout=30)
        except RuntimeError:
            # No running loop
            return asyncio.run(_retrieve_pgvector(api_key, query, topic, top_k))
        except Exception as e:
            logger.error(f"[education_rag] pgvector retrieve failed: {e}")
            return []

    # In-memory fallback
    return _retrieve_in_memory(api_key, query, topic, top_k)


async def _retrieve_pgvector(api_key: str, query: str, topic: Optional[str], top_k: int) -> list[str]:
    try:
        from google import genai
        from sqlalchemy import text as sa_text
        from ..core.database import async_session

        client = genai.Client(api_key=api_key)
        result = await asyncio.to_thread(
            client.models.embed_content,
            model="gemini-embedding-001",
            contents=[query],
        )
        query_emb = result.embeddings[0].values
        emb_str = "[" + ",".join(str(v) for v in query_emb) + "]"

        for use_topic in ([True, False] if topic else [False]):
            if use_topic:
                sql = sa_text("""
                    SELECT content FROM education_chunks
                    WHERE topic = :topic
                    ORDER BY embedding <=> CAST(:emb AS vector)
                    LIMIT :top_k
                """)
                params = {"topic": topic, "emb": emb_str, "top_k": top_k}
            else:
                sql = sa_text("""
                    SELECT content FROM education_chunks
                    ORDER BY embedding <=> CAST(:emb AS vector)
                    LIMIT :top_k
                """)
                params = {"emb": emb_str, "top_k": top_k}

            async with async_session() as session:
                result = await session.execute(sql, params)
                rows = result.all()
                if rows:
                    chunks = [r[0] for r in rows]
                    logger.info(f"[education_rag] pgvector retrieved {len(chunks)} chunks for query={query!r}")
                    return chunks

        return []
    except Exception as e:
        logger.error(f"[education_rag] pgvector retrieve error: {e}")
        return []


def _retrieve_in_memory(api_key: str, query: str, topic: Optional[str], top_k: int) -> list[str]:
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

        scored = []
        for i, emb in enumerate(_embeddings_cache):
            chunk = _chunks_cache[i]
            if topic and chunk["topic"] != topic:
                continue
            sim = _cosine_similarity(query_emb, emb)
            scored.append((sim, chunk["text"]))

        if not scored and topic:
            for i, emb in enumerate(_embeddings_cache):
                sim = _cosine_similarity(query_emb, emb)
                scored.append((sim, _chunks_cache[i]["text"]))

        scored.sort(key=lambda x: x[0], reverse=True)
        chunks = [text for _, text in scored[:top_k]]
        logger.info(f"[education_rag] In-memory retrieved {len(chunks)} chunks for query={query!r}")
        return chunks
    except Exception as e:
        logger.error(f"[education_rag] In-memory retrieve failed: {e}")
        return []
