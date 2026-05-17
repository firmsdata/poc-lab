"""
db.py — SQL persistence for the two-table schema (ipo_documents + risks).

Supports:
  - PostgreSQL URLs: postgresql://user:pass@host:5432/db
  - MySQL URLs:      mysql://user:pass@host:3306/db
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from urllib.parse import unquote, urlparse
from typing import List, Optional

logger = logging.getLogger(__name__)

_DOC_SQL_POSTGRES = """
    INSERT INTO ipo_documents (
        company_name, document_type, ipo_year,
        source_file, source_url, sebi_filing_date,
        file_hash, total_risks, extraction_version
    )
    VALUES (
        %(company_name)s, %(document_type)s, %(ipo_year)s,
        %(source_file)s, %(source_url)s, %(sebi_filing_date)s,
        %(file_hash)s, %(total_risks)s, %(extraction_version)s
    )
    ON CONFLICT (file_hash) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        document_type = EXCLUDED.document_type,
        ipo_year = EXCLUDED.ipo_year,
        source_file = EXCLUDED.source_file,
        source_url = EXCLUDED.source_url,
        sebi_filing_date = EXCLUDED.sebi_filing_date,
        total_risks = EXCLUDED.total_risks,
        extraction_version = EXCLUDED.extraction_version
    RETURNING id
"""

_DOC_SQL_MYSQL = """
    INSERT INTO ipo_documents (
        company_name, document_type, ipo_year,
        source_file, source_url, sebi_filing_date,
        file_hash, total_risks, extraction_version
    )
    VALUES (
        %(company_name)s, %(document_type)s, %(ipo_year)s,
        %(source_file)s, %(source_url)s, %(sebi_filing_date)s,
        %(file_hash)s, %(total_risks)s, %(extraction_version)s
    )
    ON DUPLICATE KEY UPDATE
        company_name = VALUES(company_name),
        document_type = VALUES(document_type),
        ipo_year = VALUES(ipo_year),
        source_file = VALUES(source_file),
        source_url = VALUES(source_url),
        sebi_filing_date = VALUES(sebi_filing_date),
        total_risks = VALUES(total_risks),
        extraction_version = VALUES(extraction_version)
"""

_RISK_SQL_POSTGRES = """
    INSERT INTO risks (
        document_id,
        domain, category, sub_category, risk_nature,
        title, description, order_index,
        section_name, page_start, page_end,
        classification_method, classification_confidence,
        content_hash
    )
    VALUES (
        %(document_id)s,
        %(domain)s, %(category)s, %(sub_category)s, %(risk_nature)s,
        %(title)s, %(description)s, %(order_index)s,
        %(section_name)s, %(page_start)s, %(page_end)s,
        %(classification_method)s, %(classification_confidence)s,
        %(content_hash)s
    )
    ON CONFLICT (document_id, order_index) DO UPDATE SET
        domain = EXCLUDED.domain,
        category = EXCLUDED.category,
        sub_category = EXCLUDED.sub_category,
        risk_nature = EXCLUDED.risk_nature,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        section_name = EXCLUDED.section_name,
        page_start = EXCLUDED.page_start,
        page_end = EXCLUDED.page_end,
        classification_method = EXCLUDED.classification_method,
        classification_confidence = EXCLUDED.classification_confidence,
        content_hash = EXCLUDED.content_hash
"""

_RISK_SQL_MYSQL = """
    INSERT INTO risks (
        document_id,
        domain, category, sub_category, risk_nature,
        title, description, order_index,
        section_name, page_start, page_end,
        classification_method, classification_confidence,
        content_hash
    )
    VALUES (
        %(document_id)s,
        %(domain)s, %(category)s, %(sub_category)s, %(risk_nature)s,
        %(title)s, %(description)s, %(order_index)s,
        %(section_name)s, %(page_start)s, %(page_end)s,
        %(classification_method)s, %(classification_confidence)s,
        %(content_hash)s
    )
    ON DUPLICATE KEY UPDATE
        domain = VALUES(domain),
        category = VALUES(category),
        sub_category = VALUES(sub_category),
        risk_nature = VALUES(risk_nature),
        title = VALUES(title),
        description = VALUES(description),
        section_name = VALUES(section_name),
        page_start = VALUES(page_start),
        page_end = VALUES(page_end),
        classification_method = VALUES(classification_method),
        classification_confidence = VALUES(classification_confidence),
        content_hash = VALUES(content_hash)
