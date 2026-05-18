# FirmsData Risk Analyzer

> IPO risk-factor intelligence for DRHP preparation and RHP-readiness review.

FirmsData Risk Analyzer is a focused diligence tool for teams preparing Indian IPO offer documents. It helps turn the Risk Factors section from a manually reviewed block of text into a structured, evidence-ready knowledge base that can support a cleaner DRHP and a more RHP-ready disclosure process.

The project can collect public SEBI DRHP/RHP filings, extract Risk Factors from PDFs, classify risks by domain and category, store them in a database, and review uploaded DRHP/RHP drafts against baseline market disclosures.

## FirmsData Positioning

FirmsData is building a proprietary IPO disclosure intelligence layer for companies, advisors, and diligence teams. This repository focuses on one high-value wedge: making the Risk Factors section easier to extract, compare, review, and improve before filing.

The brand promise is simple:

**Convert scattered IPO filing data into structured disclosure intelligence.**

## Why This Exists

The Risk Factors section is one of the most sensitive parts of an IPO filing. Generic, vague, duplicated, or unsupported risks can slow down review and weaken investor confidence.

This project is designed to help teams answer practical drafting questions:

- Which risk factors are present in this DRHP/RHP?
- Are the disclosures specific enough?
- Which risks are weak, generic, or missing?
- How does the draft compare with similar filed RHPs?
- What should be improved before the document becomes RHP-ready?

## Core Capabilities

- **Risk Factor extraction** from DRHP/RHP PDF files.
- **TOC-aware section detection** for locating the Risk Factors section.
- **Rule-based classification** by domain, category, sub-category, and risk nature.
- **Optional AI classification** using a local Ollama model.
- **SEBI filing collector** for building a baseline corpus of public DRHP/RHP documents.
- **Database persistence** for PostgreSQL and MySQL.
- **Comparative review** of uploaded drafts against domain-specific baseline risks.
- **DRHP rulebook checks** for materiality, specificity, quantification, vague language, cross-references, and category coverage.
- **Web UI** for uploading a DRHP/RHP and receiving per-risk feedback.
- **Audit reports** for structural observations, disclosure gaps, and improvement suggestions.

## Product Workflow

```mermaid
flowchart LR
    A["SEBI DRHP/RHP filings"] --> B["FirmsData Collector"]
    B --> C["IPO PDF corpus"]
    C --> D["Risk extraction engine"]
    D --> E["Disclosure classification"]
    E --> F["FirmsData knowledge base"]
    G["Uploaded DRHP/RHP draft"] --> H["Upload API"]
    H --> D
    F --> I["Baseline comparison"]
    L["DRHP rulebook knowledge layer"] --> J["Risk quality feedback"]
    I --> J
    J --> K["RHP-readiness improvements"]
```

## DRHP Rulebook Knowledge Layer

The analyzer includes a structured DRHP risk-factor rulebook derived from
practice guidance on drafting risk factors. The current rulebook is implemented
in `risk_analyzer/knowledge_base.py` and evaluates uploaded risks for:

- Materiality-led ordering
- Issuer-specific disclosure
- Data-backed quantification
- Vague or promotional wording
- Cross-references to supporting DRHP sections
- Coverage across recurring business, regulatory, financial, technology, and external risk categories

The upload API streams these findings with each risk card, and the database
schemas include optional knowledge-base tables for storing sources, rules,
examples, and review findings as the corpus expands.

## Repository Structure

```text
.
|-- collector.py                 # Collect SEBI DRHP/RHP listings and PDFs
|-- main.py                      # CLI entry point
|-- requirements.txt             # Python dependencies
|-- schema.sql                   # PostgreSQL schema
|-- schema.mysql.sql             # MySQL schema
|-- risk_analyzer/
|   |-- cli.py                   # Command-line interface
|   |-- pipeline.py              # End-to-end PDF analysis orchestration
|   |-- extractor.py             # Risk Factors section extraction
|   |-- classifier.py            # Risk classification logic
|   |-- auditor.py               # AI-assisted audit and feedback generation
|   |-- db.py                    # PostgreSQL/MySQL persistence
|   `-- server.py                # FastAPI app and upload API
`-- ui/
    |-- index.html               # Upload and review interface
    |-- app.js                   # Streaming analysis UI logic
    `-- style.css                # UI styling
```

## Quick Start

### 1. Create a virtual environment

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Update `.env` with your database URL:

```env
DATABASE_URL=mysql://root:password@localhost:3306/risk_analyzer
RISK_AI_MODEL=llama3
```

PostgreSQL URLs are also supported:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/risk_analyzer
```

### 3. Check the database connection

```bash
python main.py --check-db
```

