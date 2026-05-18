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

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS knowledge_sources (
    id                   BIGSERIAL PRIMARY KEY,
    title                TEXT NOT NULL,
    publisher            TEXT,
    source_url           TEXT UNIQUE,
    source_type          TEXT DEFAULT 'article',
    created_at           TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kb_rules (
    id                   BIGSERIAL PRIMARY KEY,
    source_id            BIGINT REFERENCES knowledge_sources(id) ON DELETE SET NULL,
    code                 TEXT UNIQUE NOT NULL,
    title                TEXT NOT NULL,
    category             TEXT,
    severity             TEXT,
    guidance             TEXT NOT NULL,
    weak_pattern         TEXT,
    preferred_pattern    TEXT,
    created_at           TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kb_examples (
    id                   BIGSERIAL PRIMARY KEY,
    rule_id              BIGINT REFERENCES kb_rules(id) ON DELETE CASCADE,
    weak_disclosure      TEXT,
    improved_disclosure  TEXT,
    created_at           TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS risk_review_findings (
    id                   BIGSERIAL PRIMARY KEY,
    risk_id              BIGINT REFERENCES risks(id) ON DELETE CASCADE,
    rule_id              BIGINT REFERENCES kb_rules(id) ON DELETE SET NULL,
    severity             TEXT,
    message              TEXT,
    suggestion           TEXT,
    created_at           TIMESTAMP DEFAULT NOW()
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

-- knowledge base
CREATE INDEX IF NOT EXISTS idx_kb_rules_category             ON kb_rules (category);
CREATE INDEX IF NOT EXISTS idx_kb_rules_severity             ON kb_rules (severity);
CREATE INDEX IF NOT EXISTS idx_risk_review_findings_risk_id  ON risk_review_findings (risk_id);
