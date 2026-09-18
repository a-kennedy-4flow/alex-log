"""Turns the breast milk reference into articles the rest of the tools already read.

One lactation window is one article. The brand is Muttermilch and the window is the
name. Because a) breast milk is what every one of these recipes is written against
b) it is not one milk but a milk that changes as the child grows c) an article per
window lets the same builder plot the change without a second code path.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "breastmilk.json"
COW = ROOT / "cowmilk.json"

BRAND = "Muttermilch"
CATEGORY = "Muttermilch"
LEGAL = "Muttermilch"
COW_BRAND = "Kuhmilch"
# a seven digit number no dm article holds, one past the last lactation window
COW_DAN = 9000011
# dm article numbers are seven digits and none of them starts with a nine.
DAN_BASE = 9000000
ENERGY_UNITS = ["kJ", "kcal"]


def german(value: float, digits: int = 3) -> str:
    """Print a number the way a German declaration prints it."""
    if value == 0:
        return "0"
    rounded = float(f"{value:.{digits}g}")
    text = f"{rounded:.12f}".rstrip("0").rstrip(".")
    whole, _, fraction = text.partition(".")
    grouped = f"{abs(int(whole)):,}".replace(",", ".")
    sign = "-" if rounded < 0 else ""
    return f"{sign}{grouped},{fraction}" if fraction else f"{sign}{grouped}"


def _order(unit: str) -> int:
    """Put the energy units the way a pack prints them and leave the rest alone."""
    return ENERGY_UNITS.index(unit) if unit in ENERGY_UNITS else len(ENERGY_UNITS)


def declaration(payload: dict[str, Any], window: str) -> dict[str, Any]:
    """Build the nutrition table of one lactation window.

    Several entries can share a name because the energy is printed in two units. They
    are gathered into one row so the table reads like the one on a pack.
    """
    basis = payload["basis"]
    rows: dict[str, list[tuple[str, float, dict[str, Any]]]] = {}
    for one in payload["nutrients"]:
        value = one["per_100_ml"].get(window)
        if value is None:
            continue
        rows.setdefault(one["name"], []).append((one["unit"], value, one))

    nutrients = []
    for name, found in rows.items():
        found.sort(key=lambda row: _order(row[0]))
        quantities = [
            {"value": float(f"{value:.3g}"), "unit": unit, "qualifier": None}
            for unit, value, _ in found
        ]
        text = " / ".join(f"{german(value)} {unit}" for unit, value, _ in found)
        # a figure that names no study is a figure nobody can check
        one = found[0][2]
        measurement = {"basis": basis, "text": text, "quantities": quantities,
                       "source": one["source"]}
        if one.get("note"):
            measurement["note"] = one["note"]
        if "low" in one and "high" in one:
            measurement["published_range"] = [one["low"], one["high"]]
        nutrients.append({"name": name, "measurements": [measurement]})
    return {"caption": payload["caption"], "bases": [basis], "nutrients": nutrients}


def products(path: Path = DATA) -> list[dict[str, Any]]:
    """Give back one article per lactation window in the shape the scraper writes."""
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    built = []
    for index, window in enumerate(payload["windows"], start=1):
        name = window["name"]
        built.append({
            "dan": DAN_BASE + index,
            "gtin": None,
            "brand": BRAND,
            "name": name,
            "full_name": f"{BRAND} {name}",
            "legal_category": LEGAL,
            "net_quantity": "",
            "category": CATEGORY,
            "url": payload.get("url", ""),
            "nutrition": declaration(payload, window["key"]),
        })
    return built


def cow_products(path: Path = COW) -> list[dict[str, Any]]:
    """Whole cow milk as one article in the shape the scraper writes.

    It does not change with the age of the child so it is one article rather than ten.
    Because a) a cow is not a mother b) the record is one composition c) it is here as
    what a Kindermilch is sold against rather than as a milk for an infant.
    """
    path = Path(path)
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows: dict[str, list[dict[str, Any]]] = {}
    for one in payload["nutrients"]:
        rows.setdefault(one["name"], []).append(one)
    nutrients = []
    for name, found in rows.items():
        found.sort(key=lambda one: _order(one["unit"]))
        quantities = [
            {"value": float(f"{one['per_100_ml']:.3g}"), "unit": one["unit"], "qualifier": None}
            for one in found
        ]
        measurement = {
            "basis": payload["basis"],
            "text": " / ".join(f"{german(one['per_100_ml'])} {one['unit']}" for one in found),
            "quantities": quantities,
            "source": found[0]["source"],
        }
        if found[0].get("note"):
            measurement["note"] = found[0]["note"]
        nutrients.append({"name": name, "measurements": [measurement]})
    name = f"Vollmilch ab dem {payload['warning']['from_month']}. Monat"
    return [{
        "dan": COW_DAN,
        "gtin": None,
        "brand": COW_BRAND,
        "name": name,
        "full_name": f"{COW_BRAND} {name}",
        "legal_category": "Kuhmilch",
        "net_quantity": "",
        "category": "Kuhmilch",
        "url": payload.get("url", ""),
        "nutrition": {"caption": payload["caption"], "bases": [payload["basis"]],
                      "nutrients": nutrients},
    }]


def cow_sources(path: Path = COW) -> dict[str, Any]:
    path = Path(path)
    return json.loads(path.read_text(encoding="utf-8"))["sources"] if path.exists() else {}


def cow_warning(path: Path = COW) -> dict[str, Any]:
    path = Path(path)
    return json.loads(path.read_text(encoding="utf-8"))["warning"] if path.exists() else {}


def sources(path: Path = DATA) -> dict[str, Any]:
    """The study behind every figure keyed the way a measurement names it."""
    return {**json.loads(Path(path).read_text(encoding="utf-8"))["sources"], **cow_sources()}


def cited_by(product: dict[str, Any]) -> list[str]:
    """Name every source key one article rests on in the order the table prints them."""
    seen: list[str] = []
    for nutrient in (product.get("nutrition") or {}).get("nutrients", []):
        for measurement in nutrient["measurements"]:
            key = measurement.get("source")
            if key and key not in seen:
                seen.append(key)
    return seen


def merge(collected: list[dict[str, Any]], path: Path = DATA) -> list[dict[str, Any]]:
    """Put the reference articles in front of the collected ones."""
    return products(path) + cow_products() + list(collected)


def available(path: Path = DATA) -> bool:
    return Path(path).exists()