For MySQL, the app uses `schema.mysql.sql`. For PostgreSQL, it uses `schema.sql`. The `--init-db` flag creates the schema as part of an ingestion run.

### 4. Analyze one PDF

```bash
python main.py path/to/document.pdf --output extracted_risks.json
```

### 5. Start the web app

```bash
python main.py --serve
```

Then open:

```text
http://localhost:8000
```

Upload a DRHP/RHP PDF and the UI will stream risk-level feedback as the analysis runs.

## Building a Baseline Corpus

Use the collector to gather public SEBI DRHP/RHP filings.

Collect a small test sample:

```bash
python collector.py --from-year 2025 --to-year 2026 --types rhp --max-pages 1 --max-downloads 5
```

Collect both DRHP and RHP filings:

```bash
python collector.py --from-year 2024 --to-year 2026 --types drhp rhp
```

This writes a manifest to:

```text
data/manifests/sebi_filings.json
```

and downloads PDFs under:

```text
data/raw_pdfs/
```

Analyze all downloaded filings from a manifest and insert them into the database:

```bash
python main.py --manifest data/manifests/sebi_filings.json --init-db
```

## AI-Assisted Review

The project can use a local Ollama model for:

- TOC boundary detection
- risk classification
- structural audit reports
- per-risk disclosure feedback
- comparison against baseline filings

Start Ollama locally and make sure the selected model is available:

```bash
ollama pull llama3
ollama serve
```

Then run with AI enabled:

```bash
python main.py path/to/document.pdf --use-ai
```

Generate an audit report for a stored document:

```bash
python main.py --audit-doc 109 --use-ai
```

The report is written as:

```text
audit_report_109.json
```

### Debug AI Prompts

Prompt logging is disabled by default because prompts can include uploaded
DRHP/RHP text. To log the full prompts sent to Ollama:

```bash
RISK_LOG_PROMPTS=1 python main.py --serve
```

By default, prompts are appended to:

```text
prompt_debug.log
```

You can override the path:

```bash
RISK_LOG_PROMPTS=1 RISK_PROMPT_LOG_FILE=logs/prompts.log python main.py --serve
```

## CLI Reference

```bash
python main.py [PDF ...] [options]
```

Common options:

| Option | Purpose |
|---|---|
| `--output FILE` | Write extracted risks to a JSON file. |
| `--database-url URL` | Override `DATABASE_URL` from `.env`. |
| `--manifest FILE` | Analyze downloaded filings from a SEBI collector manifest. |
| `--init-db` | Create or update database tables before inserting. |
| `--check-db` | Test database connectivity and exit. |
| `--audit-doc ID` | Generate an audit report for a stored document ID. |
| `--serve` | Start the FastAPI server and UI. |
| `--use-ai` | Use local Ollama-backed AI where supported. |
| `--log-level LEVEL` | Set logging level: `DEBUG`, `INFO`, `WARNING`, or `ERROR`. |

## Output Shape

For each analyzed document, the pipeline produces:

```json
{
  "metadata": {
    "source_file": "path/to/document.pdf",
    "file_hash": "sha256",
    "total_risks": 42,
    "company_name": "Example Limited",
    "document_type": "RHP",
    "ipo_year": 2026,
    "domain": "manufacturing"
  },
  "risk_factors": ["raw extracted risk text"],
  "risk_records": [
    {
      "domain": "manufacturing",
      "category": "operational",
      "sub_category": "supply chain",
      "risk_nature": "hybrid",
      "title": "Risk title",
      "description": "Risk description",
      "order_index": 1,
      "classification_method": "rules",
      "content_hash": "sha256"
    }
  ]
}
```

## RHP-Readiness Lens

FirmsData Risk Analyzer is intentionally centered on making the Risk Factors section more review-ready. A useful risk factor should be:

- company-specific, not boilerplate
- supported by source evidence
- quantified wherever the exposure is material
- aligned with financial, legal, business, and litigation sections
- comparable with risks disclosed by relevant peers
- clear about impact, dependency, uncertainty, and mitigation limits

The long-term knowledge-base advantage comes from storing extracted risks, classifications, baseline patterns, review comments, and improvement suggestions across filings.

## Data and Publishing Notes

Before publishing this repository, avoid committing:

- `.env` files or database credentials
- local virtual environments
- downloaded PDFs
- generated audit reports
- large extracted JSON outputs
- logs and cache files

The included `.gitignore` is set up for those artifacts.

## Important Disclaimer

This project is a drafting and review-support tool. It does not provide legal, regulatory, investment, or accounting advice. DRHP/RHP disclosures should be reviewed by qualified legal counsel, merchant bankers, auditors, and other responsible advisors before filing.
