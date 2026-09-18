"""Command line front end."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any, Iterator, Sequence

from .client import Cache, Client
from .listing import BABY_MILK
from .models import Nutrient, Product
from .scrape import Result, collect, scrape_category

NAME_WIDTH = 38
VALUE_WIDTH = 34
CSV_COLUMNS = [
    "dan",
    "gtin",
    "brand",
    "name",
    "legal_category",
    "net_quantity",
    "url",
    "basis",
    "nutrient",
    "text",
    "value",
    "unit",
    "qualifier",
]


def rows_of(product: Product) -> Iterator[dict[str, Any]]:
    """Give back one row per declared number."""
    if product.nutrition is None:
        return
    head = {
        "dan": product.dan,
        "gtin": product.gtin,
        "brand": product.brand,
        "name": product.name,
        "legal_category": product.legal_category,
        "net_quantity": product.net_quantity,
        "url": product.url,
    }
    for nutrient in product.nutrition.nutrients:
        for measurement in nutrient.measurements:
            shared = {
                **head,
                "basis": measurement.basis,
                "nutrient": nutrient.name,
                "text": measurement.text,
            }
            if not measurement.quantities:
                yield {**shared, "value": "", "unit": "", "qualifier": ""}
                continue
            for quantity in measurement.quantities:
                yield {
                    **shared,
                    "value": quantity.value,
                    "unit": quantity.unit,
                    "qualifier": quantity.qualifier,
                }


def write_csv(result: Result, path: Path) -> int:
    written = 0
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for product in result.products:
            for row in rows_of(product):
                writer.writerow(row)
                written += 1
    return written


def _heading(bases: list[str]) -> str:
    """Set each basis over the column it heads.

    Because a) a basis such as "pro 100 ml des verzehrfertigen Erzeugnisses" is wider
    than its column b) padding it on the left would push the whole line out of place
    c) ending it on the right edge of its column keeps every value under its own words.
    """
    line = ""
    for index, basis in enumerate(bases):
        edge = 4 + NAME_WIDTH + (index + 1) * VALUE_WIDTH + index
        line = line[: max(0, edge - len(basis))].ljust(max(0, edge - len(basis))) + basis
    return line


def _cells(bases: list[str], nutrient: Nutrient) -> str:
    """Put each measurement under the basis it belongs to."""
    texts = []
    for basis in bases:
        measurement = nutrient.under(basis)
        texts.append(f"{measurement.text if measurement else '':>{VALUE_WIDTH}}")
    return " ".join(texts)


def report(product: Product) -> str:
    out = [f"{product.full_name}  [dan {product.dan}]"]
    out.append(f"  {'legal category':<16}{product.legal_category or '-'}")
    out.append(f"  {'net quantity':<16}{product.net_quantity or '-'}")
    out.append(f"  {'url':<16}{product.url or '-'}")
    table = product.nutrition
    if table is None:
        out.append("  no nutrition declaration was published")
        return "\n".join(out)
    out.append(f"  {table.caption or 'nutrition'}")
    if table.bases:
        out.append(_heading(table.bases))
    for nutrient in table.nutrients:
        cells = _cells(table.bases, nutrient)
        out.append(f"    {nutrient.name:<{NAME_WIDTH}}{cells}".rstrip())
    return "\n".join(out)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="dmscrape",
        description="Collect dm article names and nutrition declarations.",
    )
    parser.add_argument(
        "--category",
        default=BABY_MILK,
        help=f"dm category code to walk (default {BABY_MILK} which is Babymilch)",
    )
    parser.add_argument("--query", default="", help="free text to narrow the listing")
    parser.add_argument(
        "--dan",
        type=int,
        action="append",
        default=[],
        help="read one article number instead of a listing (repeatable)",
    )
    parser.add_argument("--limit", type=int, help="stop after this many articles")
    parser.add_argument("--out", default="products.json", help="JSON output path or - for stdout")
    parser.add_argument("--csv", type=Path, help="also write one row per declared number")
    parser.add_argument("--report", action="store_true", help="print a readable table per article")
    parser.add_argument("--gap", type=float, default=1.0, help="seconds between requests")
    parser.add_argument("--tries", type=int, default=6, help="attempts per request")
    parser.add_argument("--cache", type=Path, default=Path(".cache"), help="response cache directory")
    parser.add_argument("--no-cache", action="store_true", help="always ask the service")
    parser.add_argument("--quiet", action="store_true", help="hide progress")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    progress = None if args.quiet else (lambda message: print(message, file=sys.stderr))
    client = Client(
        gap=args.gap,
        tries=args.tries,
        cache=None if args.no_cache else Cache(args.cache),
    )

    if args.dan:
        result = collect(client, args.dan, progress, len(args.dan))
    else:
        result = scrape_category(client, args.category, args.query, args.limit, progress)

    payload = json.dumps(result.to_dict(), ensure_ascii=False, indent=2)
    if args.out == "-":
        print(payload)
    else:
        Path(args.out).write_text(payload + "\n", encoding="utf-8")

    if args.csv:
        written = write_csv(result, args.csv)
        if progress:
            progress(f"wrote {written} rows to {args.csv}")

    if args.report:
        print("\n\n".join(report(product) for product in result.products))

    if progress:
        blank = len(result.without_nutrition)
        progress(
            f"collected {len(result.products)} articles "
            f"({blank} without a declaration) "
            f"with {len(result.failures)} failures "
            f"in {client.requests} requests and {client.hits} cache hits"
        )
    return 1 if result.failures else 0
