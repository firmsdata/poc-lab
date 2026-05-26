"""
draft_api.py — DRHP Drafting Assistant API

Endpoints:
  POST /api/draft/analyze   — score a single drafted risk factor and return AI feedback
  GET  /api/draft/templates — return boilerplate vs. compliant comparison templates
"""
from __future__ import annotations

import json
import logging
import os
import re
import urllib.request
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from .knowledge_base import get_rulebook_prompt_context

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/draft")

OLLAMA_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434") + "/api/chat"


# ─── Request / Response Models ────────────────────────────────────────────────

class DraftAnalyzeRequest(BaseModel):
    text: str
    domain: Optional[str] = None
    category: Optional[str] = None


class ChecklistItem(BaseModel):
    id: str
    label: str
    passed: bool
    detail: Optional[str] = None


class DraftAnalyzeResponse(BaseModel):
    quality: str          # "High Concern" | "Needs Improvement" | "Adequate"
    score: int            # 0–100
    issue: Optional[str] = None
    improvement: Optional[str] = None
    rewrite: Optional[str] = None
    checklist: list[ChecklistItem]
    ai_available: bool


# ─── Rule-Based Checklist ─────────────────────────────────────────────────────

_PROMO_WORDS = re.compile(
    r"\b(market leader|best-in-class|unparalleled|highly sophisticated|"
    r"world-class|industry-leading|cutting-edge|revolutionary|innovative platform)\b",
    re.IGNORECASE,
)
_QUANTIFIER = re.compile(
    r"(\d+[\.,]?\d*\s*(%|percent|₹|INR|million|billion|crore|lakh|rs\.|rupees|x\b))",
    re.IGNORECASE,
)
_SEBI_REF = re.compile(
    r"(SEBI|ICDR|regulation|section|schedule|circular|notification|guideline|act|rule)\s+\d*",
    re.IGNORECASE,
)
_DRHP_REF = re.compile(
    r"(page|chapter|section|annex|schedule)\s+\d+",
    re.IGNORECASE,
)
_DISCLAIMER = re.compile(
    r"\b(we cannot guarantee|no assurance|beyond our control|cannot be predicted|"
    r"inherently uncertain|we cannot assure|beyond the control)\b",
    re.IGNORECASE,
)


def _rule_checklist(text: str) -> list[ChecklistItem]:
    """Run deterministic checks on the draft text and return checklist items."""
    items: list[ChecklistItem] = []
    word_count = len(text.split())

    # 1. Quantification
    quants = _QUANTIFIER.findall(text)
    items.append(ChecklistItem(
        id="quantified",
        label="Contains specific numbers / financial metrics",
        passed=bool(quants),
        detail=f"Found: {', '.join(q[0] for q in quants[:3])}" if quants else
               "Add percentages, INR values, or volume figures to make the risk material and measurable.",
    ))

    # 2. Regulatory references
    refs = _SEBI_REF.findall(text)
    items.append(ChecklistItem(
        id="regulatory_ref",
        label="References SEBI / regulatory framework",
        passed=bool(refs),
        detail=None if refs else "Cite the specific SEBI ICDR regulation, Act section, or circular that governs this risk.",
    ))

    # 3. DRHP cross-reference
    drhp = _DRHP_REF.findall(text)
    _xref_hint = "Add a cross-reference such as: 'as detailed in Our Business on Page 92'."
    items.append(ChecklistItem(
        id="cross_reference",
        label="Cross-referenced to a DRHP section / page",
        passed=bool(drhp),
        detail=None if drhp else _xref_hint,
    ))

    # 4. No promotional language
    promo = _PROMO_WORDS.findall(text)
    items.append(ChecklistItem(
        id="no_promo",
        label="Free of promotional / speculative language",
        passed=not bool(promo),
        detail=f"Remove promotional words: {', '.join(promo)}" if promo else None,
    ))

    # 5. No disclaimer clauses
    disc = _DISCLAIMER.findall(text)
    items.append(ChecklistItem(
        id="no_disclaimer",
        label="Does not shift liability / use disclaimer clauses",
        passed=not bool(disc),
        detail=f"Rephrase clauses like: {', '.join(disc[:2])}" if disc else None,
    ))

    # 6. Minimum length
    items.append(ChecklistItem(
        id="min_length",
        label="Sufficient detail (at least 40 words)",
        passed=word_count >= 40,
        detail=f"Currently {word_count} words. Expand the disclosure with specific context." if word_count < 40 else None,
    ))

    return items


