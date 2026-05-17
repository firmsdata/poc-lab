import argparse
import hashlib
import html
import http.client
import json
import logging
import re
import time
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from http.cookiejar import CookieJar
from pathlib import Path
from typing import Iterable, List, Optional


BASE_URL = "https://www.sebi.gov.in"
LISTING_URL = BASE_URL + "/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid={smid}&ssid=15"
AJAX_URL = BASE_URL + "/sebiweb/ajax/home/getnewslistinfo.jsp"

DOCUMENT_TYPES = {
    "drhp": {
        "smid": "10",
        "label": "Draft Offer Documents filed with SEBI",
        "document_type": "DRHP",
    },
    "rhp": {
        "smid": "11",
        "label": "Red Herring Documents filed with ROC",
        "document_type": "RHP",
    },
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; risk-analyzer/1.0; +https://www.sebi.gov.in/)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


@dataclass
class Filing:
    company_name: str
    document_type: str
    filing_date: str
    filing_year: int
    title: str
    sebi_page_url: str
    pdf_url: Optional[str] = None
    downloaded_path: Optional[str] = None
    file_hash: Optional[str] = None
    file_size: Optional[int] = None
    status: str = "listed"
    error: Optional[str] = None


def make_opener() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))


def fetch_text(opener: urllib.request.OpenerDirector, url: str, data: Optional[bytes] = None, referer: Optional[str] = None) -> str:
    headers = dict(HEADERS)
    if referer:
        headers["Referer"] = referer
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    request = urllib.request.Request(url, data=data, headers=headers)
    with opener.open(request, timeout=45) as response:
        return response.read().decode("utf-8", "ignore")


def fetch_bytes(opener: urllib.request.OpenerDirector, url: str, referer: Optional[str] = None) -> bytes:
    headers = dict(HEADERS)
    if referer:
        headers["Referer"] = referer
    request = urllib.request.Request(url, headers=headers)
    with opener.open(request, timeout=120) as response:
        data = response.read()
        content_length = response.headers.get("Content-Length")
        if content_length and len(data) != int(content_length):
            raise http.client.IncompleteRead(data, int(content_length) - len(data))
        return data


def post_listing_page(
    opener: urllib.request.OpenerDirector,
    config: dict,
    next_value: str,
    referer: str,
) -> str:
    data = urllib.parse.urlencode(
        {
            "nextValue": next_value,
            "next": "n",
            "search": "",
            "fromDate": "",
            "toDate": "",
            "fromYear": "",
            "toYear": "",
            "deptId": "-1",
            "sid": "3",
            "ssid": "15",
            "smid": config["smid"],
            "ssidhidden": "15",
            "intmid": "-1",
            "sText": "Filings",
            "ssText": "Public Issues",
            "smText": config["label"],
            "doDirect": "-1",
        }
    ).encode()
    response = fetch_text(opener, AJAX_URL, data=data, referer=referer)
    return response.split("#@#", 1)[0]


def parse_listing(html_text: str, document_type: str) -> List[Filing]:
    filings = []
    row_pattern = re.compile(
        r"<tr[^>]*>\s*<td>(?P<date>.*?)</td>\s*<td><a\s+href=[\"'](?P<href>[^\"']+)[\"'][^>]*title=[\"'](?P<title>[^\"']+)[\"'][^>]*>(?P<text>.*?)</a>",
        re.IGNORECASE | re.DOTALL,
    )

    for match in row_pattern.finditer(html_text):
        date_text = clean_text(match.group("date"))
        title = clean_text(match.group("title") or match.group("text"))
        parsed_date = parse_sebi_date(date_text)
        if parsed_date is None:
            continue

        page_url = urllib.parse.urljoin(BASE_URL, html.unescape(match.group("href")))
        filings.append(
            Filing(
                company_name=clean_company_name(title, document_type),
                document_type=document_type,
                filing_date=parsed_date.date().isoformat(),
                filing_year=parsed_date.year,
                title=title,
                sebi_page_url=page_url,
            )
        )

    return filings


