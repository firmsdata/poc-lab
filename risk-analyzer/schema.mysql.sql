-- ============================================================
-- FirmsData Risk Analyzer - MySQL Database Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS ipo_documents (
    id                   BIGINT AUTO_INCREMENT PRIMARY KEY,

    company_name         VARCHAR(255),
    document_type        VARCHAR(20),
    ipo_year             INT,

    source_file          TEXT,
    source_url           TEXT,
    sebi_filing_date     DATE,
    exchange             VARCHAR(100),

    file_hash            VARCHAR(64) UNIQUE,
    total_risks          INT,

    extraction_version   VARCHAR(50),
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS risks (
    id                          BIGINT AUTO_INCREMENT PRIMARY KEY,

    document_id                 BIGINT,

    domain                      VARCHAR(100),
    category                    VARCHAR(100),
    sub_category                VARCHAR(150),
    risk_nature                 VARCHAR(50),

    title                       TEXT NOT NULL,
    description                 LONGTEXT,

    order_index                 INT,
    section_name                VARCHAR(150),
    page_start                  INT,
    page_end                    INT,

    classification_method       VARCHAR(50),
    classification_confidence   DECIMAL(4,3),

    content_hash                VARCHAR(64),

    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_risks_document
        FOREIGN KEY (document_id)
        REFERENCES ipo_documents(id)
        ON DELETE CASCADE,

    UNIQUE KEY uq_risks_document_order (document_id, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_sources (
    id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
    title                VARCHAR(255) NOT NULL,
    publisher            VARCHAR(255),
    source_url           TEXT,
    source_type          VARCHAR(50) DEFAULT 'article',
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_knowledge_sources_url (source_url(768))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kb_rules (
    id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
    source_id            BIGINT,
    code                 VARCHAR(100) NOT NULL,
    title                VARCHAR(255) NOT NULL,
    category             VARCHAR(100),
    severity             VARCHAR(50),
    guidance             TEXT NOT NULL,
    weak_pattern         TEXT,
    preferred_pattern    TEXT,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_kb_rules_source
        FOREIGN KEY (source_id)
        REFERENCES knowledge_sources(id)
        ON DELETE SET NULL,

    UNIQUE KEY uq_kb_rules_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kb_examples (
    id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
    rule_id              BIGINT,
    weak_disclosure      TEXT,
    improved_disclosure  TEXT,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_kb_examples_rule
        FOREIGN KEY (rule_id)
        REFERENCES kb_rules(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS risk_review_findings (
    id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
    risk_id              BIGINT,
    rule_id              BIGINT,
    severity             VARCHAR(50),
    message              TEXT,
    suggestion           TEXT,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_review_findings_risk
        FOREIGN KEY (risk_id)
        REFERENCES risks(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_review_findings_rule
        FOREIGN KEY (rule_id)
        REFERENCES kb_rules(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_ipo_documents_company_name    ON ipo_documents (company_name);
CREATE INDEX idx_ipo_documents_ipo_year        ON ipo_documents (ipo_year);
CREATE INDEX idx_ipo_documents_document_type   ON ipo_documents (document_type);
CREATE INDEX idx_ipo_documents_exchange        ON ipo_documents (exchange);

CREATE INDEX idx_risks_document_id             ON risks (document_id);
CREATE INDEX idx_risks_domain                  ON risks (domain);
CREATE INDEX idx_risks_category                ON risks (category);
CREATE INDEX idx_risks_section_name            ON risks (section_name);
CREATE INDEX idx_risks_classification_method   ON risks (classification_method);

CREATE INDEX idx_kb_rules_category             ON kb_rules (category);
CREATE INDEX idx_kb_rules_severity             ON kb_rules (severity);
CREATE INDEX idx_risk_review_findings_risk_id  ON risk_review_findings (risk_id);
