"""
layout_extractor.py
-------------------
Advanced PDF extraction logic using visual coordinate-based layout sorting
and header/footer boilerplate stripping.

LayoutRiskExtractor
    .run()                  -> List[str]   full pipeline
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Dict, List, Optional, Tuple

import fitz  # PyMuPDF

from .classifier import infer_domain
from .document_backends import extract_docling_blocks, extract_unstructured_blocks
from .extractor import _STOP_KEYWORDS, _TOC_SYSTEM_PROMPT, _strip_markdown_fences

logger = logging.getLogger(__name__)


class LayoutRiskExtractor:
    """Advanced layout-aware risk-factor extractor for a single DRHP/RHP PDF."""

    # Boilerplate section headers — pages starting with these are skipped
    _BOILERPLATE_SECTION_HEADERS = {
        "FORWARD-LOOKING STATEMENTS",
        "FORWARD LOOKING STATEMENTS",
        "CERTAIN CONVENTIONS",
        "PRESENTATION OF FINANCIAL INFORMATION",
        "DEFINITIONS AND ABBREVIATIONS",
        "INDUSTRY AND MARKET DATA",
    }

    # Sub-section category separators — kept as metadata, not counted as risks
    _CATEGORY_SEPARATORS = re.compile(
        r"^(INTERNAL\s+RISKS?|EXTERNAL\s+RISKS?|GENERAL\s+RISKS?|RISKS?\s+RELATED\s+TO|"
        r"RISKS?\s+RELATING\s+TO|FINANCIAL\s+RISKS?|OPERATIONAL\s+RISKS?|LEGAL\s+RISKS?)$",
        re.IGNORECASE,
    )

    # Known boilerplate text patterns to drop from final risk list
    _BOILERPLATE_PATTERNS = re.compile(
        r"(?i)^(forward.looking statements|"
        r"this (draft )?red herring prospectus contains|"
        r"an investment in the equity shares|"
        r"this section should be read|"
        r"the risks and uncertainties described|"
        r"in making an investment decision|"
        r"this section contains forward.looking|"
        r"internal risks|external risks|general risks)"
    )

    def __init__(self, pdf_path: str, use_ai: bool = False) -> None:
        self.pdf_path = pdf_path
        self.doc = fitz.open(pdf_path)
        self.use_ai = use_ai
        self.parser_backend = os.environ.get("RISK_PARSER_BACKEND", "auto").lower()

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def run(self) -> List[str]:
        """Run the full extraction pipeline and return a list of risk texts."""
        logger.info("Starting Layout-Aware Risk Factors Extraction...")

        # ── 1. TOC bounds ────────────────────────────────────────────────
        toc_page, next_toc_page = self._resolve_toc_bounds()

        if toc_page is None:
            logger.error("Could not find 'Risk Factors'. Defaulting to page 1.")
            toc_page = 1
        else:
            logger.info(f"Layout Extractor Resolved TOC start page: {toc_page}")
            if next_toc_page:
                logger.info(f"Layout Extractor Resolved TOC next section page: {next_toc_page}")

        # ── 2. Physical page index (offset correction) ───────────────────
        actual_page_idx = self.locate_actual_page(toc_page)
        logger.info(f"Layout Extractor actual start page index (0-based): {actual_page_idx}")

        offset = actual_page_idx - toc_page

        if next_toc_page is not None:
            end_page_idx = next_toc_page + offset - 1
            end_page_idx = min(max(end_page_idx, actual_page_idx), len(self.doc) - 1)
            logger.info(f"Layout Extractor End page index (from TOC): {end_page_idx}")
        else:
            end_page_idx = self.find_section_end(actual_page_idx)
            logger.info(f"Layout Extractor End page index (from section headers): {end_page_idx}")

        # ── 3. Extract using Layout Coordinates ───────────────────────────
        blocks = self._get_layout_text_blocks(actual_page_idx, end_page_idx)
        if not blocks:
            logger.warning("No text blocks extracted.")
            return []

        pattern = self.detect_pattern(blocks)
        logger.info(f"Layout Extractor Detected pattern: {pattern}")

        risks_raw = self.apply_pattern(blocks, pattern)
        logger.info(f"Layout Extractor Raw risk blocks: {len(risks_raw)}")

        risks_final = self.post_process(risks_raw)
        logger.info(f"Layout Extractor Final risk items after post-processing: {len(risks_final)}")

        if pattern == "numbered":
            risks_final = self._recover_numbered_risks_from_plain_text(
                actual_page_idx,
                end_page_idx,
                risks_final,
            )

        risks_final = self._maybe_apply_parser_backend(
            actual_page_idx,
            end_page_idx,
            pattern,
            risks_final,
        )

        if self.use_ai:
            risks_final = self.ai_semantic_filter(risks_final)
            logger.info(f"Layout Extractor Final risk items after semantic filter: {len(risks_final)}")

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
    # Advanced Layout-Aware Text Block Extraction
    # ------------------------------------------------------------------

    def _get_layout_text_blocks(self, start_page: int, end_page: int) -> List[str]:
        """
        Extract text blocks using coordinate margins to strip out headers, footers,
        table cells, and boilerplate section pages.
        Returns blocks in visual reading order (top-down, left-to-right).
        """
        blocks_out: List[str] = []
        skip_page = False  # True while inside a boilerplate section

        for idx in range(start_page, end_page + 1):
            page = self.doc[idx]
            rect = page.rect
            height = rect.height

            header_margin = height * 0.08  # top 8%
            footer_margin = height * 0.92  # bottom 8%

            # Collect all text blocks on this page (with full coordinates)
            raw_items: List[Tuple] = []
            for b in page.get_text("blocks", sort=False):
                if b[6] != 0:  # skip image blocks
                    continue
                x0, y0, x1, y1, text = b[0], b[1], b[2], b[3], b[4].strip()
                if y0 < header_margin or y1 > footer_margin:
                    continue
                if text:
                    raw_items.append((x0, y0, x1, y1, text))

            # ── Boilerplate page detection ────────────────────────────────
            first_texts = [t for *_, t in raw_items[:3]]
            page_starts_boilerplate = any(
                t.upper().strip() in self._BOILERPLATE_SECTION_HEADERS
                for t in first_texts
            )
            if page_starts_boilerplate:
                skip_page = True

            # ── Real risk section start resets skip_page ──────────────────
            if skip_page:
                has_numbered = any(
                    re.match(r"^\s*1\.\s*$", t) or re.match(r"^1\.\s+\S", t)
                    for *_, t in raw_items
                )
                has_risk_section = any(
                    re.search(r"(?i)\bRISK\s+FACTORS\b", t)
                    and re.search(r"(?i)(SECTION|CHAPTER|PART)", t)
                    for *_, t in raw_items
                )
                if has_numbered or has_risk_section:
                    skip_page = False
                else:
                    continue  # skip entire boilerplate page

            # ── Table-cell detection: group blocks by y-row ────────────────
            # Blocks on the same y-row (within 6px) with 3+ siblings = table cells
            y_groups: Dict[int, List[Tuple]] = {}
            for item in raw_items:
                bucket = round(item[1] / 6) * 6  # y0 bucketed to 6px
                y_groups.setdefault(bucket, []).append(item)

            table_positions: set = set()
            for bucket, group in y_groups.items():
                if len(group) >= 3:
                    short_count = sum(1 for *_, t in group if len(t.split()) <= 8)
                    if short_count >= len(group) - 1:
                        for item in group:
                            table_positions.add((round(item[0]), round(item[1])))

            # Sort in reading order
            raw_items.sort(key=lambda b: (b[1], b[0]))

            # ── Filter table cells and category separators ─────────────────
            clean_items: List[Tuple] = []
            for x0, y0, x1, y1, text in raw_items:
                if (round(x0), round(y0)) in table_positions:
                    continue
                if self._CATEGORY_SEPARATORS.match(text.strip()):
                    continue
                clean_items.append((x0, y0, text))

            # ── Merge standalone number blocks ("1.", "2.", …) ────────────
            # Some DRHPs render "1." as its own block then put the risk text next
            merged_items: List[Tuple] = []
            i = 0
            while i < len(clean_items):
                x0, y0, text = clean_items[i]
                if re.match(r"^\d{1,3}\.$", text.strip()) and i + 1 < len(clean_items):
                    nx0, ny0, ntext = clean_items[i + 1]
                    merged_items.append((x0, y0, text.strip() + " " + ntext))
                    i += 2
                else:
                    merged_items.append((x0, y0, text))
                    i += 1

            blocks_out.extend(text for _, _, text in merged_items)

        return blocks_out

    def _get_plain_text_blocks(self, start_page: int, end_page: int) -> List[str]:
        """Extract bounded section text without layout filtering for recovery."""
        blocks: List[str] = []
        for idx in range(start_page, end_page + 1):
            text = self.doc[idx].get_text("text").strip()
            if text:
                blocks.append(text)
        return blocks

    def _numbered_risk_numbers(self, risks: List[str]) -> List[int]:
        numbers: List[int] = []
        for risk in risks:
            match = re.match(r"^\s*(\d{1,3})\.\s+", risk)
            if match:
                numbers.append(int(match.group(1)))
        return numbers

    def _numbered_sequence_gaps(self, numbers: List[int]) -> List[int]:
        if not numbers:
            return []
        unique_numbers = set(numbers)
        return [n for n in range(min(unique_numbers), max(unique_numbers) + 1) if n not in unique_numbers]

    def _numbered_only(self, risks: List[str]) -> List[str]:
        return [risk for risk in risks if re.match(r"^\s*\d{1,3}\.\s+", risk)]

    def _recover_numbered_risks_from_plain_text(
        self,
        start_page: int,
        end_page: int,
        layout_risks: List[str],
    ) -> List[str]:
        """
        Recover numbered risks when coordinate block extraction drops headings.

        Some PDFs render table-heavy pages in a way where PyMuPDF block extraction
        omits standalone numbered headings such as "19.", even though plain text
        extraction preserves them. Use the plain-text result only when it produces
        a stronger numbered sequence than the layout-first output.
        """
        layout_numbers = self._numbered_risk_numbers(layout_risks)
        layout_gaps = self._numbered_sequence_gaps(layout_numbers)
        if not layout_gaps:
            return layout_risks

        plain_blocks = self._get_plain_text_blocks(start_page, end_page)
        plain_raw = self.apply_pattern(plain_blocks, "numbered")
        plain_risks = self._numbered_only(self.post_process(plain_raw))
        plain_numbers = self._numbered_risk_numbers(plain_risks)
        plain_gaps = self._numbered_sequence_gaps(plain_numbers)

        layout_score = (len(layout_numbers), -len(layout_gaps))
        plain_score = (len(plain_numbers), -len(plain_gaps))
        if plain_score > layout_score:
            logger.info(
                "Layout Extractor recovered numbered risks from plain text: "
                "%s -> %s risks, gaps %s -> %s",
                len(layout_numbers),
                len(plain_numbers),
                layout_gaps,
                plain_gaps,
            )
            return plain_risks

        return layout_risks

    def _maybe_apply_parser_backend(
        self,
        start_page: int,
        end_page: int,
        pattern: str,
        current_risks: List[str],
    ) -> List[str]:
        backend = self.parser_backend
        if backend in {"", "pymupdf", "layout"}:
            return current_risks

        current_numbers = self._numbered_risk_numbers(current_risks)
        current_gaps = self._numbered_sequence_gaps(current_numbers)
        suspiciously_short_sequence = (
            pattern == "numbered"
            and bool(current_numbers)
            and max(current_numbers) < 10
        )
        if backend == "auto" and not current_gaps and not suspiciously_short_sequence:
            return current_risks

        candidates = ["docling", "unstructured"] if backend == "auto" else [backend]
        best_risks = current_risks
        best_score = (len(current_numbers), -len(current_gaps))

        for candidate in candidates:
            backend_risks = self._extract_with_parser_backend(
                candidate,
                start_page,
                end_page,
                pattern,
            )
            if not backend_risks:
                continue

            backend_numbers = self._numbered_risk_numbers(backend_risks)
            backend_gaps = self._numbered_sequence_gaps(backend_numbers)
            backend_score = (len(backend_numbers), -len(backend_gaps))
            logger.info(
                "Parser backend %s extracted %s numbered risks with gaps %s",
                candidate,
                len(backend_numbers),
                backend_gaps,
            )

            if backend_score > best_score:
                best_risks = backend_risks
                best_score = backend_score
                if backend == "auto" and not backend_gaps:
                    break

        if best_risks is not current_risks:
            logger.info(
                "Layout Extractor selected parser backend result: %s -> %s risks",
                len(current_risks),
                len(best_risks),
            )

        return best_risks

    def _extract_with_parser_backend(
        self,
        backend: str,
        start_page: int,
        end_page: int,
        pattern: str,
    ) -> List[str]:
        try:
            if backend == "docling":
                blocks = extract_docling_blocks(self.pdf_path, start_page, end_page)
            elif backend == "unstructured":
                blocks = extract_unstructured_blocks(self.pdf_path, start_page, end_page)
            else:
                logger.warning("Unknown parser backend requested: %s", backend)
                return []
        except RuntimeError as exc:
            logger.warning("%s", exc)
            return []

        if not blocks:
            return []

        backend_pattern = "numbered" if pattern == "numbered" else self.detect_pattern(blocks)
        risks_raw = self.apply_pattern(blocks, backend_pattern)
        risks_final = self.post_process(risks_raw)
        if backend_pattern == "numbered":
            risks_final = self._numbered_only(risks_final)
        return risks_final

    # ------------------------------------------------------------------
    # TOC & Helper Resolution (ported/adapted from classic)
    # ------------------------------------------------------------------

    def _resolve_toc_bounds(self) -> Tuple[Optional[int], Optional[int]]:
        if self.use_ai:
            start, end = self.ai_extract_toc_bounds()
            if start is not None:
                return start, end
        return self.extract_toc_bounds()

    def extract_toc_bounds(self) -> Tuple[Optional[int], Optional[int]]:
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

        return self._fallback_heading_search(), None

    def ai_extract_toc_bounds(self) -> Tuple[Optional[int], Optional[int]]:
        try:
            from langchain_ollama import ChatOllama
        except ImportError:
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
            return start_page, end_page
        except Exception:
            return None, None

    def locate_actual_page(self, toc_page: int) -> int:
        start_idx = max(0, toc_page - 5)
        end_idx = min(len(self.doc), toc_page + 60)
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

        return min(toc_page, len(self.doc) - 1)

    def find_section_end(self, start_page_idx: int) -> int:
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

    def detect_pattern(self, blocks: List[str]) -> str:
        trimmed = self._trim_before_first_numbered_risk(blocks)

        numbered_block_count = sum(
            1 for b in trimmed[:100] if re.match(r"^\s*\d{1,3}\.\s+", b)
        )
        line_numbered_count = sum(
            1
            for b in trimmed[:100]
            for line in b.split("\n")
            if re.match(r"^\s*\d{1,3}\.\s+", line)
        )
        if numbered_block_count >= 2 or line_numbered_count >= 3:
            return "numbered"

        bullet_line_count = sum(
            1
            for b in trimmed[:100]
            for line in b.split("\n")
            if re.match(r"^\s*[•\-\*]\s+", line)
        )
        if bullet_line_count >= 3:
            return "bullet"

        counts = {"numbered": 0, "bullet": 0, "heading_based": 0}
        for block in trimmed[:50]:
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

        dominant = max(counts, key=counts.get)
        return dominant if counts[dominant] / total > 0.6 else "heading_based"

    def apply_pattern(self, blocks: List[str], pattern: str) -> List[str]:
        if pattern == "numbered":
            blocks = self._trim_before_first_numbered_risk(blocks)
            blocks = self._split_numbered_blocks(blocks)
        elif pattern == "bullet":
            blocks = self._split_bullet_blocks(blocks)
        elif pattern == "heading_based":
            blocks = self._split_heading_blocks(blocks)

        risks: List[str] = []
        current: List[str] = []
        expected_number: Optional[int] = None

        def risk_number(block: str) -> Optional[int]:
            # Use lstrip only — preserve trailing space so '4. ' still matches
            first = block.split("\n")[0].lstrip()
            if pattern == "numbered":
                # Match '4. text' or '4. ' (trailing space) or just '4.' alone
                m = re.match(r"^(\d{1,3})\.\s+", first) or re.match(r"^(\d{1,3})\.\s*$", first.strip())
                return int(m.group(1)) if m else None
            if pattern == "bullet":
                return 1 if re.match(r"^[•\-\*]", first) else None
            is_heading = (
                len(first) < 150
                and (first.istitle() or first.isupper() or re.match(r"^[A-Z]", first))
                and not first.endswith(".")
            )
            return 1 if is_heading else None

        for block in blocks:
            number = risk_number(block)
            if pattern == "numbered" and number is not None:
                # Accept only sequential or near-sequential risk numbers.
                # Table values like "249." or "488." can appear at the
                # beginning of extracted rows; treating any forward-moving
                # number as a new risk collapses the rest of the section.
                is_new = (
                    expected_number is None
                    or number == expected_number
                    or (current and expected_number < number <= expected_number + 2)
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

    def post_process(self, risks: List[str]) -> List[str]:
        cleaned: List[str] = []

        for risk in risks:
            # Drop standalone page-number lines
            lines = [l for l in risk.split("\n") if not re.match(r"^\s*\d+\s*$", l)]
            risk = "\n".join(lines).strip()
            if not risk:
                continue

            # Drop known boilerplate chunks
            first_line = risk.split("\n")[0].strip()
            if self._BOILERPLATE_PATTERNS.match(first_line):
                continue

            # Skip very short fragments (< 10 words) that aren't numbered risks
            word_count = len(risk.split())
            is_numbered = bool(re.match(r"^\d{1,3}\.\s+", risk))
            if word_count < 10 and not is_numbered:
                continue

            cleaned.append(re.sub(r"\s+", " ", risk).strip())

        return cleaned

    def ai_semantic_filter(self, risks: List[str]) -> List[str]:
        try:
            from langchain_ollama import ChatOllama
        except ImportError:
            return risks

        logger.info(f"Layout Extractor running semantic filter on {len(risks)} raw risk chunks...")

        prompt_template = (
            "You are a meticulous financial analyst extracting IPO Risk Factors.\n"
            "Below is a JSON array of strings extracted from a DRHP. Some strings might be fragments "
            "of a single risk, while others might be non-risk boilerplate (e.g. page headers or general info).\n\n"
            "Your task is to return a clean JSON array of strings, where each string is a complete, distinct Risk Factor.\n"
            "- Merge consecutive strings if they belong to the same risk factor.\n"
            "- Discard strings that are clearly not risk factors (e.g., page numbers, disclaimers, random sentences).\n"
            "- Do NOT alter the actual text heavily, just merge and filter.\n"
            "- Return ONLY the raw JSON array (no markdown fences, no preamble).\n\n"
            "Raw chunks:\n{chunks}"
        )

        model = ChatOllama(
            model=os.environ.get("RISK_AI_MODEL", "llama3"),
            temperature=0,
        )

        batch_size = 10
        final_risks = []

        for i in range(0, len(risks), batch_size):
            batch = risks[i:i + batch_size]
            prompt = prompt_template.format(chunks=json.dumps(batch, ensure_ascii=False))
            try:
                raw = model.invoke(prompt).content.strip()
                raw = _strip_markdown_fences(raw)
                filtered_batch = json.loads(raw)
                if isinstance(filtered_batch, list):
                    for r in filtered_batch:
                        if isinstance(r, str) and len(r.strip()) > 20:
                            final_risks.append(r.strip())
            except Exception as e:
                logger.warning(f"Semantic filter failed on batch {i}: {e}. Keeping raw batch.")
                final_risks.extend(batch)

        return final_risks

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

    def _is_risk_heading(self, line: str) -> bool:
        normalized = re.sub(r"\s+", " ", line.strip()).upper()
        return normalized in {"RISK FACTORS", "KEY RISKS", "SECTION II: RISK FACTORS",
                              "SECTION II RISK FACTORS", "SECTION III: RISK FACTORS",
                              "SECTION III RISK FACTORS"}

    def _trim_before_first_numbered_risk(self, blocks: List[str]) -> List[str]:
        """
        Find the first block that starts a numbered risk.
        Handles both '1. text' and '1.\nTitle' formats.
        """
        for idx, block in enumerate(blocks):
            # '1. text' on same line OR '1.' followed by newline
            if re.match(r"^\s*\d{1,3}\.\s*[\n\r\s]", block) or re.match(r"^\s*\d{1,3}\.\s*$", block.split("\n")[0].strip()):
                return blocks[idx:]
        return blocks

    def _split_by_line_marker(self, block: str, pattern: str,
                               standalone_num: bool = False) -> List[str]:
        """
        Split a text block at lines matching 'pattern'.
        If standalone_num=True, also treats lines like '4.' (number alone)
        as a new-segment marker, merging it with the next non-empty line.
        """
        lines = block.split("\n")
        segments: List[str] = []
        current: List[str] = []
        i = 0

        while i < len(lines):
            line = lines[i]
            is_marker = bool(re.match(pattern, line))

            # Detect standalone number line: '4.' or '4. ' alone
            is_lone_num = (
                standalone_num
                and bool(re.match(r"^\s*\d{1,3}\.\s*$", line))
                and not is_marker
            )

            if is_marker or is_lone_num:
                if current:
                    segments.append("\n".join(current))
                if is_lone_num:
                    # Peek ahead: merge number with next non-empty line
                    j = i + 1
                    while j < len(lines) and not lines[j].strip():
                        j += 1
                    if j < len(lines):
                        current = [line.strip() + " " + lines[j].strip()]
                        i = j + 1
                        continue
                    else:
                        current = [line]
                else:
                    current = [line]
            else:
                current.append(line)
            i += 1

        if current:
            segments.append("\n".join(current))

        return segments

    def _split_numbered_blocks(self, blocks: List[str]) -> List[str]:
        results: List[str] = []
        for block in blocks:
            results.extend(self._split_by_line_marker(
                block, r"^\s*\d{1,3}\.\s+", standalone_num=True
            ))
        return results

    def _split_bullet_blocks(self, blocks: List[str]) -> List[str]:
        results: List[str] = []
        for block in blocks:
            results.extend(self._split_by_line_marker(block, r"^\s*[•\-\*]\s+"))
        return results

    def _is_heading_candidate(self, line: str) -> bool:
        first = line.strip()
        return bool(
            first
            and len(first) < 100
            and (first.istitle() or first.isupper())
            and not first.endswith(".")
        )

    def _split_heading_blocks(self, blocks: List[str]) -> List[str]:
        results: List[str] = []
        for block in blocks:
            lines = block.split("\n")
            current: List[str] = []
            for line in lines:
                if self._is_heading_candidate(line):
                    if current:
                        results.append("\n".join(current))
                    current = [line]
                else:
                    current.append(line)
            if current:
                results.append("\n".join(current))
        return results

    def _infer_company_name(self, text: str) -> Optional[str]:
        for line in text.splitlines():
            line = re.sub(r"\s+", " ", line).strip()
            if not line or len(line) > 120:
                continue
            if re.search(r"(?i)\b(limited|private limited|ltd\.?)\b", line):
                if not re.search(r"(?i)(registrar|manager|book|legal|auditor|banker)", line):
                    return line
        return None

    def _infer_document_type(self, text: str) -> Optional[str]:
        if re.search(r"(?i)\bdraft\s+red\s+herring\s+prospectus\b|\bDRHP\b", text):
            return "DRHP"
        if re.search(r"(?i)\bred\s+herring\s+prospectus\b|\bRHP\b", text):
            return "RHP"
        return None

    def _infer_ipo_year(self, text: str) -> Optional[int]:
        import datetime
        current_year = datetime.date.today().year
        years = [
            int(y) for y in re.findall(r"\b(20\d{2})\b", text)
            if 2015 <= int(y) <= current_year + 1
        ]
        return max(years) if years else None
