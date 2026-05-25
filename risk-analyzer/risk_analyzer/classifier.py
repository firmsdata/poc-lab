"""
classifier.py — rule-based + AI risk classification, build_risk_records
"""
from __future__ import annotations

import json
import logging
import os
import re
import hashlib
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Keyword tables ────────────────────────────────────────────────────────────

_DOMAIN_KEYWORDS: List[Tuple[str, List[str]]] = [
    ("energy",        ["power", "renewable", "ethanol", "gas", "co2", "co₂", "carbon"]),
    ("manufacturing", ["manufacturing", "plant", "factory", "capacity", "raw material", "production"]),
    ("saas",          ["saas", "software", "platform", "subscription", "cloud"]),
    ("fintech",       ["nbfc", "lending", "payment gateway", "digital payment", "financial services"]),
    ("healthcare",    ["hospital", "pharma", "medical", "healthcare", "drug"]),
    ("logistics",     ["logistics", "transport", "warehouse", "fleet"]),
]

_CATEGORY_KEYWORDS: List[Tuple[str, List[str]]] = [
    ("regulatory",  ["regulation", "regulatory", "law", "legal", "compliance",
                     "license", "approval", "sebi", "rbi", "government", "tax"]),
    ("financial",   ["revenue", "profit", "cash flow", "borrow", "debt", "funding",
                     "finance", "working capital", "interest", "credit"]),
    ("market",      ["market", "competition", "customer", "demand", "price",
                     "economic", "geopolitical", "inflation"]),
    ("tech",        ["technology", "cyber", "software", "data", "system", "platform", "security"]),
    ("operational", ["operations", "manufacturing", "supply", "logistics", "capacity",
                     "plant", "facility", "raw material", "employee"]),
]

_SUB_CATEGORY_KEYWORDS: List[Tuple[str, List[str]]] = [
    ("logistics",              ["logistics", "transport", "fleet", "shipment"]),
    ("compliance",             ["compliance", "regulation", "approval", "license"]),
    ("customer concentration", ["top 10 customers", "customer concentration", "significant customers"]),
    ("debt",                   ["borrow", "debt", "loan", "interest"]),
    ("capacity",               ["capacity", "utilisation", "utilization", "plant", "facility"]),
    ("competition",            ["competition", "competitor"]),
    ("supply chain",           ["supply", "raw material", "vendor", "supplier"]),
]

_EXTERNAL_CATEGORIES = {"market", "regulatory"}
_EXTERNAL_RE = re.compile(
    r"\b(government|economy|economic|market|geopolitical|law|regulation|sebi|rbi)\b"
)
_HYBRID_RE = re.compile(r"\b(customer|supplier|third-party|vendor|counterparty)\b")

_AI_PROMPT = (
    "Classify this IPO RHP/DRHP risk factor. "
    "Return ONLY a JSON object with keys: domain, category, sub_category, risk_nature. "
    "Allowed category values: operational, financial, regulatory, market, tech. "
    "Allowed risk_nature values: internal, external, hybrid. "
    "Do NOT include any explanation or markdown fences.\n\n"
    "Title: {title}\nDescription: {description}"
)


# ── Public API ────────────────────────────────────────────────────────────────

def infer_domain(text: str) -> Optional[str]:
    for domain, kws in _DOMAIN_KEYWORDS:
        if any(kw in text for kw in kws):
            return domain
    return None


def split_risk_title_description(risk_text: str) -> Tuple[str, str, int]:
    """Return (title, description, order_index) from a raw risk block."""
    m = re.match(r"^\s*(\d{1,3})\.\s*(.*)$", risk_text, re.DOTALL)
    order_index = int(m.group(1)) if m else 0
    body = m.group(2).strip() if m else risk_text.strip()

    brk = re.search(r"(?<=[.!?])\s+", body)
    if brk:
        return body[: brk.start()].strip(), body[brk.end() :].strip(), order_index
    return body[:300].strip(), body, order_index


def classify_risk_rule_based(title: str, description: str) -> dict:
    text = f"{title} {description}".lower()

    category = "operational"
    for candidate, kws in _CATEGORY_KEYWORDS:
        if any(kw in text for kw in kws):
            category = candidate
            break

    sub_category: Optional[str] = None
    for candidate, kws in _SUB_CATEGORY_KEYWORDS:
        if any(kw in text for kw in kws):
            sub_category = candidate
            break

    risk_nature = (
        "external"
        if category in _EXTERNAL_CATEGORIES and _EXTERNAL_RE.search(text)
        else "internal"
    )
    if _HYBRID_RE.search(text):
        risk_nature = "hybrid"

    return {
        "domain": infer_domain(text),
        "category": category,
        "sub_category": sub_category,
        "risk_nature": risk_nature,
    }


def classify_risk_with_ai(title: str, description: str) -> Optional[dict]:
    """
    Classify via local Llama 3 (Ollama).  Returns None on any failure so the
    caller can fall back to rule-based classification.
    Set RISK_AI_MODEL env var to override the model (default: llama3).
    """
    try:
        from langchain_ollama import ChatOllama  # type: ignore[import]
    except ImportError:
        logger.warning("langchain-ollama not installed. Run: pip install langchain-ollama")
        return None

    prompt = _AI_PROMPT.format(title=title, description=description[:2500])
    try:
        model = ChatOllama(model=os.environ.get("RISK_AI_MODEL", "llama3"), temperature=0)
        raw = _strip_fences(model.invoke(prompt).content.strip())
        return json.loads(raw)
    except Exception as exc:
        logger.warning(f"AI classification failed ({exc}); using rule-based fallback.")
        return None


def build_risk_records(
    risks: List[str],
    context: dict,
    use_ai: bool = False,
) -> List[dict]:
    """Convert raw risk strings into structured dicts ready for DB insertion."""
    records = []
    for idx, risk in enumerate(risks, start=1):
        title, description, order_index = split_risk_title_description(risk)

        classification: Optional[dict] = None
        method = "rules"
        if use_ai:
            classification = classify_risk_with_ai(title, description)
            if classification is not None:
                method = "langchain"
        if classification is None:
            classification = classify_risk_rule_based(title, description)

        records.append({
            "domain":                 context.get("domain") or classification.get("domain") or "general",
            "category":               classification.get("category"),
            "sub_category":           classification.get("sub_category"),
            "risk_nature":            classification.get("risk_nature"),
            "title":                  title,
            "description":            description,
            "order_index":            order_index or idx,
            "section_name":           None,
            "page_start":             None,
            "page_end":               None,
            "classification_method":  method,
            "classification_confidence": None,
            "content_hash":           hashlib.sha256(risk.encode("utf-8")).hexdigest(),
        })
    return records


# ── Private ───────────────────────────────────────────────────────────────────

def _strip_fences(text: str) -> str:
    text = re.sub(r"^```[a-z]*\n?", "", text)
    text = re.sub(r"\n?```$", "", text)
    return text.strip()
