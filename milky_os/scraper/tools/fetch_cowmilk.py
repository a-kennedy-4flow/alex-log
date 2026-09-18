#!/usr/bin/env python3
"""Builds the cow milk reference from a published food composition record.

    python3 tools/fetch_cowmilk.py
    python3 tools/fetch_cowmilk.py --no-cache

Writes `cowmilk.json`. Whole milk is what a child moves on to after the last Kindermilch
so it is the reference the twelve month steps are read against. It is not a milk for an
infant and the record says so on its face.
"""

from __future__ import annotations

import argparse
import datetime
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Unfortified whole milk. German Vollmilch carries no added vitamin A or D so the
# unfortified record is the one that matches the shelf here.
FDC_ID = 172217
FOOD = "https://api.nal.usda.gov/fdc/v1/food/{fdc}?api_key={key}"
PAGE = "https://fdc.nal.usda.gov/food-details/{fdc}/nutrients"
USER_AGENT = "milky_os cow milk reference builder"

# Whole milk runs a little denser than water so 100 ml weighs a little over 100 g.
DENSITY = 1.032
KCAL_IN_KJ = 4.184
SALT_IN_SODIUM = 2.5
IU_IN_MICROGRAM = 0.025  # of vitamin D

# What the record calls a nutrient against what a pack calls it, with the unit a pack
# declares it in. A factor turns the published unit into that one.
AS_PUBLISHED = [
    ("Energy", "kcal", "Brennwert", "kcal", 1.0),
    ("Protein", "g", "Eiweiß", "g", 1.0),
    ("Total lipid (fat)", "g", "Fett", "g", 1.0),
    ("Fatty acids, total saturated", "g", "davon gesättigte Fettsäuren", "g", 1.0),
    ("Fatty acids, total monounsaturated", "g", "davon einfach ungesättigte Fettsäuren", "g", 1.0),
    ("Fatty acids, total polyunsaturated", "g", "davon mehrfach ungesättigte Fettsäuren", "g", 1.0),
    ("Carbohydrate, by difference", "g", "Kohlenhydrate", "g", 1.0),
    ("Total Sugars", "g", "davon Zucker", "g", 1.0),
    ("Lactose", "g", "Laktose", "g", 1.0),
    ("Fiber, total dietary", "g", "Ballaststoffe", "g", 1.0),
    ("Galactose", "g", "Galactose", "g", 1.0),
    ("PUFA 18:2", "g", "Linolsäure", "g", 1.0),
    ("PUFA 18:3", "g", "Alpha-Linolensäure", "g", 1.0),
    ("PUFA 20:4", "g", "Arachidonsäure", "mg", 1000.0),
    ("PUFA 22:6 n-3 (DHA)", "g", "Docosahexaensäure (DHA)", "mg", 1000.0),
    ("Sodium, Na", "mg", "Natrium", "mg", 1.0),
    ("Potassium, K", "mg", "Kalium", "mg", 1.0),
    ("Calcium, Ca", "mg", "Calcium", "mg", 1.0),
    ("Magnesium, Mg", "mg", "Magnesium", "mg", 1.0),
    ("Phosphorus, P", "mg", "Phosphor", "mg", 1.0),
    ("Iron, Fe", "mg", "Eisen", "mg", 1.0),
    ("Zinc, Zn", "mg", "Zink", "mg", 1.0),
    ("Copper, Cu", "mg", "Kupfer", "mg", 1.0),
    ("Manganese, Mn", "mg", "Mangan", "mg", 1.0),
    ("Selenium, Se", "µg", "Selen", "µg", 1.0),
    ("Vitamin A, RAE", "µg", "Vitamin A", "µg", 1.0),
    ("Vitamin C, total ascorbic acid", "mg", "Vitamin C", "mg", 1.0),
    ("Vitamin D (D2 + D3)", "µg", "Vitamin D", "µg", 1.0),
    ("Vitamin E (alpha-tocopherol)", "mg", "Vitamin E", "mg", 1.0),
    ("Vitamin K (phylloquinone)", "µg", "Vitamin K", "µg", 1.0),
    ("Thiamin", "mg", "Vitamin B 1, Thiamin", "mg", 1.0),
    ("Riboflavin", "mg", "Vitamin B 2, Riboflavin", "mg", 1.0),
    ("Niacin", "mg", "Niacin", "mg", 1.0),
    ("Pantothenic acid", "mg", "Pantothensäure", "mg", 1.0),
    ("Vitamin B-6", "mg", "Vitamin B 6", "mg", 1.0),
    ("Folate, total", "µg", "Folat, gesamt", "µg", 1.0),
    ("Vitamin B-12", "µg", "Vitamin B 12", "µg", 1.0),
    ("Choline, total", "mg", "Cholin, gesamt", "mg", 1.0),
]

