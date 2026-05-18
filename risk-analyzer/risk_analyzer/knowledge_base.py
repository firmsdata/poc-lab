"""
knowledge_base.py - DRHP risk-factor drafting rulebook.

This module captures reusable guidance from external practice material and
turns it into deterministic checks plus compact prompt context for AI review.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, List


DRHP_RULEBOOK_SOURCE = {
    "title": "The DRHP Rulebook",
    "publisher": "LiveLaw",
    "url": "https://www.livelaw.in/law-firms/law-firm-articles-/the-drhp-rulebook-law-firms-articles-293635",
}


@dataclass(frozen=True)
class KBRule:
    code: str
    title: str
    category: str
    severity: str
    guidance: str
    weak_pattern: str
    preferred_pattern: str
    source_title: str = DRHP_RULEBOOK_SOURCE["title"]
    source_url: str = DRHP_RULEBOOK_SOURCE["url"]


DRHP_RISK_RULES: tuple[KBRule, ...] = (
    KBRule(
        code="DRHP-MATERIALITY-ORDERING",
        title="Materiality-led ordering",
        category="materiality",
        severity="MEDIUM CONCERN",
        guidance="Risk factors should be ordered by real issuer-level materiality, with the most material risks appearing first.",
        weak_pattern="Generic sequencing or important risks buried deep in the section.",
        preferred_pattern="Rank prominent risks using issuer-specific impact, exposure, recent incidents, and likelihood.",
    ),
    KBRule(
        code="DRHP-ISSUER-SPECIFICITY",
        title="Issuer-specific disclosure",
        category="specificity",
        severity="HIGH CONCERN",
        guidance="Risk language should be tailored to the issuer's actual business, contracts, dependencies, disputes, and operating history.",
        weak_pattern="Template wording that could apply to any issuer in the industry.",
        preferred_pattern="Name the affected business line, facility, geography, customer/supplier class, or operational dependency.",
    ),
    KBRule(
        code="DRHP-QUANTIFICATION",
        title="Data-backed risk disclosure",
        category="quantification",
        severity="HIGH CONCERN",
        guidance="Where possible, risks should include metrics, trends, ratios, historical incidents, concentration levels, or financial impact.",
        weak_pattern="A risk states that an event may occur but gives no magnitude, frequency, trend, or financial exposure.",
        preferred_pattern="Add percentages, amounts, period-wise trends, customer/supplier concentration, debt figures, or past disruption impact.",
    ),
    KBRule(
        code="DRHP-VAGUE-LANGUAGE",
        title="Avoid vague or promotional wording",
        category="drafting_quality",
        severity="MEDIUM CONCERN",
        guidance="Disclosures should avoid vague phrases and unsupported adjectives unless objectively substantiated elsewhere in the DRHP.",
        weak_pattern="Use of phrases such as certain risks, may adversely affect, leading, strong, robust, or well-established without support.",
        preferred_pattern="Replace generic qualifiers with concrete facts and explain the actual adverse consequence.",
    ),
    KBRule(
        code="DRHP-CROSS-REFERENCE",
        title="Cross-reference supporting DRHP sections",
        category="cross_reference",
        severity="MEDIUM CONCERN",
        guidance="Risk factors should align with and cross-reference relevant business, financial, litigation, contract, and objects sections.",
        weak_pattern="A risk describes exposure without connecting it to supporting disclosures elsewhere in the offer document.",
        preferred_pattern="Tie the risk to the relevant DRHP section, such as Our Business, Financial Information, Outstanding Litigation, or Material Contracts.",
    ),
    KBRule(
        code="DRHP-CATEGORY-COVERAGE",
        title="Cover recurring regulatory risk categories",
        category="coverage",
        severity="MEDIUM CONCERN",
        guidance="A complete DRHP risk section should consider business, governance, regulatory, financial, contractual, cyber/data, and external risks.",
        weak_pattern="The risk section over-indexes on generic business risks and omits governance, compliance, financial, contractual, or cyber/data exposures.",
        preferred_pattern="Use a taxonomy-driven review to test whether all issuer-relevant risk categories have been addressed.",
    ),
)


VAGUE_OR_PROMOTIONAL_TERMS: tuple[str, ...] = (
    "certain risks",
    "material adverse effect",
    "may adversely affect",
    "may be adversely affected",
    "leading",
    "strong",
    "robust",
    "well established",
    "well-established",
    "significant experience",
)

QUANTIFICATION_RE = re.compile(
    r"(\b\d+(?:\.\d+)?\s?(?:%|percent|crore|lakh|million|billion|times|x)\b|"
    r"\b(?:fy|fiscal|financial year)\s?\d{2,4}\b|"
    r"\b\d{4}\b|"
    r"\b(?:top|largest)\s+\d+\b)",
    re.IGNORECASE,
)

CROSS_REFERENCE_RE = re.compile(
    r"\b(our business|financial information|outstanding litigation|material contracts|"
    r"objects of the issue|management discussion|restated financial|government approvals|"
    r"history and certain corporate matters|related party transactions)\b",
    re.IGNORECASE,
)

ISSUER_SPECIFIC_RE = re.compile(
    r"\b(customer|supplier|vendor|facility|plant|factory|contract|agreement|license|"
    r"litigation|proceeding|subsidiary|promoter|director|geograph|raw material|"
    r"working capital|borrowings|insurance|cyber|data|system)\b",
    re.IGNORECASE,
)


def get_rulebook_prompt_context() -> str:
    """Return compact rulebook guidance for prompt injection."""
    lines = [
        f"Source: {DRHP_RULEBOOK_SOURCE['title']} ({DRHP_RULEBOOK_SOURCE['url']})",
        "Evaluate DRHP/RHP risk factors against these rulebook principles:",
    ]
    for rule in DRHP_RISK_RULES:
        lines.append(f"- {rule.code}: {rule.guidance}")
    return "\n".join(lines)


def get_rulebook_summary() -> list[dict]:
    """Return rules in JSON-friendly form for API/UI consumers."""
    return [
        {
            "code": rule.code,
            "title": rule.title,
            "category": rule.category,
            "severity": rule.severity,
            "guidance": rule.guidance,
            "source_title": rule.source_title,
            "source_url": rule.source_url,
        }
        for rule in DRHP_RISK_RULES
    ]


def evaluate_risk_against_rulebook(risk: dict) -> list[dict]:
    """Return deterministic rulebook findings for one extracted risk."""
    title = risk.get("title") or ""
    description = risk.get("description") or ""
    text = f"{title}\n{description}".strip()
    lower_text = text.lower()

    findings: List[dict] = []

    if _is_generic(text):
        findings.append(_finding("DRHP-ISSUER-SPECIFICITY"))

    if len(text) > 120 and not QUANTIFICATION_RE.search(text):
        findings.append(_finding("DRHP-QUANTIFICATION"))

    vague_terms = [term for term in VAGUE_OR_PROMOTIONAL_TERMS if term in lower_text]
    if vague_terms:
        item = _finding("DRHP-VAGUE-LANGUAGE")
        item["matched_terms"] = vague_terms[:5]
        findings.append(item)

    if _needs_cross_reference(risk, text) and not CROSS_REFERENCE_RE.search(text):
        findings.append(_finding("DRHP-CROSS-REFERENCE"))

    return findings


def evaluate_section_coverage(risks: Iterable[dict]) -> list[dict]:
    """Return document-level coverage findings based on extracted categories."""
    categories = {(risk.get("category") or "").lower() for risk in risks}
    sub_categories = {(risk.get("sub_category") or "").lower() for risk in risks}
    joined = " ".join(sorted(categories | sub_categories))

    expected = {
        "regulatory": "regulatory/compliance",
        "financial": "financial",
        "tech": "cyber/data/technology",
        "operational": "business/operational",
        "market": "external/market",
    }
    missing = [label for category, label in expected.items() if category not in categories and category not in joined]
    if not missing:
        return []

    item = _finding("DRHP-CATEGORY-COVERAGE")
    item["missing_categories"] = missing
    item["message"] = (
        "Review whether these recurring DRHP risk categories are issuer-relevant and need disclosure: "
        + ", ".join(missing)
        + "."
    )
    return [item]


def _is_generic(text: str) -> bool:
    if not text:
        return True
    if len(text) < 180:
        return True
    return not ISSUER_SPECIFIC_RE.search(text)


def _needs_cross_reference(risk: dict, text: str) -> bool:
    category = (risk.get("category") or "").lower()
    sub_category = (risk.get("sub_category") or "").lower()
    if category in {"financial", "regulatory"}:
        return True
    if sub_category in {"debt", "compliance", "customer concentration", "supply chain"}:
        return True
    return bool(re.search(r"\b(litigation|contract|agreement|borrowings|debt|license|approval)\b", text, re.IGNORECASE))


def _finding(code: str) -> dict:
    rule = next(rule for rule in DRHP_RISK_RULES if rule.code == code)
    return {
        "code": rule.code,
        "title": rule.title,
        "category": rule.category,
        "severity": rule.severity,
        "message": rule.guidance,
        "suggestion": rule.preferred_pattern,
        "source_title": rule.source_title,
        "source_url": rule.source_url,
    }
