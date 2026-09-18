#!/usr/bin/env python3
"""Builds the breast milk reference declaration from the published science.

    python3 tools/fetch_breastmilk.py
    python3 tools/fetch_breastmilk.py --no-cache

Writes `breastmilk.json`. Every number carries the study it was read from.
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
import zipfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

WORD = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
SUPPLEMENT = "https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/supplementaryFiles"
USER_AGENT = "milky_os breastmilk reference builder"

# One MILQ lactation window is one article. The study samples ten of them.
WINDOWS = [
    ("4-17 d", "4. bis 17. Tag", 4, 17),
    ("18-31 d", "18. bis 31. Tag", 18, 31),
    ("1-2 m", "1. bis 2. Monat", 31, 61),
    ("2-3 m", "2. bis 3. Monat", 61, 91),
    ("3-4 m", "3. bis 4. Monat", 91, 122),
    ("4-5 m", "4. bis 5. Monat", 122, 152),
    ("5-6 m", "5. bis 6. Monat", 152, 183),
    ("6-7 m", "6. bis 7. Monat", 183, 213),
    ("7-8 m", "7. bis 8. Monat", 213, 243),
    ("8-8.5 m", "8. bis 8,5. Monat", 243, 259),
]
ORDER = [key for key, _, _, _ in WINDOWS]

SOURCES = {
    "milq-macro": {
        "citation": (
            "Lewis JI, Dror DK, Hampel D, Kac G, Mølgaard C, Moore SE, et al. "
            "Reference Values for Macronutrients in Human Milk: the Mothers, Infants "
            "and Lactation Quality (MILQ) Study. Adv Nutr. 2025;16(Suppl 1):100501."
        ),
        "doi": "10.1016/j.advnut.2025.100501",
        "pmcid": "PMC12673390",
        "table": "Supplementary Table 1, monthly percentile summaries, P50",
        "measured": "near infrared spectroscopy",
        "by_month": True,
    },
    "milq-mineral": {
        "citation": (
            "Allen LH, Islam MM, Kac G, Michaelsen KF, Moore SE, Andersson M, et al. "
            "Reference Values for Minerals in Human Milk: the Mothers, Infants and "
            "Lactation Quality (MILQ) Study. Adv Nutr. 2025;16(Suppl 1):100431."
        ),
        "doi": "10.1016/j.advnut.2025.100431",
        "pmcid": "PMC12592237",
        "table": "Supplementary Table 1, monthly percentile summaries, P50",
        "measured": "inductively coupled plasma mass spectrometry",
        "corrigendum": (
            "Adv Nutr. 2025;17(2):100578 doi 10.1016/j.advnut.2025.100578 reprints the "
            "copper figures 8A and 8B. No published concentration changed."
        ),
        "by_month": True,
    },
    "milq-fat-soluble": {
        "citation": (
            "Kac G, Jones KS, Meadows SR, Hampel D, Islam MM, Mølgaard C, et al. "
            "Reference Values for Fat-Soluble Vitamins in Human Milk: The Mothers, "
            "Infants and Lactation Quality (MILQ) Study. Adv Nutr. 2025;16(Suppl 1):100484."
        ),
        "doi": "10.1016/j.advnut.2025.100484",
        "pmcid": "PMC12592235",
        "table": "Supplementary Table 1, monthly percentile summaries, P50",
        "measured": "high performance liquid chromatography and LC-MS/MS",
        "by_month": True,
    },
    "milq-b": {
        "citation": (
            "Allen LH, Shahab-Ferdows S, Moore SE, Peerson JM, Kac G, Figueiredo AC, "
            "et al. Reference Values for B Vitamins in Human Milk: The Mothers, Infants "
            "and Lactation Quality (MILQ) Study. Adv Nutr. 2025;16(Suppl 1):100500."
        ),
        "doi": "10.1016/j.advnut.2025.100500",
        "pmcid": "PMC12673392",
        "table": "Supplementary Table 1, monthly percentile summaries, P50",
        "measured": "UPLC-MS/MS, HPLC-fluorescence and chemiluminescence immunoassay",
        "by_month": True,
    },
    "hopperton": {
        "citation": (
            "Hopperton KE, Thavarajah S, Ahuja J, Casavale K, Chakrabarti S, Gibbs K, "
            "et al. Literature-based human milk nutrient composition values for use in "
            "North American food composition databases. Am J Clin Nutr. 2026;123(5):101252."
        ),
        "doi": "10.1016/j.ajcnut.2026.101252",
        "pmcid": "PMC13197950",
        "table": "Table 1, pooled mean per 100 g",
        "period": "21 d to 7 mo of lactation",
        "by_month": False,
    },
    "hmo-review": {
        "citation": (
            "Kenney AD, Sabag-Daigle A, Stoecklein MM, Buck RH, Reverri EJ. A review of "
            "human milk oligosaccharide concentrations of breast milk for infants and "
            "young children through 24 months of age. Front Pediatr. 2025;13:1649609."
        ),
        "doi": "10.3389/fped.2025.1649609",
        "pmcid": "PMC12443758",
        "table": "Table 2, concentration of the six core HMOs across 13 studies",
        "by_month": True,
    },
    "lactmed-c": {
        "citation": (
            "Vitamin C. Drugs and Lactation Database (LactMed) [Internet]. Bethesda (MD): "
            "National Institute of Child Health and Human Development; 2006-. "
            "Updated 2024 Jun 15."
        ),
        "url": "https://www.ncbi.nlm.nih.gov/books/NBK544628/",
        "quote": (
            "Average mature milk vitamin C concentrations are 50 to 90 mg/L in mothers "
            "consuming adequate vitamin C in their diet."
        ),
        "by_month": False,
    },
    "efsa-fluoride": {
        "citation": (
            "EFSA Scientific Committee. Updated consumer risk assessment of fluoride in food "
            "and drinking water including the contribution from other sources of oral "
            "exposure. EFSA J. 2025;23(7):e9478."
        ),
        "doi": "10.2903/j.efsa.2025.9478",
        "pmcid": "PMC12280829",
        "quote": (
            "Mothers (n = 125; drinking water fluoride concentration was 0.3 mg/L) had a mean "
            "plasma fluoride concentration of 17 microgram/L and a mean breast milk fluoride "
            "concentration of 6 microgram/L (Sener et al., 2007)."
        ),
        "by_month": False,
    },
    "kim-taurine": {
        "citation": (
            "Kim ES, Kim JS, Cho KH, Lee KH, Tamari Y. Quantitation of taurine and selenium "
            "levels in human milk and estimated intake of taurine by breast-fed infants "
            "during the early periods of lactation. "
            "Adv Exp Med Biol. 1998;442:477-486."
        ),
        "doi": "10.1007/978-1-4899-0117-0_57",
        "quote": (
            "The concentration of taurine (406 +/- 174 nmol/ml) in colostrum was significantly "
            "higher than that (335 +/- 115 nmol/ml) in mature milk."
        ),
        "by_month": True,
    },
    "yoshida": {
        "citation": (
            "Yoshida M, Takada A, Hirose J, Endo M, Fukuwatari T, Shibata K. Molybdenum and "
            "chromium concentrations in breast milk from Japanese women. "
            "Biosci Biotechnol Biochem. 2008;72(8):2247-2250."
        ),
        "doi": "10.1271/bbb.80283",
        "quote": (
            "For Mo the range and median were <0.1 to 25.91 and 3.18 ng/ml. For Cr the range "
            "and median were <0.1 to 18.67 and 1.00 ng/ml. 79 samples by ICP-MS."
        ),
        "by_month": False,
    },
    "ogasa": {
        "citation": (
            "Ogasa K, Kuboyama M, Kiyosawa I, Suzuki T, Itoh M. The content of free and "
            "bound inositol in human and cow's milk. "
            "J Nutr Sci Vitaminol. 1975;21(2):129-135."
        ),
        "doi": "10.3177/jnsv.21.129",
        "quote": (
            "The content of total myoinositol in human milk was 32.7 +/- 15.2 mg/100 ml in "
            "colostrum, 17.8 +/- 1.9 mg/100 ml in transitional milk, and 14.9 +/- 3.1 "
            "mg/100 ml in mature milk."
        ),
        "by_month": True,
    },
    "sandor": {
        "citation": (
            "Sandor A, Pecsuvac K, Kerner J, Alkonyi I. On carnitine content of the human "
            "breast milk. Pediatr Res. 1982;16(2):89-91."
        ),
        "doi": "10.1203/00006450-198202000-00001",
        "quote": (
            "The concentration of total carnitine in human breast milk remained at a "
            "constant mean level near 62.9 nmoles/ml during the first 21 days postpartum. "
            "The carnitine level fell significantly to 35.2 +/- 1.26 nmoles/ml until the "
            "40-50th day."
        ),
        "by_month": True,
    },
}

# What the MILQ supplementary tables call a nutrient, what dm calls it, and what turns
# the published per litre figure into the per 100 ml column dm declares.
MILQ = [
    ("Brennwert", "milq-macro", "Energy density", "kcal", 0.1),
    ("Fett", "milq-macro", "Fat", "g", 0.1),
    ("Kohlenhydrate", "milq-macro", "Carbohydrate", "g", 0.1),
    ("davon Zucker", "milq-macro", "Carbohydrate", "g", 0.1),
    ("Laktose", "milq-macro", "Carbohydrate", "g", 0.1),
    ("Eiweiß", "milq-macro", "Protein", "g", 0.1),
    ("Natrium", "milq-mineral", "Sodium", "mg", 0.1),
    ("Salz", "milq-mineral", "Sodium", "g", 0.00025),
    ("Kalium", "milq-mineral", "Potassium", "mg", 0.1),
    ("Magnesium", "milq-mineral", "Magnesium", "mg", 0.1),
    ("Phosphor", "milq-mineral", "Phosphorus", "mg", 0.1),
    ("Calcium", "milq-mineral", "Calcium", "mg", 0.1),
    ("Eisen", "milq-mineral", "Iron", "mg", 0.1),
    ("Kupfer", "milq-mineral", "Copper", "mg", 0.1),
    ("Zink", "milq-mineral", "Zinc", "mg", 0.1),
    ("Selen", "milq-mineral", "Selenium (measured as oxide)", "µg", 0.1),
    ("Vitamin A", "milq-fat-soluble", "Vitamin A", "µg", 100.0),
    ("Vitamin E", "milq-fat-soluble", "Alpha tocopherol", "mg", 0.1),
    ("Vitamin D", "milq-fat-soluble", "Anti-rachitic activity", "µg", 0.0025),
    ("Vitamin B 1, Thiamin", "milq-b", "Vitamin B1", "mg", 0.0001),
    ("Vitamin B 2, Riboflavin", "milq-b", "Vitamin B2", "mg", 0.0001),
    ("Niacin", "milq-b", "Vitamin B3", "mg", 0.1),
    ("Pantothensäure", "milq-b", "Pantothenic acid", "mg", 0.1),
    ("Vitamin B 6", "milq-b", "Vitamin B6", "mg", 0.0001),
    ("Biotin", "milq-b", "Biotin", "µg", 0.1),
    ("Vitamin B 12", "milq-b", "Vitamin B12", "µg", 0.1),
    ("Cholin, gesamt", "milq-b", "Choline", "mg", 0.1),
]

# Hopperton publishes one mature milk figure per 100 g. Human milk runs 1,031 g per
# millilitre so 100 ml weighs 103,1 g. Its window is 21 d to 7 mo of lactation.
DENSITY = 1.031
HOPPERTON_WINDOWS = ORDER[1:8]
HOPPERTON = [
    ("davon gesättigte Fettsäuren", 1.35, "g"),
    ("davon einfach ungesättigte Fettsäuren", 1.28, "g"),
    ("davon mehrfach ungesättigte Fettsäuren", 0.65, "g"),
    ("Linolsäure", 0.56, "g"),
    ("Alpha-Linolensäure", 0.049, "g"),
    ("Docosahexaensäure (DHA)", 6.6, "mg"),
    ("Arachidonsäure", 14.0, "mg"),
    ("Folat, gesamt", 7.46, "µg"),
    ("Vitamin K", 0.19, "µg"),
    ("Jod", 18.25, "µg"),
    ("Mangan", 0.00019, "mg"),
    ("Chlorid", 40.35, "mg"),
]

# The oligosaccharide review publishes colostrum, 6 mo and 12 mo. Two of those fall
# inside the MILQ windows. Figures are g per litre.
HMO_WINDOWS = {"colostrum": "4-17 d", "6mo": "6-7 m"}
HMO = [
    ("2'-Fucosyllactose (2'-FL)", 3.00, 1.82),
    ("3-Fucosyllactose (3-FL)", 0.38, 1.23),
    ("Lacto-N-Tetraose (LNT)", 1.31, 0.50),
    ("Lacto-N-Neotetraose (LNnt)", 0.55, 0.13),
    ("3'-Sialyllactose", 0.21, 0.20),
    ("6'-Sialyllactose", 0.52, 0.08),
    ("Humane Milch-Oligosaccharide (HMO)", 7.72, 5.12),
]

TAURINE_MOLAR = 125.15  # g per mole of taurine
# A figure whose own paper flags it as resting on a single study says so on its own row
# rather than on every row that shares the source.
WEAK = {
    "Mangan": (
        "this rests on one study. Frisbie SH, Mitchell EJ, Roudeau S, Domart F, Carmona A, "
        "Ortega R. PLoS One. 2019;14(11):e0223636 doi 10.1371/journal.pone.0223636 reports "
        "3 to 6 microgram per litre for the same figure against the 1,96 taken here"
    ),
    "Vitamin K": "this rests on three studies of 79 participants",
}
CARNITINE_MOLAR = 161.20  # g per mole of L-carnitine
KCAL_IN_KJ = 4.184


def fetch(pmcid: str, cache: Path | None) -> bytes:
    """Get one Europe PMC supplementary archive, from disk when it is already there."""
    if cache is not None:
        kept = cache / f"{pmcid}.zip"
        if kept.exists():
            return kept.read_bytes()
    url = SUPPLEMENT.format(pmcid=pmcid)
    request = urllib.request.Request(url, headers={"user-agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as answer:
        body = answer.read()
    if cache is not None:
        cache.mkdir(parents=True, exist_ok=True)
        (cache / f"{pmcid}.zip").write_bytes(body)
    return body


def rows_of(archive: bytes) -> list[list[str]]:
    """Read the supplementary document as one list of cells per table row.

    Because a) Europe PMC answers with a zip of every supplementary file b) the one that
    holds the tables is itself a docx which is a second zip c) the text sits in the
    document part inside that.
    """
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        named = [name for name in bundle.namelist() if name.endswith(".docx")]
        if not named:
            raise SystemExit(f"the archive holds no docx, only {bundle.namelist()}")
        inner = bundle.read(sorted(named)[0])
    with zipfile.ZipFile(io.BytesIO(inner)) as document:
        root = ET.fromstring(document.read("word/document.xml"))
    table: list[list[str]] = []
    for tr in root.iter(WORD + "tr"):
        cells = []
        for tc in tr.findall(WORD + "tc"):
            cells.append(" ".join("".join(t.text or "" for t in p.iter(WORD + "t"))
                                  for p in tc.findall(WORD + "p")).strip())
        table.append(cells)
    return table


def window_of(label: str) -> str | None:
    """Name the lactation window a printed age belongs to."""
    tidy = re.sub(r"\s+", " ", label.replace(",", ".").strip())
    if tidy.startswith(("8-8.5", "8-9")):
        return "8-8.5 m"
    return tidy if tidy in ORDER else None


def medians(rows: list[list[str]]) -> dict[str, dict[str, float]]:
    """Read the P50 column of every monthly percentile table.

    Because a) each nutrient opens a block headed Age P05 to P95 b) the unit sits either
    in that heading or alone in the cell below it c) the rows after it carry one age each.
    """
    found: dict[str, dict[str, float]] = {}
    holding = None
    for index, cells in enumerate(rows):
        if len(cells) >= 3 and cells[0] and "Age" in cells[1] and "P05" in cells[2]:
            head = re.match(r"^(.*?)\s*\(([^)]+)\)\s*$", cells[0])
            holding = head.group(1).strip() if head else cells[0].strip()
            found.setdefault(holding, {})
            continue
        if holding and len(cells) >= 9:
            window = window_of(cells[1])
            if window is None:
                continue
            try:
                found[holding][window] = float(cells[5].replace(",", "."))
            except ValueError:
                continue
    return found



def entry(name: str, source: str, unit: str, values: dict[str, float],
          note: str = "", low: float | None = None, high: float | None = None) -> dict[str, Any]:
    """One declared row with the study behind it and the spread the study published."""
    return {
        "name": name,
        "source": source,
        "unit": unit,
        **({"note": note} if note else {}),
        **({"low": low, "high": high} if low is not None and high is not None else {}),
        "per_100_ml": {window: values[window] for window in ORDER if window in values},
    }


def collect(cache: Path | None, say) -> list[dict[str, Any]]:
    """Turn every source into one entry per declared nutrient."""
    tables: dict[str, dict[str, dict[str, float]]] = {}
    for key in ("milq-macro", "milq-mineral", "milq-fat-soluble", "milq-b"):
        pmcid = SOURCES[key]["pmcid"]
        tables[key] = medians(rows_of(fetch(pmcid, cache)))
        say(f"  {key:18s} {pmcid}  {len(tables[key])} nutrients")

    built = []
    for name, source, published, unit, factor in MILQ:
        block = tables[source].get(published)
        if block is None:
            raise SystemExit(f"{source} no longer publishes {published!r}")
        if name == "Brennwert":
            # dm prints the energy in both units so the reference row carries both too
            built.append(entry(name, source, "kJ",
                               {w: v * factor * KCAL_IN_KJ for w, v in block.items()},
                               note="the measured kilocalorie at 4,184 kJ per kcal"))
        built.append(entry(name, source, unit, {w: v * factor for w, v in block.items()}))

    for name, per_100_g, unit in HOPPERTON:
        value = per_100_g * DENSITY
        note = WEAK.get(name, "")
        built.append(entry(name, "hopperton", unit,
                           {w: value for w in HOPPERTON_WINDOWS}, note=note))

    for name, colostrum, half_year in HMO:
        built.append(entry(name, "hmo-review", "g", {
            HMO_WINDOWS["colostrum"]: colostrum / 10.0,
            HMO_WINDOWS["6mo"]: half_year / 10.0,
        }))

    built.append(entry("Vitamin C", "lactmed-c", "mg", {w: 7.0 for w in ORDER[1:]},
                       note="the middle of the 50 to 90 mg per litre LactMed calls the average",
                       low=5.0, high=9.0))
    built.append(entry("Inositol", "ogasa", "mg",
                       {ORDER[0]: 17.8, **{w: 14.9 for w in ORDER[1:]}},
                       note="transitional milk for the first window and mature milk after"))
    built.append(entry("Carnitin", "sandor", "mg", {
        ORDER[0]: 62.9 * CARNITINE_MOLAR / 10000.0,
        **{w: 35.2 * CARNITINE_MOLAR / 10000.0 for w in ORDER[2:]},
    }, note="the first 21 days and the level from the 40th day on"))
    built.append(entry("Fluorid", "efsa-fluoride", "mg", {w: 0.0006 for w in ORDER},
                       note="6 microgram per litre and not resolved by month"))
    built.append(entry("Taurin", "kim-taurine", "mg", {
        ORDER[0]: 406 * TAURINE_MOLAR / 10000.0,
        **{w: 335 * TAURINE_MOLAR / 10000.0 for w in ORDER[1:]},
    }, note="colostrum for the first window and mature milk after"))
    built.append(entry("Molybdän", "yoshida", "µg", {w: 0.318 for w in ORDER},
                       note="the median of 79 samples", low=0.01, high=2.591))
    built.append(entry("Chrom", "yoshida", "µg", {w: 0.1 for w in ORDER},
                       note="the median of 79 samples", low=0.01, high=1.867))
    return built


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "breastmilk.json")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    say = (lambda *_: None) if args.quiet else print
    say("reading the supplementary tables")
    nutrients = collect(None if args.no_cache else ROOT / ".cache" / "science", say)

    payload = {
        "caption": "Referenzwerte der Muttermilch",
        "basis": "pro 100 ml",
        "built_on": datetime.date.today().isoformat(),
        "density": DENSITY,
        "sources": SOURCES,
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC12673385/",
        "windows": [
            {"key": key, "name": name, "from_day": start, "to_day": end}
            for key, name, start, end in WINDOWS
        ],
        "nutrients": nutrients,
    }
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n",
                        encoding="utf-8")

    declared = sum(len(one["per_100_ml"]) for one in nutrients)
    say(f"{args.out} holds {len(nutrients)} nutrients and {declared} measurements")
    for key in SOURCES:
        used = [one["name"] for one in nutrients if one["source"] == key]
        say(f"  {key:18s} {len(used):2d} nutrients")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
