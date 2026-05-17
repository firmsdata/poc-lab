"""
cli.py — command-line interface for the risk-analyzer pipeline
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import List

from .db import (
    check_database_connection,
    get_database_url,
    init_database,
    insert_risk_records,
)
from .pipeline import analyze_pdf, resolve_manifest_pdf_items, resolve_pdf_paths

logger = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="risk-analyzer",
        description="Extract Risk Factors from one or more DRHP/RHP PDF files.",
    )
    parser.add_argument(
        "pdf_paths",
        nargs="*",
        metavar="PDF",
        help="PDF file(s) or folder(s). Defaults to all PDFs in the current folder.",
    )
    parser.add_argument(
        "--output", "-o",
        default="extracted_risks.json",
        metavar="FILE",
        help="Output JSON file path (default: extracted_risks.json).",
    )
    parser.add_argument(
        "--database-url",
        metavar="URL",
        help=(
            "Database connection URL, e.g. mysql://user:pass@localhost:3306/risk_analyzer. "
            "Defaults to DATABASE_URL from .env/environment. "
            "When provided, results are inserted into the ipo_documents + risks tables."
        ),
    )
    parser.add_argument(
        "--manifest",
        metavar="FILE",
        help="SEBI collector manifest JSON. Inserts/analyzes only filings with status='downloaded'.",
    )
    parser.add_argument(
        "--audit-doc",
        metavar="ID",
        type=int,
        help="Perform a structural assessment on risks for a specific document ID and output to JSON.",
    )
    parser.add_argument(
        "--serve",
        action="store_true",
        help="Start the FastAPI server to host the UI and API.",
    )
    parser.add_argument(
        "--init-db",
        action="store_true",
        help="Create/update database tables from schema.sql before inserting.",
    )
    parser.add_argument(
        "--check-db",
        action="store_true",
        help="Only test the database connection, then exit.",
    )
    parser.add_argument(
        "--use-ai",
        action="store_true",
        help=(
            "Use local Llama 3 (via Ollama) for TOC extraction and risk classification. "
            "Requires Ollama running at http://localhost:11434."
        ),
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging verbosity (default: INFO).",
    )
    return parser


def main(argv: List[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(levelname)s: %(message)s",
    )

    try:
        database_url = get_database_url(args.database_url)

        if args.check_db:
            if not database_url:
                raise ValueError("Set DATABASE_URL in .env/environment or pass --database-url.")
            check_database_connection(database_url)
            return

        if args.serve:
            import uvicorn
            logger.info("Starting API server on http://localhost:8000")
            uvicorn.run("risk_analyzer.server:app", host="0.0.0.0", port=8000, reload=False)
            return

        if args.audit_doc is not None:
            if not database_url:
                raise ValueError("Set DATABASE_URL in .env/environment or pass --database-url.")
            from .db import fetch_risks_by_document
            from .auditor import generate_audit_report
            risks = fetch_risks_by_document(database_url, args.audit_doc)
            if not risks:
                logger.error(f"No risks found for document ID {args.audit_doc}")
                sys.exit(1)
            report = generate_audit_report(risks, use_ai=args.use_ai)
            output_path = Path(f"audit_report_{args.audit_doc}.json")
            output_path.write_text(json.dumps(report, indent=4, ensure_ascii=False), encoding="utf-8")
            logger.info(f"Saved audit report for doc {args.audit_doc} -> {output_path}")
            return

        if args.init_db:
            if not database_url:
                raise ValueError("Set DATABASE_URL in .env/environment or pass --database-url.")
            init_database(database_url)

        if args.manifest:
            manifest_items = resolve_manifest_pdf_items(args.manifest)
            documents = [
                analyze_pdf(
                    item["pdf_path"],
                    use_ai=args.use_ai,
                    source_metadata=item.get("source_metadata"),
                )
                for item in manifest_items
            ]
        else:
            pdf_paths = resolve_pdf_paths(args.pdf_paths)
            documents = [analyze_pdf(p, use_ai=args.use_ai) for p in pdf_paths]

        # ── Build output payload ─────────────────────────────────────────
        if len(documents) == 1:
            output = documents[0]
        else:
            output = {
                "metadata": {
                    "total_files": len(documents),
                    "total_risks": sum(d["metadata"]["total_risks"] for d in documents),
                },
                "documents": documents,
            }

        # ── Write JSON ───────────────────────────────────────────────────
        output_path = Path(args.output)
        output_path.write_text(
            json.dumps(output, indent=4, ensure_ascii=False), encoding="utf-8"
        )
        logger.info(f"Saved results for {len(documents)} PDF(s) → {output_path}")

        # ── Persist to DB ────────────────────────────────────────────────
        if database_url:
            inserted = insert_risk_records(database_url, documents)
            logger.info(f"Inserted {inserted} risk records into the database.")

    except Exception as exc:
        logger.error(f"Fatal error: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
