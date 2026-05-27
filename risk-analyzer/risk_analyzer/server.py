import asyncio
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from typing import List, Dict, Any
import json
import logging
import shutil
import tempfile
from pathlib import Path

from .db import (
    get_database_url,
    _connect_mysql,
    _import_psycopg,
    database_kind,
    fetch_risks_by_document,
    fetch_risks_by_domain,
    fetch_baseline_documents_by_domain,
    insert_risk_records,
)
from .auditor import generate_audit_report, generate_comparative_audit, generate_per_risk_feedback, generate_single_risk_feedback
from .knowledge_base import evaluate_risk_against_rulebook, evaluate_section_coverage, get_rulebook_summary
from .pipeline import analyze_pdf
from .kb_api import router as kb_router
from .chat_api import router as chat_router
from .draft_api import router as draft_router

logger = logging.getLogger(__name__)

app = FastAPI(title="FirmsData Risk Analyzer API")

# Routers must be included before the catch-all static mount
app.include_router(kb_router)
app.include_router(chat_router)
app.include_router(draft_router)

# Allow CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_documents() -> List[Dict[str, Any]]:
    database_url = get_database_url()
    if not database_url:
        raise ValueError("DATABASE_URL is not set.")

    kind = database_kind(database_url)
    docs = []

    query = """
        SELECT
            d.id,
            d.company_name,
            d.document_type,
            d.ipo_year,
            COALESCE(d.total_risks, 0)  AS total_risks,
            d.created_at,
            MAX(r.domain)               AS domain
        FROM ipo_documents d
        LEFT JOIN risks r ON r.document_id = d.id
        GROUP BY d.id, d.company_name, d.document_type, d.ipo_year, d.total_risks, d.created_at
        ORDER BY d.id DESC
    """

    if kind == "mysql":
        conn = _connect_mysql(database_url)
        try:
            with conn.cursor() as cur:
                cur.execute(query)
                columns = [col[0] for col in cur.description]
                for row in cur.fetchall():
                    raw = dict(zip(columns, row))
                    docs.append(_shape_document(raw))
        finally:
            conn.close()
    else:
        psycopg = _import_psycopg()
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                columns = [col.name for col in cur.description]
                for row in cur.fetchall():
                    raw = dict(zip(columns, row))
                    docs.append(_shape_document(raw))

    return docs


def _shape_document(raw: Dict[str, Any]) -> Dict[str, Any]:
    created = raw.get("created_at")
    date_added = created.isoformat() if created else ""
    return {
        "id": str(raw["id"]),
        "company": raw.get("company_name") or "",
        "type": raw.get("document_type") or "DRHP",
        "year": raw.get("ipo_year") or 0,
        "total_risks": raw.get("total_risks") or 0,
        "domain": raw.get("domain") or "",
        "date_added": date_added,
    }

@app.get("/api/documents")
def api_get_documents():
    try:
        return get_db_documents()
    except Exception as e:
        logger.error(f"Failed to fetch documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/knowledge-base/drhp-rulebook")
def api_get_drhp_rulebook():
    return {
        "source": "LiveLaw - The DRHP Rulebook",
        "rules": get_rulebook_summary(),
    }

