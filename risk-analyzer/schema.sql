-- ============================================================
-- FirmsData Risk Analyzer - Database Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS ipo_documents (
    id                   BIGSERIAL PRIMARY KEY,

    company_name         TEXT,
    document_type        TEXT,                          -- DRHP / RHP
    ipo_year             INT,

    source_file          TEXT,
    source_url           TEXT,
    sebi_filing_date     DATE,
    exchange             TEXT,

    file_hash            TEXT UNIQUE,
    total_risks          INT,

    extraction_version   TEXT,
    created_at           TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS risks (
    id                      BIGSERIAL PRIMARY KEY,

    document_id             BIGINT REFERENCES ipo_documents(id) ON DELETE CASCADE,

    -- Classification
    domain                  TEXT,
    category                TEXT,
    sub_category            TEXT,
    risk_nature             TEXT,

    -- Content
    title                   TEXT NOT NULL,
    description             TEXT,

    -- Ordering / location inside the source document
    order_index             INT,
    section_name            TEXT,                       -- internal risks / external risks / offer risks
    page_start              INT,
    page_end                INT,

    -- Extraction metadata
    classification_method   TEXT,                       -- rules / langchain
    classification_confidence NUMERIC(4,3),

    content_hash            TEXT,

    created_at              TIMESTAMP DEFAULT NOW(),

    UNIQUE (document_id, order_index)
);

-- ============================================================
-- Indexes
-- ============================================================

-- ipo_documents
CREATE INDEX IF NOT EXISTS idx_ipo_documents_company_name    ON ipo_documents (company_name);
CREATE INDEX IF NOT EXISTS idx_ipo_documents_ipo_year        ON ipo_documents (ipo_year);
CREATE INDEX IF NOT EXISTS idx_ipo_documents_document_type   ON ipo_documents (document_type);
CREATE INDEX IF NOT EXISTS idx_ipo_documents_exchange        ON ipo_documents (exchange);

-- risks
CREATE INDEX IF NOT EXISTS idx_risks_document_id             ON risks (document_id);
CREATE INDEX IF NOT EXISTS idx_risks_domain                  ON risks (domain);
CREATE INDEX IF NOT EXISTS idx_risks_category                ON risks (category);
CREATE INDEX IF NOT EXISTS idx_risks_section_name            ON risks (section_name);
CREATE INDEX IF NOT EXISTS idx_risks_classification_method   ON risks (classification_method);
