"""
Dangerous maintenance helper for clearing all stored analysis data.

Usage:
    python delete_all.py --yes
"""
from __future__ import annotations

import argparse
from urllib.parse import unquote, urlparse

import pymysql

from risk_analyzer.db import get_database_url


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Delete all IPO document and risk rows.")
    parser.add_argument("--yes", action="store_true", help="Confirm destructive deletion.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.yes:
        print("Refusing to delete data. Re-run with --yes to confirm.")
        return 1

    database_url = get_database_url()
    if not database_url:
        print("DATABASE_URL is not set.")
        return 1

    parsed = urlparse(database_url)
    if parsed.scheme not in {"mysql", "mysql+pymysql"}:
        print("delete_all.py currently supports MySQL DATABASE_URL values only.")
        return 1

    conn = pymysql.connect(
        host=parsed.hostname or "localhost",
        port=parsed.port or 3306,
        user=unquote(parsed.username or ""),
        password=unquote(parsed.password or ""),
        database=(parsed.path or "/").lstrip("/"),
        charset="utf8mb4",
        autocommit=False,
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SET FOREIGN_KEY_CHECKS = 0;")
            cur.execute("TRUNCATE TABLE risks;")
            cur.execute("TRUNCATE TABLE ipo_documents;")
            cur.execute("SET FOREIGN_KEY_CHECKS = 1;")
        conn.commit()
        print("Deleted all records successfully.")
        return 0
    except Exception as exc:
        conn.rollback()
        print(f"Error: {exc}")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
