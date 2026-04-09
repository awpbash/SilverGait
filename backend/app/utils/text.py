"""Shared text utilities."""

import json
import re
import logging

logger = logging.getLogger(__name__)


def strip_markdown_fences(text: str) -> str:
    """Remove markdown code fences (```json ... ```) from LLM output."""
    text = text.strip()
    if not text.startswith("```"):
        return text
    lines = text.split("\n")
    if lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def extract_json(text: str) -> dict:
    """
    Robustly extract a JSON object from LLM output.

    Handles:
    - Clean JSON: {"score": 3, ...}
    - Markdown-fenced: ```json\n{...}\n```
    - Surrounded by reasoning text: "Here's my analysis:\n{...}\nNote: ..."
    - Multiple JSON objects (takes the first valid one)

    Raises ValueError if no valid JSON found.
    """
    text = text.strip()

    # 1. Try direct parse (best case)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 2. Strip markdown fences
    stripped = strip_markdown_fences(text)
    if stripped != text:
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            pass

    # 3. Find JSON object by matching braces
    # Look for the first { and find its matching }
    start = text.find("{")
    if start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    candidate = text[start : i + 1]
                    try:
                        result = json.loads(candidate)
                        if isinstance(result, dict):
                            logger.info(f"Extracted JSON from position {start}-{i+1} of {len(text)} chars")
                            return result
                    except json.JSONDecodeError:
                        pass
                    break

    # 4. Regex fallback: find anything that looks like {"score": ...}
    pattern = r'\{[^{}]*"score"\s*:\s*\d[^{}]*\}'
    match = re.search(pattern, text)
    if match:
        try:
            result = json.loads(match.group())
            logger.info(f"Extracted JSON via regex fallback")
            return result
        except json.JSONDecodeError:
            pass

    logger.error(f"Could not extract JSON from Gemini response ({len(text)} chars): {text[:200]}...")
    raise ValueError(f"No valid JSON found in response")