def clean_text(value: str) -> str:
    value = re.sub(r"<.*?>", " ", value, flags=re.DOTALL)
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()


def clean_company_name(title: str, document_type: str) -> str:
    cleaned = re.sub(rf"(?i)\s*[-–]?\s*{re.escape(document_type)}\s*$", "", title).strip()
    cleaned = re.sub(r"(?i)\s*[-–]?\s*(corrigendum|addendum).*$", "", cleaned).strip()
    return cleaned or title


def parse_sebi_date(value: str) -> Optional[datetime]:
    try:
        return datetime.strptime(value, "%b %d, %Y")
    except ValueError:
        return None


def parse_next_value(html_text: str) -> Optional[str]:
    match = re.search(r"name=['\"]nextValue['\"]\s+value=['\"]?(\d+)", html_text)
    return match.group(1) if match else None


def parse_total_pages(html_text: str) -> Optional[int]:
    match = re.search(r"name=['\"]totalpage['\"]\s+value=['\"]?(\d+)", html_text)
    return int(match.group(1)) if match else None


def find_pdf_url(opener: urllib.request.OpenerDirector, filing: Filing) -> Optional[str]:
    page_html = fetch_text(opener, filing.sebi_page_url, referer=BASE_URL)
    pdf_matches = re.findall(r"https?://[^\"'<> ]+?\.pdf", page_html, flags=re.IGNORECASE)
    if pdf_matches:
        return html.unescape(pdf_matches[0])

    href_matches = re.findall(r"href=[\"']([^\"']+?\.pdf)[\"']", page_html, flags=re.IGNORECASE)
    if href_matches:
        return urllib.parse.urljoin(filing.sebi_page_url, html.unescape(href_matches[0]))

    return None


def safe_filename(filing: Filing) -> str:
    slug = filing.company_name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    filing_id = re.search(r"_(\d+)\.html$", filing.sebi_page_url)
    suffix = filing_id.group(1) if filing_id else hashlib.sha1(filing.sebi_page_url.encode()).hexdigest()[:10]
    return f"{filing.filing_date}-{slug}-{filing.document_type.lower()}-{suffix}.pdf"


def download_pdf(
    opener: urllib.request.OpenerDirector,
    filing: Filing,
    download_dir: Path,
    retries: int,
) -> Filing:
    if not filing.pdf_url:
        filing.pdf_url = find_pdf_url(opener, filing)
    if not filing.pdf_url:
        logging.warning(f"No PDF link found for {filing.title}")
        filing.status = "missing_pdf_url"
        filing.error = "No PDF link found on SEBI detail page"
        return filing

    target_dir = download_dir / str(filing.filing_year) / filing.document_type.lower()
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / safe_filename(filing)

    if target_path.exists() and target_path.stat().st_size > 0:
        pdf_bytes = target_path.read_bytes()
    else:
        last_error = None
        for attempt in range(1, retries + 1):
            try:
                pdf_bytes = fetch_bytes(opener, filing.pdf_url, referer=filing.sebi_page_url)
                target_path.write_bytes(pdf_bytes)
                break
            except Exception as exc:
                last_error = exc
                logging.warning(f"Attempt {attempt}/{retries} failed for {filing.title}: {exc}")
                time.sleep(min(2 * attempt, 10))
        else:
            filing.status = "download_failed"
            filing.error = str(last_error)
            return filing

    filing.downloaded_path = str(target_path)
    filing.file_size = len(pdf_bytes)
    filing.file_hash = hashlib.sha256(pdf_bytes).hexdigest()
    filing.status = "downloaded"
    filing.error = None
    return filing


