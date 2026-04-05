"""
Education RAG Service — retrieves relevant education chunks for the Education Agent.

Architecture:
  initialize_rag(api_key) → load docs, chunk, embed, store in ChromaDB
  retrieve(api_key, query, topic=None, top_k=3) → list of text chunks

Fallback chain: RAG+LLM → LLM-only → static content_library
If ChromaDB unavailable, retrieve() returns [] gracefully.
"""

import os
import re
import hashlib
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Paths
_DOCS_DIR = Path(__file__).resolve().parent.parent.parent / "education_docs"
_CHROMA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "chroma_db"
_HASH_FILE = _CHROMA_DIR / ".content_hash"

# Module-level state
_collection = None
_initialized = False


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
    # Simple frontmatter parser - no PyYAML dependency needed
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
            # Parse simple lists [a, b, c]
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

    # Split at ## headings
    sections = re.split(r'\n(?=## )', body)
    chunks = []

    for section in sections:
        section = section.strip()
        if not section or len(section) < 50:  # Skip tiny fragments
            continue

        # Extract heading if present
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
            "tags": tags,
            "heading": heading,
            "source": filepath.name,
        })

    return chunks


def initialize_rag(api_key: str) -> bool:
    """
    Load markdown docs, chunk, embed via Gemini, store in ChromaDB.
    Returns True if successful, False otherwise.
    Skips re-embedding if docs haven't changed (content hash check).
    """
    global _collection, _initialized

    try:
        import chromadb
    except ImportError:
        logger.warning("[education_rag] chromadb not installed — RAG disabled")
        return False

    if not _DOCS_DIR.exists() or not any(_DOCS_DIR.glob("*.md")):
        logger.warning(f"[education_rag] No docs found in {_DOCS_DIR}")
        return False

    try:
        # Check content hash — skip if unchanged
        current_hash = _compute_docs_hash()
        os.makedirs(_CHROMA_DIR, exist_ok=True)

        if _HASH_FILE.exists():
            stored_hash = _HASH_FILE.read_text().strip()
            if stored_hash == current_hash:
                # Just reconnect to existing DB
                client = chromadb.PersistentClient(path=str(_CHROMA_DIR))
                _collection = client.get_or_create_collection(
                    name="education",
                    metadata={"hnsw:space": "cosine"},
                )
                existing = _collection.count()
                if existing > 0:
                    _initialized = True
                    logger.info(f"[education_rag] Reusing existing index ({existing} chunks, hash unchanged)")
                    return True

        # Need to (re-)build index
        logger.info("[education_rag] Building education index...")

        # 1. Load and chunk all docs
        all_chunks = []
        for md_file in sorted(_DOCS_DIR.glob("*.md")):
            chunks = _chunk_document(md_file)
            all_chunks.extend(chunks)
            logger.info(f"[education_rag] {md_file.name}: {len(chunks)} chunks")

        if not all_chunks:
            logger.warning("[education_rag] No chunks extracted from docs")
            return False

        # 2. Embed via Gemini
        from google import genai
        genai_client = genai.Client(api_key=api_key)

        texts = [c["text"] for c in all_chunks]
        embeddings = []

        # Batch embed (Gemini supports up to 100 texts per call)
        BATCH_SIZE = 50
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i:i + BATCH_SIZE]
            result = genai_client.models.embed_content(
                model="gemini-embedding-001",
                contents=batch,
            )
            embeddings.extend([e.values for e in result.embeddings])

        logger.info(f"[education_rag] Embedded {len(embeddings)} chunks")

        # 3. Store in ChromaDB
        client = chromadb.PersistentClient(path=str(_CHROMA_DIR))
        # Delete old collection if exists
        try:
            client.delete_collection("education")
        except Exception:
            pass

        _collection = client.create_collection(
            name="education",
            metadata={"hnsw:space": "cosine"},
        )

        _collection.add(
            ids=[f"chunk_{i}" for i in range(len(all_chunks))],
            embeddings=embeddings,
            documents=texts,
            metadatas=[{
                "topic": c["topic"],
                "heading": c["heading"],
                "source": c["source"],
                "tags": ",".join(c["tags"]) if isinstance(c["tags"], list) else c["tags"],
            } for c in all_chunks],
        )

        # Save hash
        _HASH_FILE.write_text(current_hash)

        _initialized = True
        logger.info(f"[education_rag] Index built: {len(all_chunks)} chunks from {len(list(_DOCS_DIR.glob('*.md')))} docs")
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
    global _collection, _initialized

    if not _initialized or _collection is None:
        return []

    try:
        from google import genai

        # Embed the query
        genai_client = genai.Client(api_key=api_key)
        result = genai_client.models.embed_content(
            model="gemini-embedding-001",
            contents=[query],
        )
        query_embedding = result.embeddings[0].values

        # Build where filter for topic if provided
        where_filter = None
        if topic:
            where_filter = {"topic": topic}

        # Query ChromaDB — try with topic filter first, fallback to no filter
        for wf in ([where_filter, None] if where_filter else [None]):
            try:
                results = _collection.query(
                    query_embeddings=[query_embedding],
                    n_results=top_k,
                    where=wf,
                )
                if results and results["documents"] and results["documents"][0]:
                    chunks = results["documents"][0]
                    logger.info(f"[education_rag] Retrieved {len(chunks)} chunks for query={query!r} topic={topic} filtered={wf is not None}")
                    return chunks
            except Exception:
                continue  # Try without filter

        return []

    except Exception as e:
        logger.error(f"[education_rag] Retrieve failed: {e}")
        return []
