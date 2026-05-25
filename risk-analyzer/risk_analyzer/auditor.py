import json
import logging
import os
import urllib.request
import urllib.error
from pathlib import Path

from .knowledge_base import get_rulebook_prompt_context

logger = logging.getLogger(__name__)

OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
PROMPT_LOG_FILE = "prompt_debug.log"


def _log_prompt(prompt_name: str, prompt: str) -> None:
    """
    Persist full prompts only when explicitly enabled.

    Risk prompts can contain uploaded DRHP/RHP content, so this is opt-in:
    set RISK_LOG_PROMPTS=1. Override the file with RISK_PROMPT_LOG_FILE.
    """
    if os.environ.get("RISK_LOG_PROMPTS", "").lower() not in {"1", "true", "yes"}:
        return

    log_path = Path(os.environ.get("RISK_PROMPT_LOG_FILE", PROMPT_LOG_FILE))
    separator = "\n" + "=" * 88 + "\n"
    payload = f"{separator}PROMPT: {prompt_name}\n{separator}{prompt}\n"
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as fh:
            fh.write(payload)
        logger.info("Logged %s prompt to %s", prompt_name, log_path)
    except Exception as exc:
        logger.warning("Failed to log %s prompt: %s", prompt_name, exc)

AUDIT_PROMPT_TEMPLATE = """You are a top-tier Regulatory Compliance Analyst and Risk Auditor specializing in IPO filings (DRHP/RHP) under strict regulatory frameworks.
Your task is to analyze the following extracted risk factors for a company and generate a "Structural Assessment" report.

You MUST output your response strictly as a JSON object matching this schema exactly. DO NOT output any markdown blocks, just raw JSON.

{
  "structural_observations": [
    "string: high-level observation about systemic patterns in the risk disclosure (e.g., 'Overuse of generic, non-specific risk language')"
  ],
  "observations": [
    {
      "title": "string: a concise title for a specific high concern issue (e.g., 'Vague Target Market Definition')",
      "severity": "string: e.g., 'HIGH CONCERN', 'MEDIUM CONCERN'",
      "observation": "string: what the issuer failed to do or did poorly",
      "regulatory_concern": "string: why this violates or falls short of disclosure standards",
      "expected_disclosure_standard": "string: what should have been disclosed instead",
      "suggested_improvement": "string: actionable advice to fix the disclosure",
      "illustrative_contrast": {
        "weak_disclosure": "string: example of the weak disclosure from the text or a generalization of it",
        "improved_disclosure": "string: how it should be written"
      }
    }
  ],
  "intelligence_matrix": {
    "section_compliance_landscape": {
      "attributes": ["Disclosure Quality", "Dependency Mitigation", "Market Opportunity", "Risk Transfer/Insurance", "Governance/Oversight"],
      "domains": ["Risk", "Business", "Financial", "Legal", "ESG/Tech"],
      "scores": [
        [1, 2, 3, 4, 1],
        [2, 3, 1, 2, 3]
        // Note: 5 rows (one for each attribute), 5 columns (one for each domain). 
        // 1=Missing, 2=Needs Improvement, 3=High Concern, 4=Not Applicable
      ]
    },
    "observed_issue_patterns": [
      {
        "pattern": "string: e.g. 'Disclosure Gaps'",
        "level": 3
      }
    ],
    "pattern_clusters": [
      "string: e.g. 'UNSUPPORTED CLAIMS'", "VAGUE LANGUAGE"
    ]
  },
  "regulatory_interpretation": {
    "current_regulatory_focus": "string: paragraph about recent regulatory focus relevant to these risks",
    "common_filing_pitfalls": [
      "string: e.g. 'Inadequate segmentation of historical financial performance by geography and business line.'"
    ],
    "interpretation_notes": "string: notes on regulatory expectations",
    "reference_standards": [
      "SEBI ICDR REGULATIONS 2018",
      "GENERAL INFORMATION DOCUMENT"
    ]
  }
}

Analyze the following risks and generate the assessment:
{risks_text}

DRHP RISK-FACTOR RULEBOOK:
{rulebook_context}
"""