def _compute_score(checklist: list[ChecklistItem]) -> tuple[int, str]:
    """Convert checklist results into a 0–100 score and quality label."""
    weights = {
        "quantified": 30,
        "regulatory_ref": 20,
        "cross_reference": 15,
        "no_promo": 15,
        "no_disclaimer": 10,
        "min_length": 10,
    }
    score = sum(weights.get(item.id, 0) for item in checklist if item.passed)
    if score >= 80:
        quality = "Adequate"
    elif score >= 50:
        quality = "Needs Improvement"
    else:
        quality = "High Concern"
    return score, quality


# ─── AI Analysis ──────────────────────────────────────────────────────────────

DRAFT_SYSTEM_PROMPT = """\
You are a SEBI ICDR compliance expert specializing in reviewing DRHP risk factor disclosures.

Your job is to evaluate a single drafted risk factor and respond ONLY with valid JSON (no markdown, no preamble) in this exact structure:
{{
  "issue": "<one clear sentence describing the main drafting weakness>",
  "improvement": "<one specific sentence recommending how to fix it>",
  "rewrite": "<a fully rewritten, compliant version of the risk factor — 3-5 sentences, specific numbers, SEBI references>"
}}

DRHP RULEBOOK CONTEXT:
{rulebook}

Evaluate strictly against SEBI ICDR standards. Always quantify risks, cross-reference to DRHP sections, avoid promotional language, and include the direct financial/operational impact.
"""


def _call_ai(text: str, domain: Optional[str]) -> dict:
    model = os.environ.get("RISK_AI_MODEL", "llama3")
    rulebook = get_rulebook_prompt_context()
    system = DRAFT_SYSTEM_PROMPT.format(rulebook=rulebook)

    user_msg = f"Domain: {domain or 'General'}\n\nDraft Risk Factor:\n{text}"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
        "stream": False,
        "options": {"temperature": 0.2},
    }

    try:
        req = urllib.request.Request(
            OLLAMA_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data.get("message", {}).get("content", "")
            # Strip markdown code fences if present
            content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip(), flags=re.MULTILINE)
            return json.loads(content)
    except Exception as exc:
        logger.warning(f"Draft AI failed: {exc}")
        return {}


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/analyze", response_model=DraftAnalyzeResponse)
def api_draft_analyze(req: DraftAnalyzeRequest) -> DraftAnalyzeResponse:
    """
    Analyze a user-drafted DRHP risk factor.
    Returns a quality score, rule-based checklist, and AI improvement suggestions.
    """
    text = (req.text or "").strip()
    if not text:
        return DraftAnalyzeResponse(
            quality="High Concern",
            score=0,
            issue="No text provided.",
            improvement="Enter a draft risk factor to get feedback.",
            checklist=[],
            ai_available=False,
        )

    checklist = _rule_checklist(text)
    score, quality = _compute_score(checklist)

    # Call AI for issue / improvement / rewrite
    ai = _call_ai(text, req.domain) if text else {}
    ai_available = bool(ai)

    # Fallback if AI unavailable
    failed_checks = [c for c in checklist if not c.passed]
    fallback_issue = failed_checks[0].detail if failed_checks else "This disclosure appears compliant."
    fallback_improvement = (
        "Ensure the risk factor is quantified, cross-referenced to the DRHP, "
        "and cites the applicable SEBI regulation."
    )

    return DraftAnalyzeResponse(
        quality=quality,
        score=score,
        issue=ai.get("issue") or fallback_issue,
        improvement=ai.get("improvement") or fallback_improvement,
        rewrite=ai.get("rewrite"),
        checklist=checklist,
        ai_available=ai_available,
    )