SOURCES = {
    "usda": {
        "citation": (
            "Milk, whole, 3.25% milkfat, without added vitamin A and vitamin D. "
            "FoodData Central SR Legacy, FDC ID 172217. Washington (DC): "
            "US Department of Agriculture, Agricultural Research Service; 2019."
        ),
        "url": PAGE.format(fdc=FDC_ID),
        "note": (
            "A United States reference for a German shelf. German Vollmilch is sold at "
            "3,5% fat against the 3,25% of this record and neither is fortified."
        ),
    },
    "espghan": {
        "citation": (
            "Domellöf M, Braegger C, Campoy C, Colomb V, Decsi T, Fewtrell M, et al. "
            "Iron requirements of infants and toddlers. A position paper by the ESPGHAN "
            "Committee on Nutrition. J Pediatr Gastroenterol Nutr. 2014;58(1):119-129."
        ),
        "doi": "10.1097/mpg.0000000000000206",
        "quote": (
            "Unmodified cow's milk should not be fed as the main milk drink to infants "
            "before the age of 12 months and intake should be limited to <500 mL/day in "
            "toddlers."
        ),
    },
}

WARNING = {
    "from_month": 12,
    "says": (
        "Whole cow milk is not a milk for an infant. ESPGHAN says it should not be the "
        "main drink before twelve months and should stay under 500 ml a day after that. "
        "It is here as the thing a Kindermilch is sold against rather than as an option "
        "for a younger child."
    ),
    "source": "espghan",
}


def fetch(cache: Path | None) -> dict[str, Any]:
    """Ask the food composition database for the record."""
    if cache is not None:
        kept = cache / f"fdc-{FDC_ID}.json"
        if kept.exists():
            return json.loads(kept.read_text(encoding="utf-8"))
    url = FOOD.format(fdc=FDC_ID, key="DEMO_KEY")
    request = urllib.request.Request(url, headers={"user-agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=90) as answer:
        body = json.loads(answer.read().decode("utf-8"))
    if cache is not None:
        cache.mkdir(parents=True, exist_ok=True)
        (cache / f"fdc-{FDC_ID}.json").write_text(json.dumps(body, ensure_ascii=False),
                                                  encoding="utf-8")
    return body


def published(record: dict[str, Any]) -> dict[tuple[str, str], float]:
    """Every figure the record carries keyed by its name and unit."""
    out: dict[tuple[str, str], float] = {}
    for one in record.get("foodNutrients", []):
        amount = one.get("amount")
        if amount is None:
            continue
        nutrient = one["nutrient"]
        unit = nutrient["unitName"].replace("UG", "µg").replace("MG", "mg").replace("G", "g")
        out[(nutrient["name"], unit.lower())] = float(amount)
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "cowmilk.json")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    say = (lambda *_: None) if args.quiet else print
    record = fetch(None if args.no_cache else ROOT / ".cache" / "science")
    figures = published(record)
    say(f"{record['description']} holds {len(figures)} figures")

    built = []
    missing = []
    for name, unit, printed, wanted, factor in AS_PUBLISHED:
        value = figures.get((name, unit.lower()))
        if value is None:
            missing.append(f"{name} ({unit})")
            continue
        # the record counts per 100 g and a pack declares per 100 ml
        built.append({"name": printed, "source": "usda", "unit": wanted,
                      "per_100_ml": value * DENSITY * factor})
        if printed == "Brennwert":
            built.insert(len(built) - 1, {
                "name": "Brennwert", "source": "usda", "unit": "kJ",
                "per_100_ml": value * DENSITY * KCAL_IN_KJ,
                "note": "the published kilocalorie at 4,184 kJ per kcal"})

    # The record works carbohydrate out by difference and measures the sugars, so the
    # sugars can come out above the total. Both are passed through as published.
    carb = next((one for one in built if one["name"] == "Kohlenhydrate"), None)
    sugar = next((one for one in built if one["name"] == "davon Zucker"), None)
    if carb and sugar and sugar["per_100_ml"] > carb["per_100_ml"]:
        carb["note"] = (
            "the record works this out by difference from the water protein fat and ash "
            "while it measures the sugars, so the sugars come out above the total. Neither "
            "was corrected"
        )

    sodium = next((one for one in built if one["name"] == "Natrium"), None)
    if sodium:
        built.append({"name": "Salz", "source": "usda", "unit": "g",
                      "per_100_ml": sodium["per_100_ml"] * SALT_IN_SODIUM / 1000.0,
                      "note": "the sodium times 2,5 which is how a label derives it"})

    payload = {
        "caption": "Nährwerte der Vollmilch",
        "basis": "pro 100 ml",
        "built_on": datetime.date.today().isoformat(),
        "density": DENSITY,
        "fdc_id": FDC_ID,
        "description": record["description"],
        "url": PAGE.format(fdc=FDC_ID),
        "warning": WARNING,
        "sources": SOURCES,
        "nutrients": built,
    }
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n",
                        encoding="utf-8")
    say(f"{args.out} holds {len(built)} declared rows")
    if missing:
        say(f"  the record carries no {', '.join(missing)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