def generate_audit_report(risks: list[dict], use_ai: bool = True) -> dict:
    if not risks:
        logger.warning("No risks provided to auditor.")
        return {}
        
    if not use_ai:
        logger.warning("AI is disabled; returning empty audit report.")
        return {}

    # Format risks for prompt
    risk_texts = []
    for r in risks:
        title = r.get("title", "")
        desc = r.get("description", "")
        domain = r.get("domain", "")
        category = r.get("category", "")
        if title or desc:
            risk_texts.append(f"Domain: {domain} | Category: {category}\nTitle: {title}\nDescription: {desc[:500]}...\n---")

    risks_text = "\n".join(risk_texts)
    # Truncate if too long (rough limit to fit in context window)
    if len(risks_text) > 30000:
        risks_text = risks_text[:30000] + "\n...[TRUNCATED]"

    prompt = (
        AUDIT_PROMPT_TEMPLATE
        .replace("{risks_text}", risks_text)
        .replace("{rulebook_context}", get_rulebook_prompt_context())
    )
    _log_prompt("structural_audit", prompt)

    model = os.environ.get("RISK_AI_MODEL", "llama3")

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a specialized JSON-outputting Regulatory Analyst API."},
            {"role": "user", "content": prompt}
        ],
        "format": "json",
        "stream": False,
        "options": {
            "temperature": 0.2
        }
    }

    try:
        req = urllib.request.Request(
            OLLAMA_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data.get("message", {}).get("content", "")
            if not content:
                logger.error("Empty content from AI audit.")
                return {}
            
            try:
                parsed = json.loads(content)
                return parsed
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON from AI audit: {e}\nContent: {content[:200]}...")
                return {}
    except Exception as e:
        logger.error(f"AI audit generation failed: {e}")
        return {}


COMPARATIVE_PROMPT_TEMPLATE = """You are a senior Regulatory Compliance Analyst specializing in IPO filings under SEBI's ICDR framework.

You are given:
1. UPLOADED_RISKS: Risk factors extracted from a new DRHP/RHP PDF uploaded by a user.
2. BASELINE_RISKS: Industry-standard risk factors from other filings in the same domain, sourced from a verified database.

Your task is to perform a comparative structural assessment:
- Identify critical risk topics that are MISSING from the uploaded document but present in the baseline.
- Identify risk factors in the upload that are WEAK, vague, or incomplete compared to the baseline standard.
- Highlight what the uploaded document did WELL relative to industry peers.

Output ONLY raw JSON (no markdown code blocks) matching this schema exactly:

{
  "comparison_summary": "string: one-paragraph executive summary of how the uploaded document compares to the domain baseline",
  "structural_observations": [
    "string: high-level systemic pattern observation"
  ],
  "observations": [
    {
      "title": "string: specific issue title",
      "severity": "string: HIGH CONCERN | MEDIUM CONCERN | LOW CONCERN",
      "observation": "string: what was found or missing",
      "regulatory_concern": "string: why this matters under SEBI ICDR",
      "expected_disclosure_standard": "string: what should be disclosed based on industry baseline",
      "suggested_improvement": "string: how to fix it",
      "illustrative_contrast": {
        "weak_disclosure": "string: example of the weak/missing disclosure from the uploaded doc",
        "improved_disclosure": "string: how it should be written based on industry standard"
      }
    }
  ],
  "missing_risk_topics": [
    "string: risk topic present in baseline but entirely absent in uploaded doc"
  ],
  "strong_disclosures": [
    "string: risk area where the uploaded document performs well vs baseline"
  ],
  "intelligence_matrix": {
    "section_compliance_landscape": {
      "attributes": ["Disclosure Quality", "Dependency Mitigation", "Market Opportunity", "Risk Transfer/Insurance", "Governance/Oversight"],
      "domains": ["Risk", "Business", "Financial", "Legal", "ESG/Tech"],
      "scores": [[3,2,1,2,3],[2,3,2,1,2],[1,2,3,2,1],[2,1,2,3,2],[3,2,1,2,3]]
    },
    "observed_issue_patterns": [
      {"pattern": "string: pattern name", "level": 1}
    ],
    "pattern_clusters": ["string: cluster tag"]
  },
  "regulatory_interpretation": {
    "current_regulatory_focus": "string: relevant regulatory context",
    "common_filing_pitfalls": ["string: pitfall"],
    "interpretation_notes": "string: notes",
    "reference_standards": ["SEBI ICDR REGULATIONS 2018", "GENERAL INFORMATION DOCUMENT"]
  }
}

UPLOADED_RISKS (new document being reviewed):
{uploaded_risks}

BASELINE_RISKS (industry standard from database — for reference only, do not list all of them):
{baseline_risks}

DRHP RISK-FACTOR RULEBOOK:
{rulebook_context}
"""


def generate_comparative_audit(
    uploaded_risks: list[dict],
    baseline_risks: list[dict],
    use_ai: bool = True,
) -> dict:
    """
    Compare uploaded document's risks against domain baseline and return a
    structured comparative assessment JSON.
    """
    if not use_ai:
        logger.warning("AI disabled; returning empty comparative audit.")
        return {}

    if not uploaded_risks:
        logger.warning("No uploaded risks provided to comparative auditor.")
        return {}

    # Format uploaded risks
    def format_risks(risks: list[dict], max_chars: int = 15000) -> str:
        lines = []
        for r in risks:
            title = r.get("title", "")
            desc = r.get("description", "")
            domain = r.get("domain", "")
            cat = r.get("category", "")
            if title or desc:
                lines.append(f"Domain: {domain} | Category: {cat}\nTitle: {title}\nDescription: {desc[:400]}\n---")
        text = "\n".join(lines)
        return text[:max_chars] + "\n...[TRUNCATED]" if len(text) > max_chars else text

    uploaded_text = format_risks(uploaded_risks, max_chars=12000)
    baseline_text = format_risks(baseline_risks[:80], max_chars=12000)  # Cap baseline to 80 risks

    prompt = (
        COMPARATIVE_PROMPT_TEMPLATE
        .replace("{uploaded_risks}", uploaded_text)
        .replace("{baseline_risks}", baseline_text)
        .replace("{rulebook_context}", get_rulebook_prompt_context())
    )
    _log_prompt("comparative_audit", prompt)

    model = os.environ.get("RISK_AI_MODEL", "llama3")
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a specialized JSON-outputting Regulatory Analyst API. Output only raw JSON."},
            {"role": "user", "content": prompt},
        ],
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.2},
    }

    try:
        req = urllib.request.Request(
            OLLAMA_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=600) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data.get("message", {}).get("content", "")
            if not content:
                logger.error("Empty content from AI comparative audit.")
                return {}
            try:
                return json.loads(content)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON from comparative audit: {e}\nContent: {content[:300]}...")
                return {}
    except Exception as e:
        logger.error(f"Comparative audit generation failed: {e}")
        return {}