"""

EXTRACTION_VERSION = "1.0"


def load_env_file(path: str | Path = ".env") -> None:
    env_path = Path(path)
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def get_database_url(cli_database_url: Optional[str] = None) -> Optional[str]:
    load_env_file()
    return cli_database_url or os.environ.get("DATABASE_URL")


def database_kind(database_url: str) -> str:
    scheme = urlparse(database_url).scheme.lower()
    if scheme in {"postgres", "postgresql"}:
        return "postgres"
    if scheme in {"mysql", "mysql+pymysql"}:
        return "mysql"
    raise ValueError(f"Unsupported DATABASE_URL scheme: {scheme}")


def _import_psycopg():
    try:
        import psycopg
    except ImportError as exc:
        raise RuntimeError(
            "Install database dependencies first: venv/bin/python -m pip install -r requirements.txt"
        ) from exc
    return psycopg


def _import_pymysql():
    try:
        import pymysql
    except ImportError as exc:
        raise RuntimeError(
            "Install MySQL dependencies first: venv/bin/python -m pip install -r requirements.txt"
        ) from exc
    return pymysql


def _connect_mysql(database_url: str):
    pymysql = _import_pymysql()
    parsed = urlparse(database_url)
    return pymysql.connect(
        host=parsed.hostname or "localhost",
        port=parsed.port or 3306,
        user=unquote(parsed.username or ""),
        password=unquote(parsed.password or ""),
        database=(parsed.path or "/").lstrip("/"),
        charset="utf8mb4",
        autocommit=False,
        cursorclass=pymysql.cursors.Cursor,
    )


def check_database_connection(database_url: str) -> None:
    if database_kind(database_url) == "mysql":
        conn = _connect_mysql(database_url)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        finally:
            conn.close()
    else:
        psycopg = _import_psycopg()
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
    logger.info(f"Database connection OK ({database_kind(database_url)}).")


def init_database(database_url: str, schema_path: str | Path | None = None) -> None:
    kind = database_kind(database_url)
    selected_schema = Path(schema_path) if schema_path else Path("schema.mysql.sql" if kind == "mysql" else "schema.sql")
    schema = selected_schema.read_text(encoding="utf-8")

    if kind == "mysql":
        conn = _connect_mysql(database_url)
        try:
            with conn.cursor() as cur:
                for statement in _split_sql_statements(schema):
                    cur.execute(statement)
            conn.commit()
        finally:
            conn.close()
    else:
        psycopg = _import_psycopg()
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(schema)
            conn.commit()
    logger.info(f"Initialized {kind} database schema from {selected_schema}.")


def _split_sql_statements(schema: str) -> List[str]:
    statements = []
    current = []
    for line in schema.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            continue
        current.append(line)
        if stripped.endswith(";"):
            statements.append("\n".join(current).rstrip(";").strip())
            current = []
    if current:
        statements.append("\n".join(current).strip())
    return [statement for statement in statements if statement]


def insert_risk_records(database_url: str, documents: List[dict]) -> int:
    """
    Persist extracted documents into Postgres.

    For each document:
      1. Insert one row into ``ipo_documents`` and capture the generated id.
      2. Bulk-insert all risk records into ``risks`` with that document_id FK.

    Returns the total number of risk rows inserted.

    Raises
    ------
    RuntimeError  if psycopg is not installed.
    """
    kind = database_kind(database_url)
    total = 0

    if kind == "mysql":
        conn = _connect_mysql(database_url)
        try:
            with conn.cursor() as cur:
                total = _insert_documents(cur, documents, kind)
            conn.commit()
        finally:
            conn.close()
    else:
        psycopg = _import_psycopg()
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                total = _insert_documents(cur, documents, kind)
            conn.commit()

    logger.info(f"Committed {total} risk rows to {kind} database.")
    return total


def _insert_documents(cur, documents: List[dict], kind: str) -> int:
    total = 0
    doc_sql = _DOC_SQL_MYSQL if kind == "mysql" else _DOC_SQL_POSTGRES
    risk_sql = _RISK_SQL_MYSQL if kind == "mysql" else _RISK_SQL_POSTGRES

    for document in documents:
        meta = document.get("metadata", {})
        doc_params = {
            "company_name":       meta.get("company_name"),
            "document_type":      meta.get("document_type"),
            "ipo_year":           meta.get("ipo_year"),
            "source_file":        meta.get("source_file"),
            "source_url":         meta.get("source_url"),
            "sebi_filing_date":   meta.get("sebi_filing_date"),
            "file_hash":          meta.get("file_hash"),
            "total_risks":        meta.get("total_risks"),
            "extraction_version": EXTRACTION_VERSION,
        }

        cur.execute(doc_sql, doc_params)
        if kind == "mysql":
            cur.execute("SELECT id FROM ipo_documents WHERE file_hash = %(file_hash)s", doc_params)
            doc_id = cur.fetchone()[0]
        else:
            doc_id = cur.fetchone()[0]

        logger.info(f"Upserted ipo_documents row id={doc_id} for {meta.get('source_file')}")

        risk_rows = [
            {
                "document_id": doc_id,
                "domain": r.get("domain"),
                "category": r.get("category"),
                "sub_category": r.get("sub_category"),
                "risk_nature": r.get("risk_nature"),
                "title": r.get("title"),
                "description": r.get("description"),
                "order_index": r.get("order_index"),
                "section_name": r.get("section_name"),
                "page_start": r.get("page_start"),
                "page_end": r.get("page_end"),
                "classification_method": r.get("classification_method"),
                "classification_confidence": r.get("classification_confidence"),
                "content_hash": r.get("content_hash"),
            }
            for r in document.get("risk_records", [])
        ]
        if risk_rows:
            cur.executemany(risk_sql, risk_rows)
        total += len(risk_rows)

    return total

def fetch_risks_by_document(database_url: str, document_id: int) -> List[dict]:
    """
    Fetch all risk records for a given document_id.
    """
    kind = database_kind(database_url)
    risks = []
    
    query = """
        SELECT 
            domain, category, sub_category, risk_nature,
            title, description, order_index,
            section_name, page_start, page_end,
            classification_method, classification_confidence,
            content_hash
        FROM risks
        WHERE document_id = %(document_id)s
        ORDER BY order_index ASC
    """
    
    if kind == "mysql":
        conn = _connect_mysql(database_url)
        try:
            with conn.cursor() as cur:
                cur.execute(query, {"document_id": document_id})
                columns = [col[0] for col in cur.description]
                for row in cur.fetchall():
                    risks.append(dict(zip(columns, row)))
        finally:
            conn.close()
    else:
        psycopg = _import_psycopg()
        # psycopg uses dict cursor via row_factory in psycopg 3, but let's do manual for safety
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(query, {"document_id": document_id})
                columns = [col.name for col in cur.description]
                for row in cur.fetchall():
                    risks.append(dict(zip(columns, row)))
                    
    return risks

def fetch_risks_by_domain(database_url: str, domain: str) -> List[dict]:
    """
    Fetch all risk records matching a given domain to establish a baseline.
    """
    kind = database_kind(database_url)
    risks = []
    
    query = """
        SELECT 
            domain, category, sub_category, risk_nature,
            title, description, order_index,
            section_name, page_start, page_end,
            classification_method, classification_confidence,
            content_hash
        FROM risks
        WHERE domain = %(domain)s
        ORDER BY order_index ASC
    """
    
    if kind == "mysql":
        conn = _connect_mysql(database_url)
        try:
            with conn.cursor() as cur:
                cur.execute(query, {"domain": domain})
                columns = [col[0] for col in cur.description]
                for row in cur.fetchall():
                    risks.append(dict(zip(columns, row)))
        finally:
            conn.close()
    else:
        psycopg = _import_psycopg()
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(query, {"domain": domain})
                columns = [col.name for col in cur.description]
                for row in cur.fetchall():
                    risks.append(dict(zip(columns, row)))
                    
    return risks

def fetch_baseline_documents_by_domain(database_url: str, domain: str) -> List[str]:
    """
    Fetch distinct company names from documents that have risks classified in a given domain.
    """
    kind = database_kind(database_url)
    companies = []
    
    query = """
        SELECT DISTINCT d.company_name
        FROM ipo_documents d
        JOIN risks r ON d.id = r.document_id
        WHERE r.domain = %(domain)s
          AND d.company_name IS NOT NULL
        ORDER BY d.company_name
    """
    
    if kind == "mysql":
        conn = _connect_mysql(database_url)
        try:
            with conn.cursor() as cur:
                cur.execute(query, {"domain": domain})
                for row in cur.fetchall():
                    companies.append(row[0])
        finally:
            conn.close()
    else:
        psycopg = _import_psycopg()
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(query, {"domain": domain})
                for row in cur.fetchall():
                    companies.append(row[0])
                    
    return companies