@router.get("/templates")
def api_draft_templates():
    """Return comparison examples of boilerplate vs. compliant DRHP risk factors."""
    return {
        "templates": [
            {
                "id": "customer_concentration",
                "title": "Customer Concentration",
                "category": "operational",
                "boilerplate": (
                    "We depend on a limited number of customers. The loss of one or more "
                    "customer relationships could adversely impact our revenues."
                ),
                "compliant": (
                    "Our top 5 customers accounted for 42.3% and 38.1% of our revenue in FY25 and FY24 "
                    "respectively. Our largest customer, [Company A], contributed 14.2% of revenues in FY25. "
                    "We do not have long-term purchase agreements with any of these customers. Under SEBI ICDR "
                    "Regulation 27(1)(b), material customer dependencies must be quantified. The loss of any "
                    "one of these top customers could reduce our annual revenues by up to ₹245 million."
                ),
                "issues": ["Not quantified", "No customer names or percentages", "No SEBI reference"],
            },
            {
                "id": "litigation",
                "title": "Pending Litigation",
                "category": "legal",
                "boilerplate": (
                    "We are involved in various legal proceedings. Any adverse outcome in these cases "
                    "could affect our financial condition."
                ),
                "compliant": (
                    "We face 4 outstanding tax litigations with the Income Tax Department seeking an aggregate "
                    "sum of ₹142.5 million, as detailed in 'Outstanding Litigations' on Page 184 of this DRHP. "
                    "An adverse ruling would reduce our net profit margin by approximately 1.8% based on FY25 PAT. "
                    "Per SEBI ICDR Schedule VIII(1)(c), all pending litigation with financial exposure must be "
                    "individually disclosed with quantum estimates."
                ),
                "issues": ["No quantum disclosed", "No page cross-reference", "No SEBI citation"],
            },
            {
                "id": "raw_material",
                "title": "Raw Material Price Volatility",
                "category": "financial",
                "boilerplate": (
                    "Fluctuations in the price of raw materials may increase our cost of production "
                    "and reduce our margins."
                ),
                "compliant": (
                    "Steel sheets constitute 62% of our total raw material costs (FY25: ₹1,240 million). "
                    "We do not maintain long-term fixed-price supply contracts for steel. A 10% increase in "
                    "global steel prices, if unhedged and not passed on to clients, would reduce our EBITDA "
                    "by ₹45.0 million (based on FY25 volumes). This risk is further described in 'Our Business "
                    "— Raw Material Procurement' on Page 127 of this DRHP."
                ),
                "issues": ["No % of cost base", "No sensitivity analysis", "No DRHP cross-reference"],
            },
            {
                "id": "regulatory",
                "title": "Regulatory Approvals",
                "category": "regulatory",
                "boilerplate": (
                    "We require certain regulatory approvals to operate. Failure to obtain or renew them "
                    "could halt our production."
                ),
                "compliant": (
                    "Our manufacturing facility in Pune operates under a Consent-to-Operate (CTO) license "
                    "from Maharashtra Pollution Control Board (MPCB) expiring on December 31, 2026. Renewal "
                    "requires compliance with updated solid-waste norms effective October 2025, which we "
                    "estimate will require ₹25.0 million in capital expenditure. Failure to renew would "
                    "suspend operations at this facility, which contributed ₹890 million (73%) of FY25 "
                    "revenues. See 'Government and Other Approvals' on Page 213 of this DRHP."
                ),
                "issues": ["No license names or dates", "No financial impact", "No capex estimate"],
            },
        ]
    }