PER_RISK_PROMPT = """You are a SEBI IPO compliance expert. Review the following list of risk factors extracted from a DRHP/RHP filing and evaluate EACH ONE.

You are also provided with a set of BASELINE RISKS from other filings in the same domain. Use these baselines to judge whether the extracted risks are adequate, or if they are missing critical details that the industry standard typically includes.

For every risk, output a JSON object with:
- "index": the 0-based index of the risk (same order as input)
- "quality": one of "ADEQUATE", "NEEDS IMPROVEMENT", "HIGH CONCERN"
- "issue": what is wrong or weak compared to baseline standards (null if ADEQUATE)
- "improvement": one specific actionable fix based on baseline disclosures (null if ADEQUATE)

Return ONLY a raw JSON array of these objects, one per risk. No markdown.

BASELINE RISKS (For Reference):
{baseline_risks_text}

RISKS TO EVALUATE:
{risks_json}

DRHP RISK-FACTOR RULEBOOK:
{rulebook_context}
"""


def generate_per_risk_feedback(risks: list[dict], baseline_risks: list[dict] = None, use_ai: bool = True) -> list[dict]:
    """
    For each extracted risk, call the AI once (batch) and return per-risk feedback.
    Returns list aligned with input risks: each item has quality/issue/improvement.
    """
    if not risks:
        return []

    # Build a compact representation for the prompt
    compact = [
        {"index": i, "title": r.get("title", ""), "description": (r.get("description") or "")[:600]}
        for i, r in enumerate(risks)
    ]
    risks_json = json.dumps(compact, ensure_ascii=False)
    
    baseline_text = "No baseline available."
    if baseline_risks:
        lines = []
        for r in baseline_risks[:15]: # Cap baseline risks strictly to save context and speed up generation
            title = r.get("title", "")
            desc = r.get("description", "")
            if title or desc:
                lines.append(f"Title: {title}\nDescription: {desc[:200]}\n---")
        baseline_text = "\n".join(lines)
        if len(baseline_text) > 4000:
            baseline_text = baseline_text[:4000] + "...[TRUNCATED]"

    if len(risks_json) > 20000:
        risks_json = risks_json[:20000] + "...[TRUNCATED]"

    prompt = (
        PER_RISK_PROMPT
        .replace("{risks_json}", risks_json)
        .replace("{baseline_risks_text}", baseline_text)
        .replace("{rulebook_context}", get_rulebook_prompt_context())
    )
    _log_prompt("per_risk_batch_feedback", prompt)

    model = os.environ.get("RISK_AI_MODEL", "llama3")
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a specialized JSON-outputting Regulatory Analyst API. Output only a raw JSON array."},
            {"role": "user", "content": prompt},
        ],
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.1},
    }

    default_fb = [{"index": i, "quality": "ADEQUATE", "issue": None, "improvement": None} for i in range(len(risks))]

    if not use_ai:
        return default_fb

    try:
        req = urllib.request.Request(
            OLLAMA_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=600) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data.get("message", {}).get("content", "")
            if not content:
                logger.error("Empty content from per-risk AI feedback.")
                return default_fb
            # The model sometimes wraps the array in an object key
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                # Try to unwrap {"risks": [...]} or {"feedback": [...]}
                for key in ("risks", "feedback", "items", "results"):
                    if isinstance(parsed.get(key), list):
                        parsed = parsed[key]
                        break
                else:
                    logger.error(f"Unexpected per-risk response structure: {list(parsed.keys())}")
                    return default_fb
            if not isinstance(parsed, list):
                return default_fb
            # Merge back by index
            feedback_map = {item["index"]: item for item in parsed if isinstance(item, dict) and "index" in item}
            return [feedback_map.get(i, default_fb[i]) for i in range(len(risks))]
    except Exception as e:
        logger.error(f"Per-risk feedback generation failed: {e}")
        return default_fb


