"""
pipeline.py — high-level orchestration: resolve paths, run per-PDF analysis
"""
from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import List, Optional

from .classifier import build_risk_records
from .extractor import RiskAnalyzer

logger = logging.getLogger(__name__)


def resolve_pdf_paths(inputs: List[str]) -> List[Path]:
    """
    Expand a list of file/directory arguments into a deduplicated list of PDF paths.
    Defaults to all PDFs in the current working directory when inputs is empty.

    Raises
    ------
    ValueError  if an input path doesn't exist or no PDFs are found.
    """
    if not inputs:
        inputs = ["."]

    raw: List[Path] = []
    for arg in inputs:
        path = Path(arg)
        if path.is_dir():
            raw.extend([p for p in sorted(path.rglob("*.pdf")) if p.stat().st_size > 0])
        elif not path.exists():
            raise ValueError(f"Input path not found: {arg}")
        elif path.is_file() and path.suffix.lower() != ".pdf":
            raise ValueError(f"Unsupported file type (only .pdf is supported): {arg}")
        elif path.is_file() and path.stat().st_size == 0:
            raise ValueError(f"PDF file is empty (0 bytes): {arg}")
        elif path.is_file() and path.suffix.lower() == ".pdf" and path.stat().st_size > 0:
            raw.append(path)
        else:
            raise ValueError(f"Unsupported or invalid input path: {arg}")

    # Deduplicate by resolved absolute path
    seen: set = set()
    unique: List[Path] = []
    for path in raw:
        resolved = path.resolve()
        if resolved not in seen:
            seen.add(resolved)
            unique.append(path)

    if not unique:
        raise ValueError("No PDF files found.")

    return unique


def resolve_manifest_pdf_items(manifest_path: str | Path) -> List[dict]:
    """
    Read a SEBI collector manifest and return entries whose PDFs were downloaded.
    Each item carries the local PDF path plus source metadata for DB insertion.
    """
    manifest_file = Path(manifest_path)
    payload = json.loads(manifest_file.read_text(encoding="utf-8"))

    items = []
    for filing in payload.get("filings", []):
        downloaded_path = filing.get("downloaded_path")
        if filing.get("status") != "downloaded" or not downloaded_path:
            continue
        pdf_path = Path(downloaded_path)
        if not pdf_path.exists():
            logger.warning(f"Skipping manifest entry with missing PDF: {downloaded_path}")
            continue
        items.append({
            "pdf_path": pdf_path,
            "source_metadata": {
                "company_name": filing.get("company_name"),
                "document_type": filing.get("document_type"),
                "ipo_year": filing.get("filing_year"),
                "source_url": filing.get("sebi_page_url"),
                "sebi_filing_date": filing.get("filing_date"),
                "file_hash": filing.get("file_hash"),
            },
        })

    if not items:
        raise ValueError(f"No downloaded PDFs found in manifest: {manifest_path}")

    return items


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def analyze_pdf(
    pdf_path: Path,
    use_ai: bool = False,
    source_metadata: Optional[dict] = None,
) -> dict:
    """
    Run the full extraction + classification pipeline for a single PDF.

    Returns a dict with:
        metadata      — company_name, document_type, ipo_year, domain,
                        source_file, total_risks
        risk_factors  — raw list of extracted risk text strings
        risk_records  — list of structured dicts ready for DB insertion
    """
    logger.info(f"Processing: {pdf_path}")

    analyzer = RiskAnalyzer(str(pdf_path), use_ai=use_ai)
    risks = analyzer.run()
    context = analyzer.infer_document_context()
    if source_metadata:
        context = {**context, **{k: v for k, v in source_metadata.items() if v is not None}}
    risk_records = build_risk_records(risks, context, use_ai=use_ai)
    file_hash = context.get("file_hash") or file_sha256(pdf_path)

    return {
        "metadata": {
            "source_file":  str(pdf_path),
            "file_hash":    file_hash,
            "total_risks":  len(risks),
            **context,
        },
        "risk_factors": risks,
        "risk_records": risk_records,
    }
