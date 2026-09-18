#!/usr/bin/env python3
"""Collects what an infant needs and how much of it is actually absorbed.

    python3 tools/fetch_requirements.py

Writes `requirements.json`. A concentration on its own says nothing about whether a baby
is fed. Because a) a nutrient is only useful once it crosses the gut b) breast milk and a
powder are absorbed at very different rates c) a figure many times another is not many
times better.
"""

from __future__ import annotations

import argparse
import datetime
import io
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

FULLTEXT = "https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML"
USER_AGENT = "milky_os requirement builder"

# Each MILQ paper prints what breast milk delivers a day beside the adequate intake.
PAPERS = {
    "milq-macro": "PMC12673390",
    "milq-mineral": "PMC12592237",
    "milq-fat-soluble": "PMC12592235",
    "milq-b": "PMC12673392",
}
VOLUME_PAPER = "PMC12673386"

# What the intake table calls a nutrient against what a pack calls it.
AS_PRINTED = {
    "Protein": "Eiweiß",
    "Carbohydrate": "Kohlenhydrate",
    "Fat": "Fett",
    "Energy": "Brennwert",
    "Sodium": "Natrium",
    "Potassium": "Kalium",
    "Magnesium": "Magnesium",
    "Phosphorus": "Phosphor",
    "Calcium": "Calcium",
    "Iron": "Eisen",
    "Copper": "Kupfer",
    "Zinc": "Zink",
    "Selenium": "Selen",
    "Vitamin A (RAE": "Vitamin A",
    "ɑ-tocopherol": "Vitamin E",
    "Vitamin D (ARA": "Vitamin D",
    "B1": "Vitamin B 1, Thiamin",
    "B2": "Vitamin B 2, Riboflavin",
    "B3": "Niacin",
    "Pantothenic acid": "Pantothensäure",
    "B6": "Vitamin B 6",
    "Biotin": "Biotin",
    "B12": "Vitamin B 12",
    "Choline": "Cholin, gesamt",
}

# The measured volume a baby drinks, which turns a figure a day into a concentration.
# From the MILQ intake paper, all sites, grams a day.
VOLUMES = [
    {"window": "1-3.49 mo", "grams": 818, "sd": 152, "n": 558},
    {"window": "3.5-5.99 mo", "grams": 833, "sd": 186, "n": 464},
    {"window": "6-8.5 mo", "grams": 691, "sd": 206, "n": 436},
    {"window": "1-8.5 mo", "grams": 781, "sd": 193, "n": 1458},
]
DENSITY = 1.031
IU_IN_MICROGRAM = 0.025  # of vitamin D

# An adequate intake for the first six months is worked out from what breast milk is
# assumed to hold times the volume a baby drinks. Measuring breast milk against it is
# therefore circular. Where the milk comes in under the figure that is evidence the
# assumed composition is out of date rather than evidence the milk is short.
CIRCULAR = {
    "says": (
        "The adequate intake for this age was itself calculated from an assumed breast "
        "milk composition times an assumed intake of 0,78 litres a day. A gap between the "
        "milk and the figure is evidence about the assumption rather than about the milk."
    ),
    "quote": (
        "Depending on the vitamin in question, the studies used for setting the AIs "
        "included as few as 5 women (riboflavin) and no more than 111 women (vitamin B12) "
        "and were conducted between 1951 and 1997. Thus, the current AIs are based on data "
        "from outdated studies with few participants, indicating the need for revision."
    ),
    "source": "milq-b",
}

# Two requirements are not worked out from milk at all. They are set from an outcome in
# the child, so for these the milk really does fall short and the remedy is not a powder.
SET_FROM_OUTCOME = {
    "Vitamin D": {
        "set_from": "the serum 25(OH)D a child has to hold",
        "says": (
            "The main source of vitamin D is sunlight on skin and the diet is the second "
            "source. Human milk alone does not provide enough of it whatever the mother "
            "eats. The remedy is a supplement for the child rather than a different milk."
        ),
        "quote": (
            "The primary source of vitamin D is cutaneous synthesis upon exposure to "
            "ultraviolet B (UVB) light; dietary intake is a secondary source. Human milk "
            "alone does not provide sufficient vitamin D to meet infant needs. The IOM set "
            "the AI for vitamin D to 400 IU/d (10 microgram/d) for infants under 12 mo "
            "based on the maintenance of serum 25(OH)D concentration over 30 nmol/L; "
            "clearly, human milk provides only a small fraction of this requirement."
        ),
        "source": "milq-fat-soluble",
    },
    "Vitamin K": {
        "set_from": "the bleeding it prevents",
        "says": (
            "The concentration in milk is very low and the remedy is an injection after "
            "birth rather than a different milk. MILQ left it out of its reference values "
            "for that reason."
        ),
        "quote": (
            "Vitamin K was not included in the analyses because milk concentration is very "
            "low, and the recommendation is to provide an intramuscular injection to "
            "infants after birth."
        ),
        "source": "milq-fat-soluble",
    },
}

