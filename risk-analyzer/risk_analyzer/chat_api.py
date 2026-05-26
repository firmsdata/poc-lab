"""
chat_api.py — AI chat endpoint backed by the local Ollama model.

The assistant has access to:
  - The DRHP Rulebook knowledge layer
  - Relevant risk records from the database (filtered by domain if provided)
  - The full conversation history sent from the client
"""
from __future__ import annotations

import json
import logging
import os
import urllib.request
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from .db import get_database_url
from .kb_api import _run_query
from .knowledge_base import get_rulebook_prompt_context

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

OLLAMA_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434") + "/api/chat"


class ChatMessageIn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessageIn]
    domain: Optional[str] = None


def _fetch_context_risks(domain: Optional[str], limit: int = 20) -> str:
    conditions = ["r.domain IS NOT NULL"]
    params: dict = {}
    if domain:
        conditions.append("r.domain = %(domain)s")
        params["domain"] = domain

    where = " AND ".join(conditions)
    rows = _run_query(f"""
        SELECT r.title, r.category, r.description
        FROM risks r
        WHERE {where}
        ORDER BY r.id DESC
        LIMIT %(limit)s
    """, {**params, "limit": limit})

    if not rows:
        return "No risk records available in the database yet."

    lines = []
    for row in rows:
        desc = (row["description"] or "")[:300]
        lines.append(f"• [{row['category']}] {row['title']}: {desc}")
    return "\n".join(lines)


SYSTEM_PROMPT = """\
You are FirmsData Risk Intelligence — an expert AI assistant specializing in Indian IPO risk factor analysis.
You help lawyers, investment bankers, and compliance teams draft, review, and benchmark DRHP/RHP risk disclosures under SEBI's ICDR framework.

You have access to:
1. A structured DRHP Risk-Factor Rulebook with disclosure standards
2. A database of real risk factors extracted from filed DRHP/RHP documents

Always be concise, specific, and cite examples from the knowledge base where relevant.
When reviewing risk disclosures, evaluate against the DRHP Rulebook principles.
Format responses with clear structure when listing multiple points.

DRHP RULEBOOK:
{rulebook_context}

RELEVANT RISK FACTORS FROM THE KNOWLEDGE BASE:
{risk_context}
"""


@router.post("/chat")
def api_chat(request: ChatRequest):
    """Chat with the Risk Intelligence AI backed by Ollama."""
    risk_context = _fetch_context_risks(request.domain)
    system_content = SYSTEM_PROMPT.format(
        rulebook_context=get_rulebook_prompt_context(),
        risk_context=risk_context,
    )

    messages = [{"role": "system", "content": system_content}]
    for msg in request.messages:
        messages.append({"role": msg.role, "content": msg.content})

    model = os.environ.get("RISK_AI_MODEL", "llama3")
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0.3},
    }

    try:
        req = urllib.request.Request(
            OLLAMA_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data.get("message", {}).get("content", "")
            return {"response": content or "I couldn't generate a response."}
    except Exception as exc:
        logger.warning(f"Chat AI failed: {exc}")
        return {
            "response": (
                "I'm currently unable to connect to the AI model. "
                "Please ensure Ollama is running (`ollama serve`) with the "
                f"`{model}` model available (`ollama pull {model}`)."
            )
        }
