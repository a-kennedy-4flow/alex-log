"""Turns the published nutrition table into numbers."""

from __future__ import annotations

import re
from typing import Any, Iterator

from .models import Measurement, Nutrient, NutritionTable, Quantity

NUTRITION_HEADINGS = ("nährwerte", "nährwertangaben", "nährwertinformationen")
GREEK_MU = "μ"
MICRO_SIGN = "µ"
BLANKS = ("\xa0", "\u202f", "\u2009", "\u200b", "\t")
QUALIFIERS = {"<": "<", ">": ">", "ca.": "ca.", "max.": "max.", "min.": "min.", "~": "ca."}
UNIT_ALIASES = {"ug": MICRO_SIGN + "g", "mcg": MICRO_SIGN + "g", "kj": "kJ", "kcal": "kcal"}

QUANTITY = re.compile(
    r"(?P<qualifier><|>|~|ca\.|max\.|min\.)?\s*"
    r"(?P<number>\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*"
    r"(?P<unit>%|[A-Za-zµμ][A-Za-zµμ.\-]*)"
)


def tidy(text: Any) -> str:
    """Give back one line of plain text."""
    if text is None:
        return ""
    cleaned = str(text)
    for blank in BLANKS:
        cleaned = cleaned.replace(blank, " ")
    return re.sub(r"\s+", " ", cleaned.replace(GREEK_MU, MICRO_SIGN)).strip()


def to_number(text: str) -> float | None:
    """Read a German decimal."""
    raw = text.strip()
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?", raw):
        raw = raw.replace(".", "")
    return _as_float(raw.replace(",", "."))


def _as_float(raw: str) -> float | None:
    try:
        return float(raw)
    except ValueError:
        return None


def normalise_unit(unit: str) -> str:
    cleaned = unit.replace(GREEK_MU, MICRO_SIGN).rstrip(".")
    return UNIT_ALIASES.get(cleaned.casefold(), cleaned)


def parse_quantities(text: str) -> tuple[Quantity, ...]:
    """Read every number the cell declares.

    Because a) an energy row prints kilojoules and kilocalories in one cell b) a trace
    prints a limit such as "< 0,01 mg" c) both forms are the same pattern repeated.
    """
    found = []
    for match in QUANTITY.finditer(tidy(text)):
        value = to_number(match.group("number"))
        if value is None:
            continue
        qualifier = QUALIFIERS.get((match.group("qualifier") or "").strip(), "")
        found.append(Quantity(value, normalise_unit(match.group("unit")), qualifier))
    return tuple(found)


def iter_tables(payload: dict[str, Any]) -> Iterator[tuple[str, list[list[str]]]]:
    """Give back every table of the product with the heading above it."""
    for group in payload.get("descriptionGroups") or []:
        heading = tidy(group.get("header"))
        for block in group.get("contentBlock") or []:
            table = block.get("table")
            if isinstance(table, list) and table:
                yield heading, table


def find_nutrition_table(payload: dict[str, Any]) -> list[list[str]] | None:
    """Pick the table that holds the declaration."""
    fallback = None
    for heading, table in iter_tables(payload):
        if heading.casefold() in NUTRITION_HEADINGS:
            return table
        if fallback is None and "nährwert" in tidy(table[0][0] if table[0] else "").casefold():
            fallback = table
    return fallback


def parse_table(table: list[list[str]]) -> NutritionTable:
    """Read the declaration into one nutrient per printed row.

    Because a) a row can print fewer cells than the header has columns b) the missing
    cell means the publisher declared nothing under that basis c) a nutrient therefore
    carries a measurement only for the bases it names.
    """
    rows = [[tidy(cell) for cell in row] for row in table if row]
    if not rows:
        return NutritionTable()
    header = rows[0]
    width = max(len(row) for row in rows)
    bases = [header[index] if index < len(header) else "" for index in range(1, width)]
    nutrients = []
    for row in rows[1:]:
        name = row[0] if row else ""
        values = [row[index] if index < len(row) else "" for index in range(1, width)]
        if not name and not any(values):
            continue
        measurements = [
            Measurement(bases[index], value, parse_quantities(value))
            for index, value in enumerate(values)
            if value
        ]
        nutrients.append(Nutrient(name, measurements))
    return NutritionTable(header[0] if header else "", bases, nutrients)


def nutrition_of(payload: dict[str, Any]) -> NutritionTable | None:
    table = find_nutrition_table(payload)
    return parse_table(table) if table else None
