"""
LangGraph Agent Integration for SilverGait.
Two-graph architecture: Assessment Graph (0 LLM) + Chat Graph (1 LLM).
"""

from .assessment_graph import run_assessment_pipeline
from .chat_graph import run_chat_pipeline, run_chat_pipeline_stream

# Legacy export for backward compatibility (old 9-agent system)
try:
    from .workflow import run_post_assessment_graph, AgentResult
except ImportError:
    run_post_assessment_graph = None
    AgentResult = None

__all__ = [
    "run_assessment_pipeline",
    "run_chat_pipeline",
    "run_chat_pipeline_stream",
    "run_post_assessment_graph",
    "AgentResult",
]
