"""
main.py — entry point (delegates to the risk_analyzer package CLI)

Usage
-----
    python main.py [PDF ...] [--output FILE] [--use-ai] [--database-url URL]
"""
from risk_analyzer.cli import main

if __name__ == "__main__":
    main()
