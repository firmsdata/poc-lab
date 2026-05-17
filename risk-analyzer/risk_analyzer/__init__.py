"""
risk_analyzer
=============
IPO DRHP/RHP risk factor extraction pipeline.

Public API
----------
    from risk_analyzer import analyze_pdf, resolve_pdf_paths, insert_risk_records
"""

from .pipeline import analyze_pdf, resolve_pdf_paths  # noqa: F401
from .db import insert_risk_records  # noqa: F401

__all__ = [
    "analyze_pdf",
    "resolve_pdf_paths",
    "insert_risk_records",
]