SINGLE_RISK_PROMPT = """You are a SEBI IPO compliance expert. Review the following risk factor extracted from a DRHP/RHP filing and evaluate it.

You are also provided with a set of BASELINE RISKS from other filings in the same domain. Use these baselines to judge whether the extracted risk is adequate, or if it is missing critical details that the industry standard typically includes.

Output ONLY a raw JSON object with:
- "quality": one of "ADEQUATE", "NEEDS IMPROVEMENT", "HIGH CONCERN"
- "issue": what is wrong or weak compared to baseline standards (null if ADEQUATE)
- "improvement": one specific actionable fix based on baseline disclosures (null if ADEQUATE)

No markdown, just raw JSON.

BASELINE RISKS (For Reference):
{baseline_risks_text}

RISK TO EVALUATE:
{risk_json}

DRHP RISK-FACTOR RULEBOOK:
{rulebook_context}
"""

def generate_single_risk_feedback(risk: dict, baseline_risks: list[dict] = None, use_ai: bool = True) -> dict:
    default_fb = {"quality": "ADEQUATE", "issue": None, "improvement": None}
    if not use_ai or not risk:
        return default_fb

    baseline_text = "No baseline available."
    if baseline_risks:
        lines = []
        for r in baseline_risks[:10]: # Keep it short for single calls
            title = r.get("title", "")
            desc = r.get("description", "")
            if title or desc:
                lines.append(f"Title: {title}\nDescription: {desc[:150]}\n---")
        baseline_text = "\n".join(lines)
        if len(baseline_text) > 3000:
            baseline_text = baseline_text[:3000] + "...[TRUNCATED]"

    compact = {"title": risk.get("title", ""), "description": (risk.get("description") or "")[:800]}
    risk_json = json.dumps(compact, ensure_ascii=False)

    prompt = (
        SINGLE_RISK_PROMPT
        .replace("{risk_json}", risk_json)
        .replace("{baseline_risks_text}", baseline_text)
        .replace("{rulebook_context}", get_rulebook_prompt_context())
    )
    _log_prompt("single_risk_feedback", prompt)

    model = os.environ.get("RISK_AI_MODEL", "llama3")
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a specialized JSON-outputting Regulatory Analyst API. Output only a raw JSON object."},
            {"role": "user", "content": prompt},
        ],
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.1},
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
            if not content:
                return default_fb
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                # Basic validation
                return {
                    "quality": parsed.get("quality", "ADEQUATE"),
                    "issue": parsed.get("issue"),
                    "improvement": parsed.get("improvement")
                }
            return default_fb
    except Exception as e:
        logger.error(f"Single risk feedback generation failed: {e}")
        return default_fb