ABSORPTION = {
    "Eisen": {
        "milk": 47.0,
        "formula": 4.1,
        "measured": "stable iron isotope dilution from birth to 6 months",
        "says": (
            "Breastfed infants took in 0,27 mg a day and absorbed 0,128. Formula fed "
            "infants took in 11,19 mg a day and absorbed 0,457. Formula carries 41 times "
            "the iron and delivers 3,6 times the absorbed iron."
        ),
        "source": "stoffel",
        "also": "saarinen",
    },
    "Zink": {
        "milk": 54.0,
        "formula": None,
        "measured": "stable zinc isotope dilution in exclusively breastfed infants",
        "says": (
            "Fractional absorption from human milk was 0,54. No figure for a powder is "
            "carried here so the two are not put side by side."
        ),
        "source": "krebs",
    },
    "Calcium": {
        "milk": None,
        "formula": None,
        "measured": "a systematic review of mass balance and isotope studies",
        "says": (
            "Net calcium retention averaged 40,4% over the first six months. The review "
            "finds intake from human milk may lead to greater absorption and retention "
            "than formula but publishes no pair of figures."
        ),
        "source": "shertukde",
    },
}

SOURCES = {
    "stoffel": {
        "citation": (
            "Stoffel NU, Cepeda-López AC, Zeder C, Herter-Aeberli I, Zimmermann MB. "
            "Measurement of iron absorption and iron gains from birth to 6 months in "
            "breastfed and formula-fed infants using iron isotope dilution. "
            "Sci Adv. 2024;10(28):eado4262."
        ),
        "doi": "10.1126/sciadv.ado4262",
        "pmcid": "PMC11235178",
        "quote": (
            "In breastfed (BF, n = 8), formula-fed (FF, n = 7), or mixed feeding (MF, "
            "n = 8) infants, median iron intake was 0.27, 11.19, and 4.13 mg/day; iron "
            "absorbed was 0.128, 0.457, and 0.391 mg/day."
        ),
    },
    "saarinen": {
        "citation": (
            "Saarinen UM, Siimes MA, Dallman PR. Iron absorption in infants: high "
            "bioavailability of breast milk iron as indicated by the extrinsic tag method "
            "of iron absorption and by the concentration of serum ferritin. "
            "J Pediatr. 1977;91(1):36-39."
        ),
        "doi": "10.1016/s0022-3476(77)80439-3",
        "quote": (
            "Breast-fed infants absorbed an average of 49% of a trace dose of extrinsic "
            "iron, in contrast to about 10% absorbed from cow milk under similar conditions."
        ),
    },
    "krebs": {
        "citation": (
            "Krebs NF, Reidinger CJ, Miller LV, Hambidge KM. Zinc homeostasis in "
            "breast-fed infants. Pediatr Res. 1996;39(4 Pt 1):661-665."
        ),
        "doi": "10.1203/00006450-199604000-00017",
        "quote": (
            "Results included a mean dietary zinc intake of 17.8 +/- 6.6 mumol/d; "
            "fractional absorption of 0.54 +/- 0.075; and total absorbed zinc of "
            "9.5 +/- 3.5 mumol/d."
        ),
    },
    "shertukde": {
        "citation": (
            "Shertukde SP, Cahoon DS, Prado B, Cara KC, Chung M. Calcium Intake and "
            "Metabolism in Infants and Young Children: A Systematic Review of Balance "
            "Studies. Adv Nutr. 2022;13(5):1529-1553."
        ),
        "doi": "10.1093/advances/nmac003",
        "pmcid": "PMC9526821",
        "quote": (
            "The random-effects model meta-regression on 42 mass balance study arms showed "
            "an average net calcium retention of 40.4% among infants aged 0-6 mo."
        ),
    },
    "milq-b": {
        "citation": (
            "Allen LH, Shahab-Ferdows S, Moore SE, Peerson JM, Kac G, Figueiredo AC, "
            "et al. Reference Values for B Vitamins in Human Milk: The Mothers, Infants "
            "and Lactation Quality (MILQ) Study. Adv Nutr. 2025;16(Suppl 1):100500."
        ),
        "doi": "10.1016/j.advnut.2025.100500",
        "pmcid": "PMC12673392",
    },
    "milq-fat-soluble": {
        "citation": (
            "Kac G, Jones KS, Meadows SR, Hampel D, Islam MM, Mølgaard C, et al. "
            "Reference Values for Fat-Soluble Vitamins in Human Milk: The Mothers, "
            "Infants and Lactation Quality (MILQ) Study. Adv Nutr. 2025;16(Suppl 1):100484."
        ),
        "doi": "10.1016/j.advnut.2025.100484",
        "pmcid": "PMC12592235",
    },
    "milq-volume": {
        "citation": (
            "Dror DK, et al. Breast Milk Intake from 1 to 8.5 Months of Lactation in the "
            "Multisite Mothers, Infants and Lactation Quality (MILQ) Study. "
            "Adv Nutr. 2025;16(Suppl 1)."
        ),
        "pmcid": "PMC12673386",
        "quote": (
            "Milk intake was 818 g/d at 1-3.49 mo, 833 g/d at 3.5-5.99 mo and 691 g/d at "
            "6-8.5 mo over all sites."
        ),
    },
}


