"""
scorer.py - risk disclosure quality scoring.

Scores are persisted at ingestion time so corpus analytics can read stable
values from the database instead of recalculating on every page load.
"""
from __future__ import annotations

from datetime import datetime, timezone

from .knowledge_base import evaluate_risk_against_rulebook


SCORE_FIELDS = (
    "specificity_score",
    "quantification_score",
    "cross_reference_score",
    "drafting_score",
    "coverage_score",
)


def score_risk_rule_based(risk: dict) -> dict:
    """
    Score one risk against the DRHP rulebook.

    Scores are intentionally conservative and explainable:
    - high score means no issue was detected for that dimension
    - lower score means the rulebook check found a drafting weakness
    """
    findings = evaluate_risk_against_rulebook(risk)
    finding_categories = {finding.get("category") for finding in findings}

    rationale_parts = []
    if "specificity" in finding_categories:
        rationale_parts.append("Risk appears generic or insufficiently issuer-specific.")
    if "quantification" in finding_categories:
        rationale_parts.append("Risk lacks measurable exposure, trend, amount, or concentration detail.")
    if "cross_reference" in finding_categories:
        rationale_parts.append("Risk should be tied to supporting DRHP sections.")
    if "drafting_quality" in finding_categories:
        rationale_parts.append("Risk contains vague or promotional wording.")
    if not rationale_parts:
        rationale_parts.append("No rulebook scoring issues detected.")

    return {
        "specificity_score": 45 if "specificity" in finding_categories else 90,
        "quantification_score": 45 if "quantification" in finding_categories else 90,
        "cross_reference_score": 55 if "cross_reference" in finding_categories else 88,
        "drafting_score": 60 if "drafting_quality" in finding_categories else 92,
        "coverage_score": 75,
        "scoring_method": "rulebook",
        "scoring_rationale": " ".join(rationale_parts),
        "scored_at": datetime.now(timezone.utc).isoformat(),
    }


def attach_scores(risk: dict) -> dict:
    scored = dict(risk)
    scored.update(score_risk_rule_based(scored))
    return scored
