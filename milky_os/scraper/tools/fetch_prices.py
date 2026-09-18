#!/usr/bin/env python3
"""Collects a price per shop for every article in products.json.

    python3 tools/fetch_prices.py
    python3 tools/fetch_prices.py --site shop-apotheke.com --limit 10
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dmscrape.client import Cache, Client  # noqa: E402
from dmscrape.models import Product  # noqa: E402
from dmscrape.parse import nutrition_of  # noqa: E402
from dmscrape.prices import NAMES, collect_prices  # noqa: E402


def products_from(path: Path) -> list[Product]:
    """Rebuild the articles from the collected file without asking dm again."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    built = []
    for entry in payload["products"]:
        built.append(
            Product(
                dan=entry["dan"],
                gtin=entry.get("gtin"),
                brand=entry.get("brand", ""),
                name=entry.get("name", ""),
                legal_category=entry.get("legal_category", ""),
                net_quantity=entry.get("net_quantity", ""),
                category=entry.get("category", ""),
                url=entry.get("url", ""),
                nutrition=None,
            )
        )
    return built


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--products", type=Path, default=ROOT / "products.json")
    parser.add_argument("--out", type=Path, default=ROOT / "prices.json")
    parser.add_argument("--site", action="append", choices=NAMES, default=None)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--gap", type=float, default=1.0)
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    products = products_from(args.products)
    if args.limit:
        products = products[: args.limit]
    cache = None if args.no_cache else Cache(ROOT / ".cache")
    client = Client(gap=args.gap, cache=cache)
    run = collect_prices(client, products, args.site, None if args.quiet else print)
    args.out.write_text(
        json.dumps(run.to_dict(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    counts = run.coverage()
    total = sum(counts.values())
    print(f"{args.out} holds {total} offers over {len(run.quotes)} articles")
    for site in NAMES:
        print(f"  {site:<22} {counts.get(site, 0)}")
    print(f"{client.requests} requests {client.hits} cache hits {len(run.failures)} failures")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
