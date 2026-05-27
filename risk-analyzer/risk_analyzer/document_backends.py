"""
document_backends.py
--------------------
Optional document parser integrations used by the risk extractor.

These backends are intentionally lazy imports so the application can run with
the default PyMuPDF extractor even when heavier parser packages are absent.
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import List

import fitz

logger = logging.getLogger(__name__)


def _write_section_pdf(pdf_path: str, start_page: int, end_page: int) -> str:
    """Write a temporary PDF containing only the requested 0-based page range."""
    source = fitz.open(pdf_path)
    section = fitz.open()
    section.insert_pdf(source, from_page=start_page, to_page=end_page)

    handle = tempfile.NamedTemporaryFile(
        prefix="risk-section-",
        suffix=".pdf",
        delete=False,
    )
    handle.close()
    section.save(handle.name)
    section.close()
    source.close()
    return handle.name


def _split_structured_text(text: str) -> List[str]:
    blocks: List[str] = []
    current: List[str] = []

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            if current:
                blocks.append("\n".join(current))
                current = []
            continue
        current.append(line)

    if current:
        blocks.append("\n".join(current))

    return blocks


def extract_docling_blocks(pdf_path: str, start_page: int, end_page: int) -> List[str]:
    """
    Convert a PDF section with Docling and return text/markdown blocks.

    Raises RuntimeError when Docling is not installed or conversion fails.
    """
    try:
        from docling.document_converter import DocumentConverter
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.document_converter import PdfFormatOption
    except ImportError as exc:
        raise RuntimeError("Docling is not installed. Run: pip install docling") from exc

    section_path = _write_section_pdf(pdf_path, start_page, end_page)
    try:
        options = PdfPipelineOptions()
        options.do_ocr = False
        options.force_backend_text = True
        options.do_table_structure = False
        converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=options),
            }
        )
        result = converter.convert(section_path)
        document = result.document

        if hasattr(document, "export_to_text"):
            text = document.export_to_text()
        else:
            text = document.export_to_markdown()

        return _split_structured_text(text)
    except Exception as exc:
        raise RuntimeError(f"Docling conversion failed: {exc}") from exc
    finally:
        try:
            Path(section_path).unlink(missing_ok=True)
        except OSError:
            logger.debug("Could not remove temporary section PDF: %s", section_path)


def extract_unstructured_blocks(pdf_path: str, start_page: int, end_page: int) -> List[str]:
    """
    Convert a PDF section with Unstructured and return element text blocks.

    Raises RuntimeError when Unstructured is not installed or conversion fails.
    """
    try:
        from unstructured.partition.pdf import partition_pdf
    except ImportError as exc:
        raise RuntimeError(
            "Unstructured is not installed. Run: pip install 'unstructured[pdf]'"
        ) from exc

    section_path = _write_section_pdf(pdf_path, start_page, end_page)
    try:
        elements = partition_pdf(
            filename=section_path,
            strategy="hi_res",
            infer_table_structure=True,
        )
        return [str(element).strip() for element in elements if str(element).strip()]
    except Exception as exc:
        raise RuntimeError(f"Unstructured conversion failed: {exc}") from exc
    finally:
        try:
            Path(section_path).unlink(missing_ok=True)
        except OSError:
            logger.debug("Could not remove temporary section PDF: %s", section_path)