def collect_document_type(
    document_key: str,
    from_year: int,
    to_year: int,
    max_pages: Optional[int],
) -> List[Filing]:
    config = DOCUMENT_TYPES[document_key]
    document_type = config["document_type"]
    opener = make_opener()
    listing_url = LISTING_URL.format(smid=config["smid"])

    logging.info(f"Collecting {document_type} listings from SEBI")
    first_html = fetch_text(opener, listing_url)
    pages_seen = 1
    next_value = parse_next_value(first_html) or "1"
    total_pages = parse_total_pages(first_html)

    filings = []
    should_continue = True
    current_html = first_html

    while should_continue:
        page_filings = parse_listing(current_html, document_type)
        for filing in page_filings:
            if filing.filing_year < from_year:
                should_continue = False
                break
            if from_year <= filing.filing_year <= to_year:
                filings.append(filing)

        logging.info(f"{document_type}: parsed page {pages_seen}, kept {len(filings)} filings so far")

        if not should_continue:
            break
        if max_pages is not None and pages_seen >= max_pages:
            break
        if total_pages is not None and pages_seen >= total_pages:
            break

        current_html = post_listing_page(opener, config, next_value, listing_url)
        next_value = parse_next_value(current_html) or str(int(next_value) + 1)
        pages_seen += 1
        time.sleep(0.5)

    return filings


def dedupe_filings(filings: Iterable[Filing]) -> List[Filing]:
    unique = []
    seen = set()
    for filing in filings:
        if filing.sebi_page_url in seen:
            continue
        seen.add(filing.sebi_page_url)
        unique.append(filing)
    return unique


def write_manifest(path: Path, filings: List[Filing]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "SEBI official public issues filings",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total_filings": len(filings),
        "downloaded_filings": sum(1 for filing in filings if filing.status == "downloaded"),
        "failed_filings": sum(1 for filing in filings if filing.status.endswith("failed") or filing.status == "missing_pdf_url"),
        "filings": [asdict(filing) for filing in filings],
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect official SEBI DRHP/RHP filings and PDFs.")
    parser.add_argument("--from-year", type=int, default=2018, help="Earliest filing year to include.")
    parser.add_argument("--to-year", type=int, default=datetime.now().year, help="Latest filing year to include.")
    parser.add_argument(
        "--types",
        nargs="+",
        choices=sorted(DOCUMENT_TYPES),
        default=["drhp", "rhp"],
        help="Document types to collect.",
    )
    parser.add_argument("--output", default="data/manifests/sebi_filings.json", help="Manifest JSON path.")
    parser.add_argument("--download-dir", default="data/raw_pdfs", help="Folder for downloaded PDFs.")
    parser.add_argument("--no-download", action="store_true", help="Only write manifest; do not download PDFs.")
    parser.add_argument("--max-pages", type=int, help="Limit listing pages per document type for testing.")
    parser.add_argument("--max-downloads", type=int, help="Limit PDF downloads for testing.")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between filing PDF requests.")
    parser.add_argument("--download-retries", type=int, default=3, help="PDF download attempts per filing.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    all_filings = []

    for document_key in args.types:
        all_filings.extend(
            collect_document_type(
                document_key=document_key,
                from_year=args.from_year,
                to_year=args.to_year,
                max_pages=args.max_pages,
            )
        )

    filings = dedupe_filings(all_filings)

    if not args.no_download:
        download_dir = Path(args.download_dir)
        opener = make_opener()
        download_filings = filings[:args.max_downloads] if args.max_downloads else filings
        for index, filing in enumerate(download_filings, start=1):
            logging.info(f"Downloading {index}/{len(download_filings)}: {filing.title}")
            try:
                download_pdf(opener, filing, download_dir, retries=args.download_retries)
            except Exception as exc:
                logging.warning(f"Download failed for {filing.title}: {exc}")
                filing.status = "download_failed"
                filing.error = str(exc)
            time.sleep(args.delay)

    write_manifest(Path(args.output), filings)
    logging.info(f"Wrote manifest with {len(filings)} filings to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
