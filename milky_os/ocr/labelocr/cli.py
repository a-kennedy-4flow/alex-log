"""Command line front end."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .models import Label
from .reader import read_label

FIELD_WIDTH = 18


def _line(name: str, value: str) -> str:
    return f"  {name:<{FIELD_WIDTH}}{value}"


def report(label: Label, path: Path, show_rows: bool = False) -> str:
    out = [f"{path.name}  [confidence {label.confidence:.2f}]"]
    for warning in label.warnings:
        out.append(_line("warning", warning))
    out.append(_line("product", label.product_name or "-"))
    out.append(_line("net quantity", str(label.net_quantity) if label.net_quantity else "-"))
    if label.best_before:
        out.append(_line("best before", label.best_before))
    if label.use_by:
        out.append(_line("use by", label.use_by))
    if label.barcode:
        out.append(_line("barcode", label.barcode))
    if label.storage:
        out.append(_line("storage", label.storage))
    out.append(_line("allergens", ", ".join(label.allergens) if label.allergens else "none found"))
    if label.may_contain:
        out.append(_line("may contain", ", ".join(label.may_contain)))
    if label.ingredients:
        out.append(_line("ingredients", label.ingredients))
    if label.nutrition:
        heading = label.nutrition_basis or "per 100 g"
        if label.serving:
            heading = f"{heading}   {label.serving}"
        out.append(f"  nutrition ({heading})")
        for nutrient in label.nutrition:
            per_100 = str(nutrient.per_100) if nutrient.per_100 else "-"
            per_serving = str(nutrient.per_serving) if nutrient.per_serving else ""
            out.append(f"    {nutrient.name:<20}{per_100:>12}  {per_serving:>12}".rstrip())
    if show_rows:
        out.append("  rows")
        for row in label.rows:
            out.append(f"    [{row.confidence:.2f}] {row.text}")
    return "\n".join(out)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="labelocr",
        description="Read food label photographs and pull out the declared information.",
    )
    parser.add_argument("images", nargs="+", type=Path, help="label photographs to read")
    parser.add_argument("--json", action="store_true", help="write JSON instead of a report")
    parser.add_argument("--rows", action="store_true", help="include the raw OCR rows")
    parser.add_argument("--enhance", action="store_true", help="add contrast and sharpening before reading")
    parser.add_argument("--min-confidence", type=float, default=0.3, help="drop text below this score")
    parser.add_argument("--out", type=Path, help="write to this file instead of stdout")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    results = []
    reports = []
    failures = 0
    for path in args.images:
        if not path.exists():
            print(f"{path}: no such file", file=sys.stderr)
            failures += 1
            continue
        label = read_label(path, enhance=args.enhance, min_confidence=args.min_confidence)
        if args.json:
            entry = label.to_dict(include_rows=args.rows)
            entry["image"] = str(path)
            results.append(entry)
        else:
            reports.append(report(label, path, show_rows=args.rows))

    if args.json:
        text = json.dumps(results if len(results) != 1 else results[0], indent=2, ensure_ascii=False)
    else:
        text = "\n\n".join(reports)

    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    return 1 if failures else 0
