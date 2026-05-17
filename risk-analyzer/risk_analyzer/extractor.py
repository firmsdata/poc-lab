"""
extractor.py
------------
Core PDF extraction logic.

RiskAnalyzer
    .run()                  -> List[str]   full pipeline
    .infer_document_context() -> dict      company / doc metadata
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import List, Optional, Tuple

import fitz  # PyMuPDF

from .classifier import infer_domain

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Stop-section keywords used to find the end of the Risk Factors section
# ---------------------------------------------------------------------------
_STOP_KEYWORDS = [
    "BUSINESS",
    "INDUSTRY OVERVIEW",
    "USE OF PROCEEDS",
    "MANAGEMENT'S DISCUSSION",
]

# ---------------------------------------------------------------------------
# LLM prompt templates
# ---------------------------------------------------------------------------
_TOC_SYSTEM_PROMPT = (
    "You are an expert at reading Indian IPO prospectus (DRHP/RHP) table of contents.\n"
    "Given the raw text extracted from the first pages of an IPO prospectus, "
    "identify the printed page numbers for the start and end of the "
    '"Risk Factors" section (it may also appear as "Key Risks").\n\n'
    "Rules:\n"
    '- Return ONLY a JSON object with keys "start_page" and "end_page".\n'
    "- Both values must be integers (the printed/logical page number, NOT the PDF index).\n"
    '- "end_page" is the last page of the Risk Factors section '
    "(i.e., one page before the next major section begins).\n"
    "- If you cannot determine a value, use null.\n"
    "- Do NOT include any explanation, markdown fences, or extra keys.\n\n"
    "TOC / Front-matter text:\n{toc_text}"
)


class RiskAnalyzer:
    """End-to-end risk-factor extractor for a single DRHP/RHP PDF."""

    def __init__(self, pdf_path: str, use_ai: bool = False) -> None:
        self.pdf_path = pdf_path
        self.doc = fitz.open(pdf_path)
        self.use_ai = use_ai

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def run(self) -> List[str]:
        """Run the full extraction pipeline and return a list of risk texts."""
        logger.info("Starting Risk Factors Extraction...")

        # ── 1. TOC bounds ────────────────────────────────────────────────
        toc_page, next_toc_page = self._resolve_toc_bounds()

        if toc_page is None:
            logger.error("Could not find 'Risk Factors'. Defaulting to page 1.")
            toc_page = 1
        else:
            logger.info(f"Resolved TOC start page: {toc_page}")
            if next_toc_page:
                logger.info(f"Resolved TOC next section page: {next_toc_page}")

        # ── 2. Physical page index (offset correction) ───────────────────
        actual_page_idx = self.locate_actual_page(toc_page)
        logger.info(f"Actual start page index (0-based): {actual_page_idx}")

        offset = actual_page_idx - toc_page

        if next_toc_page is not None:
            end_page_idx = next_toc_page + offset - 1
            end_page_idx = min(max(end_page_idx, actual_page_idx), len(self.doc) - 1)
            logger.info(f"End page index (from TOC): {end_page_idx}")
        else:
            end_page_idx = self.find_section_end(actual_page_idx)
            logger.info(f"End page index (from section headers): {end_page_idx}")

        # ── 3. Extract & parse ───────────────────────────────────────────
        blocks = self._get_text_blocks(actual_page_idx, end_page_idx)
        if not blocks:
            logger.warning("No text blocks extracted.")
            return []

        pattern = self.detect_pattern(blocks)
        logger.info(f"Detected pattern: {pattern}")

        risks_raw = self.apply_pattern(blocks, pattern)
        logger.info(f"Raw risk blocks: {len(risks_raw)}")

        risks_final = self.post_process(risks_raw)
        logger.info(f"Final risk items after post-processing: {len(risks_final)}")

        return risks_final

    def infer_document_context(self) -> dict:
        """Return company name, document type, IPO year, and domain."""
        pages_text = "\n".join(
            self.doc[i].get_text("text") for i in range(min(5, len(self.doc)))
        )
        return {
            "company_name": self._infer_company_name(pages_text),
            "document_type": self._infer_document_type(pages_text),
            "ipo_year": self._infer_ipo_year(pages_text),
            "domain": infer_domain(pages_text.lower()),
        }

    # ------------------------------------------------------------------
    # TOC bounds resolution
    # ------------------------------------------------------------------

    def _resolve_toc_bounds(self) -> Tuple[Optional[int], Optional[int]]:
        """Try AI first (if enabled), fall back to regex."""
        if self.use_ai:
            logger.info("Using AI to extract TOC bounds...")
            start, end = self.ai_extract_toc_bounds()
            if start is not None:
                return start, end

        return self.extract_toc_bounds()

    def extract_toc_bounds(self) -> Tuple[Optional[int], Optional[int]]:
        """
        Regex-based TOC parsing (multi-pattern).
        Returns (start_page, next_section_page) as printed page numbers.
        """
        toc_lines: List[str] = []
        for page_num in range(min(15, len(self.doc))):
            for line in self.doc[page_num].get_text("text").split("\n"):
                line = line.strip()
                if line:
                    toc_lines.append(line)

        for i, line in enumerate(toc_lines):
            match = re.search(
                r"(?i)(?:^|\b)(risk\s*factors|key\s*risks)\b.*?(?:\.{2,}|\s+)\s*(\d+)$",
                line,
            )
            if not match:
                match = re.search(
                    r"(?i)(?:^|\b)(risk\s*factors|key\s*risks)\b.*?\b(\d+)$", line
                )

            if match:
                try:
                    start_page = int(match.group(2))
                except ValueError:
                    continue

                # Look ahead for the next entry's page number
                for j in range(i + 1, len(toc_lines)):
                    next_match = re.search(
                        r"(?:\.{2,}|\s+)\s*(\d+)$", toc_lines[j]
                    ) or re.search(r"\b(\d+)$", toc_lines[j])

                    if next_match:
                        try:
                            num = int(next_match.group(1))
                            if start_page < num < start_page + 300:
                                return start_page, num
                        except ValueError:
                            pass

                return start_page, None

        logger.warning("TOC regex failed. Falling back to heading search.")
        return self._fallback_heading_search(), None

    def ai_extract_toc_bounds(self) -> Tuple[Optional[int], Optional[int]]:
        """
        AI-powered TOC parsing via a local Llama 3 model (Ollama).

        Requires Ollama running at http://localhost:11434.
        Set RISK_AI_MODEL env var to override the model (default: llama3).
        """
        try:
            from langchain_ollama import ChatOllama  # type: ignore[import]
        except ImportError:
            logger.warning(
                "langchain-ollama not installed; skipping AI TOC extraction. "
                "Run: pip install langchain-ollama"
            )
            return None, None

        toc_text = self._collect_front_matter_text(pages=20, max_chars=8000)
        prompt = _TOC_SYSTEM_PROMPT.format(toc_text=toc_text)

        try:
            model = ChatOllama(
                model=os.environ.get("RISK_AI_MODEL", "llama3"),
                temperature=0,
            )
            raw = model.invoke(prompt).content.strip()
            raw = _strip_markdown_fences(raw)
            data = json.loads(raw)
            start_page = int(data["start_page"]) if data.get("start_page") is not None else None
            end_page = int(data["end_page"]) if data.get("end_page") is not None else None
            logger.info(f"AI TOC → start_page={start_page}, end_page={end_page}")
            return start_page, end_page
        except Exception as exc:
            logger.warning(f"AI TOC extraction failed ({exc}); falling back to regex.")
            return None, None

    # ------------------------------------------------------------------
    # Page location helpers
    # ------------------------------------------------------------------

    def locate_actual_page(self, toc_page: int) -> int:
        """
        Find the physical PDF page index that corresponds to the printed page
        number from the TOC, scanning a ±10 page window for the Risk Factors
        heading or tell-tale body text.
        """
        start_idx = max(0, toc_page - 10)
        end_idx = min(len(self.doc), toc_page + 10)
        fallback_idx: Optional[int] = None

        for idx in range(start_idx, end_idx):
            text = self.doc[idx].get_text("text")
            lines = [l.strip() for l in text.split("\n") if l.strip()]

            if any(self._is_risk_heading(line) for line in lines):
                return idx

            if fallback_idx is None and re.search(
                r"(?i)(may adversely|could materially|adverse effect)", text
            ):
                fallback_idx = idx

        if fallback_idx is not None:
            return fallback_idx

        logger.warning("Could not validate actual page; using TOC page number as index.")
        return min(toc_page, len(self.doc) - 1)

    def find_section_end(self, start_page_idx: int) -> int:
        """
        Scan forward from start_page_idx looking for a capitalized stop-section
        heading to determine where the Risk Factors section ends.
        """
        for idx in range(start_page_idx, len(self.doc)):
            lines = [
                l.strip()
                for l in self.doc[idx].get_text("text").split("\n")
                if l.strip()
            ]
            for line in lines:
                if 5 <= len(line) <= 60 and line.isupper():
                    if any(kw in line for kw in _STOP_KEYWORDS):
                        return idx

        return len(self.doc) - 1

    # ------------------------------------------------------------------
    # Block extraction
    # ------------------------------------------------------------------

    def _get_text_blocks(self, start_page: int, end_page: int) -> List[str]:
        blocks_out: List[str] = []
        for idx in range(start_page, end_page + 1):
            items = []
            for b in self.doc[idx].get_text("blocks", sort=True):
                if b[6] == 0:  # text block
                    text = b[4].strip()
                    if text:
                        items.append((b[1], text))  # (y0, text)
            items.sort(key=lambda x: x[0])
            blocks_out.extend(text for _, text in items)
        return blocks_out

    # ------------------------------------------------------------------
    # Pattern detection & application
    # ------------------------------------------------------------------

    def detect_pattern(self, blocks: List[str]) -> str:
        """
        Detect the dominant risk-item formatting pattern:
        'numbered' | 'bullet' | 'heading_based'
        """
        blocks = self._trim_before_first_numbered_risk(blocks)
        sample = blocks[:50]

        numbered_count = sum(
            1 for b in blocks[:100] if re.match(r"^\s*\d{1,3}\.\s+", b)
        )
        if numbered_count >= 2:
            return "numbered"

        counts = {"numbered": 0, "bullet": 0, "heading_based": 0}
        for block in sample:
            lines = block.split("\n")
            first = lines[0].strip()
            if re.match(r"^\d+\.", first):
                counts["numbered"] += 1
            elif re.match(r"^[•\-\*]", first):
                counts["bullet"] += 1
            elif len(first) < 100 and first.istitle() and len(lines) > 1:
                counts["heading_based"] += 1

        total = sum(counts.values())
        if total == 0:
            return "heading_based"

        dominant = max(counts, key=counts.get)  # type: ignore[arg-type]
        return dominant if counts[dominant] / total > 0.6 else "heading_based"

    def apply_pattern(self, blocks: List[str], pattern: str) -> List[str]:
        """Split blocks into individual risk items according to the detected pattern."""
        if pattern == "numbered":
            blocks = self._trim_before_first_numbered_risk(blocks)

        risks: List[str] = []
        current: List[str] = []
        expected_number = 1

        def risk_number(block: str) -> Optional[int]:
            first = block.split("\n")[0].strip()
            if pattern == "numbered":
                m = re.match(r"^(\d{1,3})\.\s+", first)
                return int(m.group(1)) if m else None
            if pattern == "bullet":
                return 1 if re.match(r"^[•\-\*]", first) else None
            # heading_based
            is_heading = (
                len(first) < 100
                and (first.istitle() or first.isupper())
                and not first.endswith(".")
            )
            return 1 if is_heading else None

        for block in blocks:
            number = risk_number(block)
            if pattern == "numbered" and number is not None:
                is_new = number == expected_number or (
                    current and expected_number < number <= expected_number + 2
                )
            else:
                is_new = number is not None

            if is_new:
                if current:
                    risks.append("\n".join(current))
                if pattern == "numbered" and number is not None:
                    expected_number = number + 1
                current = [block]
            else:
                current.append(block)

        if current:
            risks.append("\n".join(current))

        return risks

    # ------------------------------------------------------------------
    # Post-processing
    # ------------------------------------------------------------------

    def post_process(self, risks: List[str]) -> List[str]:
        """Clean up raw risk blocks: remove page numbers, merge short chunks."""
        cleaned: List[str] = []
        pending = ""

        for risk in risks:
            # Strip standalone page numbers
            lines = [l for l in risk.split("\n") if not re.match(r"^\s*\d+\s*$", l)]
            risk = "\n".join(lines).strip()
            if not risk:
                continue

            is_numbered = bool(re.match(r"^\d{1,3}\.\s+", risk))
            word_count = len(risk.split())

            if is_numbered:
                if pending:
                    risk = pending + "\n" + risk
                    pending = ""
                cleaned.append(re.sub(r"\s+", " ", risk))
                continue

            if word_count < 50:
                pending = (pending + "\n" + risk).strip() if pending else risk
            else:
                if pending:
                    risk = pending + "\n" + risk
                    pending = ""
                cleaned.append(re.sub(r"\s+", " ", risk))

        if pending:
            if cleaned:
                cleaned[-1] += "\n" + pending
            else:
                cleaned.append(pending)

        return cleaned

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _collect_front_matter_text(self, pages: int = 20, max_chars: int = 8000) -> str:
        parts = []
        for i in range(min(pages, len(self.doc))):
            text = self.doc[i].get_text("text").strip()
            if text:
                parts.append(f"--- Page {i + 1} ---\n{text}")
        return "\n".join(parts)[:max_chars]

    def _fallback_heading_search(self) -> Optional[int]:
        for page_num in range(len(self.doc)):
            for line in self.doc[page_num].get_text("text").split("\n"):
                if re.fullmatch(r"(?i)\s*risk\s*factors\s*", line.strip()):
                    return page_num + 1
        return None

    @staticmethod
    def _is_risk_heading(line: str) -> bool:
        normalized = re.sub(r"\s+", " ", line.strip()).upper()
        return normalized in {"RISK FACTORS", "KEY RISKS"}

    @staticmethod
    def _trim_before_first_numbered_risk(blocks: List[str]) -> List[str]:
        for idx, block in enumerate(blocks):
            if re.match(r"^\s*\d{1,3}\.\s+", block):
                return blocks[idx:]
        return blocks

    # Document-context helpers ----------------------------------------

    def _infer_company_name(self, text: str) -> Optional[str]:
        for line in text.splitlines():
            line = re.sub(r"\s+", " ", line).strip()
            if not line or len(line) > 120:
                continue
            if re.search(r"(?i)\b(limited|private limited|ltd\.?)\b", line):
                if not re.search(r"(?i)(registrar|manager|book|legal|auditor|banker)", line):
                    return line
        return None

    @staticmethod
    def _infer_document_type(text: str) -> Optional[str]:
        if re.search(r"(?i)\bdraft\s+red\s+herring\s+prospectus\b|\bDRHP\b", text):
            return "DRHP"
        if re.search(r"(?i)\bred\s+herring\s+prospectus\b|\bRHP\b", text):
            return "RHP"
        return None

    @staticmethod
    def _infer_ipo_year(text: str) -> Optional[int]:
        years = [int(y) for y in re.findall(r"\b20(?:1[8-9]|2[0-9])\b", text)]
        return max(years) if years else None


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _strip_markdown_fences(text: str) -> str:
    text = re.sub(r"^```[a-z]*\n?", "", text)
    text = re.sub(r"\n?```$", "", text)
    return text.strip()
