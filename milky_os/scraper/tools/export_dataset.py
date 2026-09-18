#!/usr/bin/env python3
"""Writes the one dataset the Vue 3 app renders from.

The app never reads products.json. Because a) that file is 2,6 MB of declaration text
b) the app only needs the comparable figures c) one compact file keeps the server render
inside a few milliseconds.

    python3 tools/export_dataset.py
"""

from __future__ import annotations

import argparse
import collections
import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import compare_data  # noqa: E402
import reference  # noqa: E402
from make_page import pack_size, ready_to_drink, repacks, short_name  # noqa: E402

APP = ROOT.parent / "scraper2" / "server" / "assets"
# A brand past this rank carries no hue of its own.
NAMED_BRANDS = 8


def windows_of(compared: dict) -> list[dict]:
    """The lactation windows with the months each one covers."""
    out = []
    for article in compared["articles"]:
        if article["stage"] != compare_data.MOTHER:
            continue
        span = compare_data.age_span(article["name"])
        if span and span[1] is not None:
            out.append({"dan": article["dan"], "variant": article["variant"],
                        "from": span[0], "to": span[1]})
    return sorted(out, key=lambda one: one["from"])


def kilo_price(offer: dict) -> float | None:
    return offer.get("per_kilo")


def cheapest(offers: list[dict]) -> dict | None:
    priced = [o for o in offers if kilo_price(o) is not None]
    return min(priced, key=kilo_price) if priced else None


def median(values: list[float]) -> float | None:
    return statistics.median(values) if values else None


def build(products: list[dict], quotes: dict[int, list[dict]]) -> dict:
    compared = compare_data.build(products)
    articles = compared["articles"]
    for article in articles:
        offers = quotes.get(article["dan"], [])
        article["offers"] = offers
        best = cheapest(offers)
        article["kilo_price"] = kilo_price(best) if best else None
        article["price"] = best["price"] if best else None

    # A share of the step median is the figure every chart draws.
    medians: dict[str, dict[str, float]] = {}
    for stage in compared["stages"]:
        step = [a for a in articles if a["stage"] == stage]
        values = {}
        for nutrient in compared["nutrients"]:
            name = nutrient["name"]
            declared = [a["values"][name] for a in step if name in a["values"]]
            if len(declared) >= 2:
                values[name] = statistics.median(declared)
        prices = [a["kilo_price"] for a in step if a["kilo_price"]]
        values["__price__"] = median(prices) or 0.0
        medians[stage] = values

    counts = collections.Counter(a["brand"] for a in articles)
    ranked = [brand for brand, _ in counts.most_common()]
    brands = [
        {"name": brand, "articles": counts[brand], "slot": min(index, NAMED_BRANDS)}
        for index, brand in enumerate(ranked)
    ]

    covered = collections.Counter()
    for offers in quotes.values():
        for offer in offers:
            covered[offer["site"]] += 1

    return {
        "gathered_on": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "stages": compared["stages"],
        "nutrients": compared["nutrients"],
        "brands": brands,
        "articles": articles,
        "medians": medians,
        "skipped": compared["skipped"],
        "sites": [{"name": site, "offers": count} for site, count in covered.most_common()],
        # every figure names where it came from so the article page can cite it
        "sources": reference.sources() if reference.available() else {},
        # what a reference has to be read with rather than only what is in it
        "warnings": {compare_data.COW: reference.cow_warning()}
                    if reference.cow_warning() else {},
        # the pairing of a step with the lactation windows of the same age, and the
        # windows themselves, so the app can draw against the milk rather than only
        # against the median of a step
        "against": compare_data.against(compared),
        "windows": windows_of(compared),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--products", type=Path, default=ROOT / "products.json")
    parser.add_argument("--prices", type=Path, default=ROOT / "prices.json")
    parser.add_argument("--out", type=Path, default=APP / "dataset.json")
    parser.add_argument("--ready-to-drink", action="store_true")
    parser.add_argument("--repacks", action="store_true")
    parser.add_argument("--no-reference", action="store_true")
    args = parser.parse_args(argv)

    products = json.loads(args.products.read_text(encoding="utf-8"))["products"]
    if not args.no_reference and reference.available():
        products = reference.merge(products)
    kept = [p for p in products if p.get("nutrition")]
    if not args.ready_to_drink:
        kept = [p for p in kept if not ready_to_drink(p)]
    if not args.repacks:
        dropped = repacks(kept)
        kept = [p for p in kept if p["dan"] not in dropped]

    quotes: dict[int, list[dict]] = {}
    if args.prices.exists():
        for quote in json.loads(args.prices.read_text(encoding="utf-8"))["quotes"]:
            quotes[quote["dan"]] = quote["offers"]

    dataset = build(kept, quotes)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(dataset, ensure_ascii=False) + "\n", encoding="utf-8")
    size = args.out.stat().st_size
    priced = sum(1 for a in dataset["articles"] if a["kilo_price"])
    print(f"{args.out} {size // 1024} kB")
    print(f"  {len(dataset['articles'])} articles over {len(dataset['brands'])} brands")
    print(f"  {priced} carry a price over {len(dataset['sites'])} sites")
    print(f"  {len(dataset['nutrients'])} nutrients over {len(dataset['stages'])} age steps")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