@app.get("/api/audit/{document_id}")
def api_get_audit(document_id: int):
    # First, check if there's a cached report on disk (optional)
    cache_dir = Path(__file__).parent.parent / "data" / "audit_reports"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f"audit_report_{document_id}.json"
    if cache_file.exists():
        try:
            return json.loads(cache_file.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"Failed to read cached audit report: {e}")
            
    database_url = get_database_url()
    if not database_url:
        raise HTTPException(status_code=500, detail="Database URL not configured")
        
    risks = fetch_risks_by_document(database_url, document_id)
    if not risks:
        raise HTTPException(status_code=404, detail=f"No risks found for document ID {document_id}")
        
    report = generate_audit_report(risks, use_ai=True)
    if not report:
        raise HTTPException(status_code=500, detail="Failed to generate audit report via AI")
        
    # Cache the report for future use
    try:
        cache_file.write_text(json.dumps(report, indent=4, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        logger.warning(f"Failed to cache audit report: {e}")
        
    return report

@app.post("/api/upload-drhp")
async def api_upload_drhp(file: UploadFile = File(...), stream: bool = True):
    """
    Accept a DRHP/RHP PDF, extract risk factors, and stream or return per-risk AI feedback.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    if not stream:
        # Save upload to a temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = Path(tmp.name)

        try:
            # 1. Extract risks (rule-based, fast)
            logger.info(f"Extracting risks from: {file.filename} (non-streaming)")
            result = await asyncio.to_thread(analyze_pdf, tmp_path, use_ai=False)
            risk_records = result.get("risk_records", [])
            domain = result.get("metadata", {}).get("domain", "Unknown")

            if not risk_records:
                raise HTTPException(status_code=422, detail="No risk factors could be extracted from the uploaded PDF.")

            # 1.1 Persist to DB if configured
            database_url = get_database_url()
            if database_url:
                try:
                    inserted = await asyncio.to_thread(insert_risk_records, database_url, [result])
                    logger.info(f"Persisted analysis: inserted {inserted} risk rows")
                except Exception as e:
                    logger.warning(f"Failed to persist analysis to DB: {e}")

            section_findings = evaluate_section_coverage(risk_records)

            # 1.2 Fetch baseline info
            baseline_docs = []
            baseline_risks = []
            if database_url and domain and domain != "Unknown":
                try:
                    baseline_docs = await asyncio.to_thread(fetch_baseline_documents_by_domain, database_url, domain)
                    baseline_risks = await asyncio.to_thread(fetch_risks_by_domain, database_url, domain)
                except Exception as e:
                    logger.warning(f"Failed to fetch baseline info for domain {domain}: {e}")

            # 1.3 Concurrently evaluate feedback for all risks
            async def get_feedback_and_findings(i, risk):
                fb = await asyncio.to_thread(generate_single_risk_feedback, risk, baseline_risks, True)
                rulebook_findings = evaluate_risk_against_rulebook(risk)
                fb = _merge_rulebook_feedback(fb, rulebook_findings)
                return {
                    "index":       i + 1,
                    "title":       risk.get("title", ""),
                    "description": risk.get("description", ""),
                    "domain":      risk.get("domain", ""),
                    "category":    risk.get("category", ""),
                    "sub_category":risk.get("sub_category", ""),
                    "quality":     fb.get("quality", "ADEQUATE"),
                    "issue":       fb.get("issue"),
                    "improvement": fb.get("improvement"),
                    "rulebook_findings": rulebook_findings,
                }

            tasks = [get_feedback_and_findings(i, risk) for i, risk in enumerate(risk_records)]
            risks_list = await asyncio.gather(*tasks)

            return {
                "type": "success",
                "filename": file.filename,
                "domain": domain,
                "baseline_documents": baseline_docs,
                "total_risks": len(risk_records),
                "section_findings": section_findings,
                "rulebook": get_rulebook_summary(),
                "risks": risks_list
            }
        except Exception as e:
            logger.error(f"Error during document analysis: {e}")
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            tmp_path.unlink(missing_ok=True)

    async def event_generator():
        # Save upload to a temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = Path(tmp.name)

        try:
            yield json.dumps({"type": "status", "message": f"Extracting risks from: {file.filename}..."}) + "\n"
            
            # 1. Extract risks (rule-based, fast)
            logger.info(f"Extracting risks from: {file.filename}")
            result = await asyncio.to_thread(analyze_pdf, tmp_path, use_ai=False)
            risk_records = result.get("risk_records", [])
            domain = result.get("metadata", {}).get("domain", "Unknown")

            if not risk_records:
                yield json.dumps({"type": "error", "message": "No risk factors could be extracted from the uploaded PDF."}) + "\n"
                return

            # 1.1 Persist to DB if configured (run in thread to avoid blocking)
            database_url = get_database_url()
            if database_url:
                try:
                    inserted = await asyncio.to_thread(insert_risk_records, database_url, [result])
                    logger.info(f"Persisted analysis: inserted {inserted} risk rows")
                    yield json.dumps({"type": "status", "message": f"Saved analysis to DB ({inserted} rows)."}) + "\n"
                except Exception as e:
                    logger.warning(f"Failed to persist analysis to DB: {e}")
                    yield json.dumps({"type": "status", "message": "Analysis extracted but not saved to DB."}) + "\n"

            section_findings = evaluate_section_coverage(risk_records)

            yield json.dumps({"type": "status", "message": "Fetching baseline standards..."}) + "\n"

            # 1.5 Fetch baseline documents for this domain
            database_url = get_database_url()
            baseline_docs = []
            baseline_risks = []
            if database_url and domain and domain != "Unknown":
                try:
                    baseline_docs = await asyncio.to_thread(fetch_baseline_documents_by_domain, database_url, domain)
                    baseline_risks = await asyncio.to_thread(fetch_risks_by_domain, database_url, domain)
                except Exception as e:
                    logger.warning(f"Failed to fetch baseline info for domain {domain}: {e}")

            # Send initial extracted metadata
            yield json.dumps({
                "type": "extracted",
                "filename": file.filename,
                "domain": domain,
                "baseline_documents": baseline_docs,
                "total_risks": len(risk_records),
                "section_findings": section_findings,
                "rulebook": get_rulebook_summary(),
                "risks": [
                    {
                        "index": i + 1,
                        "title": risk.get("title", ""),
                        "description": risk.get("description", ""),
                        "domain": risk.get("domain", ""),
                        "category": risk.get("category", ""),
                        "sub_category": risk.get("sub_category", ""),
                    }
                    for i, risk in enumerate(risk_records)
                ],
                "message": f"Extracted {len(risk_records)} risks. Starting feedback review...",
                "percent": 30,
            }) + "\n"

            # 2. Iterate and generate single-risk feedback incrementally
            logger.info(f"Generating per-risk feedback for {len(risk_records)} risks incrementally...")
            for i, risk in enumerate(risk_records):
                yield json.dumps({"type": "status", "message": f"Analyzing risk {i+1} of {len(risk_records)}..."}) + "\n"
                
                fb = await asyncio.to_thread(generate_single_risk_feedback, risk, baseline_risks, True)
                rulebook_findings = evaluate_risk_against_rulebook(risk)
                fb = _merge_rulebook_feedback(fb, rulebook_findings)

                # Log the generated feedback so we can trace streaming behavior
                try:
                    logger.info(
                        "Prepared feedback for risk %d/%d: title=%s quality=%s",
                        i + 1,
                        len(risk_records),
                        (risk.get("title") or "")[:120],
                        fb.get("quality") if isinstance(fb, dict) else str(fb),
                    )
                except Exception:
                    logger.debug("Prepared feedback for risk (logging failed)")
                
                risk_data = {
                    "index":       i + 1,
                    "title":       risk.get("title", ""),
                    "description": risk.get("description", ""),
                    "domain":      risk.get("domain", ""),
                    "category":    risk.get("category", ""),
                    "sub_category":risk.get("sub_category", ""),
                    "quality":     fb.get("quality", "ADEQUATE"),
                    "issue":       fb.get("issue"),
                    "improvement": fb.get("improvement"),
                    "rulebook_findings": rulebook_findings,
                }
                # Emit the modern stream event. The React client already
                # supports this shape, so emitting the legacy event as well
                # would duplicate cards.
                logger.info("Yielding risk_feedback event for risk %d/%d", i + 1, len(risk_records))
                yield json.dumps({"type": "risk_feedback", "risk": risk_data}) + "\n"

            yield json.dumps({"type": "done", "message": "Analysis complete."}) + "\n"
        except Exception as e:
            logger.error(f"Error during stream generation: {e}")
            yield json.dumps({"type": "error", "message": str(e)}) + "\n"
        finally:
            tmp_path.unlink(missing_ok=True)

    from fastapi.responses import StreamingResponse
    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


def _merge_rulebook_feedback(feedback: dict, findings: list[dict]) -> dict:
    if not findings:
        return feedback

    merged = dict(feedback or {})
    highest = _highest_rulebook_severity(findings)
    current = merged.get("quality") or "ADEQUATE"
    if current == "ADEQUATE":
        merged["quality"] = highest
    elif current == "NEEDS IMPROVEMENT" and highest == "HIGH CONCERN":
        merged["quality"] = "HIGH CONCERN"

    if not merged.get("issue"):
        merged["issue"] = findings[0].get("message")
    if not merged.get("improvement"):
        merged["improvement"] = findings[0].get("suggestion")
    return merged


def _highest_rulebook_severity(findings: list[dict]) -> str:
    if any(finding.get("severity") == "HIGH CONCERN" for finding in findings):
        return "HIGH CONCERN"
    return "NEEDS IMPROVEMENT"

# Serve the React frontend (built output).
# The catch-all mount MUST come last so API routes are not shadowed.
# html=True enables SPA fallback: unknown paths serve index.html.
_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
    logger.info(f"Serving React frontend from {_frontend_dist}")
else:
    # Fallback: serve the legacy vanilla UI when the React build does not exist
    _ui_path = Path(__file__).parent.parent / "ui"
    if _ui_path.exists():
        app.mount("/static", StaticFiles(directory=str(_ui_path)), name="static")

        @app.get("/")
        def serve_legacy_index():
            return FileResponse(str(_ui_path / "index.html"))

        logger.warning("React build not found — serving legacy UI. Run `cd frontend && npm run build`.")
    else:
        logger.warning("No UI directory found. Run `cd frontend && npm run build` to build the frontend.")