def text_of(el) -> str:
    return re.sub(r"\s+", " ", "".join(el.itertext())).strip()


def fetch(pmcid: str, cache: Path | None) -> bytes:
    if cache is not None:
        kept = cache / f"{pmcid}.xml"
        if kept.exists():
            return kept.read_bytes()
    request = urllib.request.Request(FULLTEXT.format(pmcid=pmcid),
                                     headers={"user-agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=90) as answer:
        body = answer.read()
    if cache is not None:
        cache.mkdir(parents=True, exist_ok=True)
        (cache / f"{pmcid}.xml").write_bytes(body)
    return body


def number(cell: str) -> float | None:
    found = re.search(r"-?\d[\d.,]*", cell.replace("−", "-"))
    if not found:
        return None
    try:
        return float(found.group(0).replace(",", ""))
    except ValueError:
        return None


def intakes(body: bytes) -> list[dict[str, Any]]:
    """Read the table that puts what the milk delivers beside the adequate intake."""
    root = ET.fromstring(body)
    out = []
    for wrap in root.iter("table-wrap"):
        caption = text_of(wrap.find("caption")) if wrap.find("caption") is not None else ""
        if "adequate intake" not in caption.casefold():
            continue
        for row in wrap.iter("tr"):
            cells = [text_of(c) for c in row]
            if len(cells) < 3 or not cells[0]:
                continue
            head = cells[0]
            unit = re.search(r"\(([^)]*?)/d\)?", head)
            # the longest name first so B12 is never read as B1 with a stray digit
            for printed, name in sorted(AS_PRINTED.items(), key=lambda kv: -len(kv[0])):
                if re.match(re.escape(printed) + r"(?![0-9])", head):
                    numbers = [number(c) for c in cells[1:]]
                    numbers = [n for n in numbers if n is not None]
                    if len(numbers) < 2:
                        continue
                    out.append({
                        "name": name,
                        "as_printed": head,
                        "unit": (unit.group(1).split(",")[-1].strip() if unit else ""),
                        "milk_a_day": numbers[0],
                        "needs_a_day": numbers[-2] if len(numbers) > 2 else numbers[-2:][0],
                    })
                    break
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "requirements.json")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    say = (lambda *_: None) if args.quiet else print
    cache = None if args.no_cache else ROOT / ".cache" / "science"

    found: dict[str, dict[str, Any]] = {}
    for key, pmcid in PAPERS.items():
        rows = intakes(fetch(pmcid, cache))
        say(f"  {key:18s} {pmcid}  {len(rows)} nutrients with an adequate intake")
        for row in rows:
            found[row["name"]] = {**row, "source": key}

    millilitres = VOLUMES[0]["grams"] / DENSITY
    for row in found.values():
        # the intake table counts vitamin D in international units and a pack declares it
        # in micrograms, so the requirement is converted rather than compared as printed
        if row["unit"] == "IU" and row["name"] == "Vitamin D":
            row["needs_a_day"] *= IU_IN_MICROGRAM
            row["milk_a_day"] *= IU_IN_MICROGRAM
            row["unit"] = "µg"
            row["converted"] = "from international units at 0,025 µg per IU"
        # what a baby drinking the measured volume would have to be fed per 100 ml
        row["needs_per_100_ml"] = row["needs_a_day"] / (millilitres / 100)
        # and whether coming in under that figure means anything at all
        outcome = SET_FROM_OUTCOME.get(row["name"])
        row["set_from"] = outcome["set_from"] if outcome else "what breast milk was assumed to hold"
        row["circular"] = outcome is None

    payload = {
        "built_on": datetime.date.today().isoformat(),
        "basis": "pro 100 ml",
        "density": DENSITY,
        "volumes": VOLUMES,
        "volume_used": {"window": VOLUMES[0]["window"], "grams": VOLUMES[0]["grams"],
                        "millilitres": millilitres},
        "requirements": found,
        "circular": CIRCULAR,
        "set_from_outcome": SET_FROM_OUTCOME,
        "absorption": ABSORPTION,
        "sources": SOURCES,
    }
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n",
                        encoding="utf-8")
    say(f"{args.out} holds {len(found)} requirements and {len(ABSORPTION)} absorption records")
    missing = sorted(set(AS_PRINTED.values()) - set(found))
    if missing:
        say(f"  no adequate intake found for {', '.join(missing)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
