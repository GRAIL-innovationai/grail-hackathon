"""Agent C: resume understanding, explainable matching, grounded outreach."""

from .errors import CareerCoachError
from .matching import rank_jobs
from .outreach import BASELINE_INSTRUCTIONS, GenerationInstructions, generate_message, generate_outreach
from .resume import parse_resume, parse_resume_pdf, parse_resume_text
from .service import coach, handle_request

__all__ = ["CareerCoachError", "BASELINE_INSTRUCTIONS", "GenerationInstructions",
           "parse_resume", "parse_resume_pdf", "parse_resume_text", "rank_jobs",
           "generate_outreach", "generate_message", "coach", "handle_request"]
