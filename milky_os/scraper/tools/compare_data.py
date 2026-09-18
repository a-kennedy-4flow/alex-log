"""Turns the collected articles into one comparable set per stage."""

from __future__ import annotations

import collections
import re
import statistics
from typing import Any

READY_BASIS = "100 ml"
ENERGY = "Brennwert"
ENERGY_UNIT = "kcal"
MASS = {"µg": 1.0, "mg": 1000.0, "g": 1000000.0}
MIN_SHARE = 0.5

STAGES = [
    ("Spezialnahrung", re.compile(r"spezialnahrung|muttermilchsupplement|andickungsmittel", re.I)),
    ("Kindermilch", re.compile(r"kindermilch|kindergetr|ab\s*[12]\s*jahr|\b[12]\+", re.I)),
    ("Pre", re.compile(r"\bpre\b", re.I)),
    ("1", re.compile(r"anfangsmilch[^,]*\b(1|HA1)\b", re.I)),
    ("2", re.compile(r"folgemilch[^,]*\b(2|HA2)\b|nach dem 6|ab dem 6|ab dem 7", re.I)),
    ("3", re.compile(r"folgemilch[^,]*\b3\b|ab dem 10", re.I)),
    ("4", re.compile(r"folgemilch[^,]*\b4\b|ab dem 12", re.I)),
]
STAGE_ORDER = ["Muttermilch", "Pre", "1", "2", "3", "4", "Kindermilch", "Kuhmilch",
               "Spezialnahrung"]
MOTHER = "Muttermilch"
COW = "Kuhmilch"
# A reference is a milk a step is read against rather than a step of the ladder itself.
REFERENCES = (MOTHER, COW)

KIND = re.compile(r"^(anfangsmilch|folgemilch|kindermilch|kindergetränk|spezialnahrung)\s*", re.I)
HYPO = re.compile(r"\bHA\s*[12]\b", re.I)
STAGE_TOKEN = re.compile(r"\b(pre|[1-4])\b", re.I)
AGE = re.compile(
    r"(von geburt an|nach dem \d+\.\s*monat|ab dem \d+\.\s*monat|ab \d+ jahr(?:en|e)?)",
    re.I,
)
TODDLER = re.compile(r"ab\s*2\s*jahr|\b2\+", re.I)
TIER = re.compile(r"\b[12]\+?", re.I)

# Every article names the age it is for. A pack names the month it is sold from and a
# lactation window names both of its ends.
DAYS_IN_MONTH = 30.44
SPAN = re.compile(r"(\d+(?:,\d+)?)\.?\s*bis\s*(\d+(?:,\d+)?)\.?\s*(Tag|Monat)", re.I)
BIRTH = re.compile(r"von geburt an", re.I)
FROM_MONTH = re.compile(r"(?:nach|ab) dem (\d+)\.?\s*monat", re.I)
FROM_YEAR = re.compile(r"ab (\d+)\s*jahr", re.I)
MACROS = [
    "Brennwert",
    "Fett",
    "davon gesättigte Fettsäuren",
    "davon einfach ungesättigte Fettsäuren",
    "davon mehrfach ungesättigte Fettsäuren",
    "Kohlenhydrate",
    "davon Zucker",
    "Ballaststoffe",
    "Eiweiß",
    "Salz",
]


def age_span(name: str) -> tuple[float, float | None] | None:
    """Read the age in months the article names itself for.

    Because a) a dm pack prints von Geburt an or ab dem 6. Monat b) a lactation window
    prints both of its ends c) one reader over both is what lets the two meet on an age.
    """
    span = SPAN.search(name)
    if span:
        scale = 1 / DAYS_IN_MONTH if span.group(3).casefold() == "tag" else 1.0
        ends = (float(span.group(1).replace(",", ".")), float(span.group(2).replace(",", ".")))
        return ends[0] * scale, ends[1] * scale
    if BIRTH.search(name):
        return 0.0, None
    month = FROM_MONTH.search(name)
    if month:
        return float(month.group(1)), None
    year = FROM_YEAR.search(name)
    if year:
        return float(year.group(1)) * 12, None
    return None


def sold_from(articles: list[dict[str, Any]]) -> float | None:
    """Name the age a step is sold from as the most of its packs declare it."""
    seen = collections.Counter()
    for article in articles:
        span = age_span(article["name"])
        if span is not None:
            seen[span[0]] += 1
    if not seen:
        return None
    # the commonest declared age wins and the earlier of two equals wins
    return min(seen, key=lambda month: (-seen[month], month))


def stage_of(name: str, brand: str = "") -> str:
    """Name the age step the pack is sold for.

    Breast milk is held apart rather than read off a name. Because a) it is not sold for
    an age step b) reading it into one would move the median every other article of that
    step is measured against c) its own step is the rung the formula steps climb from.
    """
    if brand in REFERENCES:
        return brand
    for label, rule in STAGES:
        if rule.search(name):
            return label
    return ""


def variant_of(name: str, stage: str, size: str = "") -> str:
    """Keep only what tells one pack of a stage from another.

    Because a) every name in a stage repeats the kind the stage and the age b) that
    repetition fills the label and hides the difference c) what is left is the recipe.
    """
    rest = name[: -len(size)].rstrip().rstrip(",") if size and name.endswith(size) else name
    if stage in REFERENCES:
        return rest  # a reference name already carries only what tells it apart
    tier = ("2+" if TODDLER.search(rest) else "1+") if stage == "Kindermilch" else ""
    rest = KIND.sub("", rest)
    rest = HYPO.sub("HA", rest)
    rest = AGE.sub("", rest)
    if stage == "Kindermilch":
        rest = TIER.sub("", rest)
    else:
        rest = STAGE_TOKEN.sub("", rest, count=1)
    rest = re.sub(r"\s*,\s*", " ", rest)
    rest = re.sub(r"\s+", " ", rest).strip(" .-")
    return f"{rest} {tier}".strip() if tier else rest


def ready_basis_of(product: dict[str, Any]) -> str | None:
    """Find the column that counts the milk as the baby drinks it."""
    for basis in product["nutrition"]["bases"]:
        if READY_BASIS in basis:
            return basis
    return None


def _declared(product: dict[str, Any], basis: str) -> dict[str, dict[str, Any]]:
    found = {}
    for nutrient in product["nutrition"]["nutrients"]:
        for measurement in nutrient["measurements"]:
            if measurement["basis"] == basis and measurement["quantities"]:
                found[nutrient["name"]] = measurement
    return found


# Two printed names for one substance. A declaration is folded onto the first name of a
# group before anything is counted. Because a) a brand that writes davon Milchzucker means
# the lactose another brand writes b) the two never appear on one pack so neither can be a
# fraction of the other c) counted apart each falls under the half of the field a nutrient
# needs to be drawn at all.
SAME_THING = [
    ("Laktose", ["Laktose", "davon Milchzucker"],
     "Milchzucker is milk sugar. No pack prints both names so neither can be a fraction "
     "of the other and the two counts add to exactly the number that print either."),
    ("Folat", ["Folat, gesamt", "Folsäure"],
     "Folic acid is a folate so the total is taken wherever a pack prints both. Human "
     "milk carries natural folate and never folic acid so without this the comparison "
     "reads as though breast milk declared no folate at all."),
]
FOLD = {name: canon for canon, names, _ in SAME_THING for name in names}
RANK = {name: index for _, names, _ in SAME_THING for index, name in enumerate(names)}
WHY = {canon: why for canon, _, why in SAME_THING}


def folded(declaration: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Put every printed name of one substance under the one name the charts use."""
    out: dict[str, dict[str, Any]] = {}
    best: dict[str, int] = {}
    for name, measurement in declaration.items():
        canon = FOLD.get(name, name)
        order = RANK.get(name, 0)
        if canon not in out or order < best[canon]:
            out[canon] = measurement
            best[canon] = order
    return out


def canonical_units(declarations: list[dict[str, dict[str, Any]]]) -> dict[str, str]:
    """Choose one unit per nutrient so every bar means the same thing.

    Because a) one brand prints DHA in milligrams while another prints it in grams
    b) plotting both untouched makes the smaller number the taller bar c) the unit most
    brands chose keeps the numbers the size a reader expects.
    """
    seen: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for declaration in declarations:
        for name, measurement in declaration.items():
            for quantity in measurement["quantities"]:
                seen[name][quantity["unit"]] += 1
    units = {}
    for name, counter in seen.items():
        if name == ENERGY:
            units[name] = ENERGY_UNIT
        elif set(counter) <= set(MASS):
            units[name] = counter.most_common(1)[0][0]
        elif len(counter) == 1:
            units[name] = next(iter(counter))
    return units


def value_in(measurement: dict[str, Any], unit: str) -> float | None:
    """Read the declaration in the unit the chart plots."""
    for quantity in measurement["quantities"]:
        if quantity["unit"] == unit:
            return quantity["value"]
    if unit not in MASS:
        return None
    for quantity in measurement["quantities"]:
        if quantity["unit"] in MASS:
            return quantity["value"] * MASS[quantity["unit"]] / MASS[unit]
    return None


def nutrient_order(units: dict[str, str], share: dict[str, float]) -> list[str]:
    """Put the macronutrients first and the rest in alphabetical order."""
    offered = [name for name, part in share.items() if part >= MIN_SHARE and name in units]
    macros = [name for name in MACROS if name in offered]
    rest = sorted(name for name in offered if name not in macros)
    return macros + rest


def build(products: list[dict[str, Any]]) -> dict[str, Any]:
    """Give the page one row per comparable article."""
    rows = []
    skipped = []
    declarations = []
    for product in products:
        basis = ready_basis_of(product)
        if basis is None:
            skipped.append(product)
            continue
        declarations.append(folded(_declared(product, basis)))
        rows.append(product)

    # The unit is the one most brands chose. A reference is not a brand so it gets no
    # vote, or two articles could tip a nutrient out of the unit the shelf declares it in.
    units = canonical_units([
        declaration for product, declaration in zip(rows, declarations)
        if product.get("brand") not in REFERENCES
    ] or declarations)
    counts: collections.Counter = collections.Counter()
    for declaration in declarations:
        counts.update(declaration.keys())
    share = {name: count / len(rows) for name, count in counts.items()}
    offered = nutrient_order(units, share)

    articles = []
    for product, declaration in zip(rows, declarations):
        stage = stage_of(product["name"], product.get("brand", ""))
        values, texts, cites = {}, {}, {}
        for name in offered:
            measurement = declaration.get(name)
            if measurement is None:
                continue
            value = value_in(measurement, units[name])
            if value is None:
                continue
            values[name] = value
            texts[name] = measurement["text"]
            # a reference figure names the study it came from and a dm figure does not
            if measurement.get("source"):
                cites[name] = measurement["source"]
        articles.append(
            {
                "dan": product["dan"],
                "brand": product["brand"],
                "variant": variant_of(product["name"], stage, product["net_quantity"]),
                "name": product["name"],
                "size": product["net_quantity"],
                "url": product["url"],
                "stage": stage,
                "values": values,
                "texts": texts,
                "cites": cites,
            }
        )

    present = {article["stage"] for article in articles}
    return {
        "stages": [stage for stage in STAGE_ORDER if stage in present],
        "nutrients": [{"name": name, "unit": units[name]} for name in offered],
        "articles": articles,
        "skipped": [
            {"brand": product["brand"], "name": product["name"], "dan": product["dan"]}
            for product in skipped
        ],
    }


def _spread(values: list[float]) -> dict[str, Any]:
    return {
        "median": statistics.median(values),
        "low": min(values),
        "high": max(values),
        "count": len(values),
    }


def step_spans(data: dict[str, Any]) -> dict[str, tuple[float, float | None]]:
    """Name the months each formula step is sold over.

    A step runs from the age its packs declare up to the age the next step declares.
    The last step runs on because no pack names an age it stops at.
    """
    held: dict[str, list[dict[str, Any]]] = {}
    for article in data["articles"]:
        held.setdefault(article["stage"], []).append(article)
    steps = [name for name in STAGE_ORDER if name not in REFERENCES and name in held]
    starts = {name: sold_from(held[name]) for name in steps}
    edges = sorted({start for start in starts.values() if start is not None})
    spans = {}
    for name in steps:
        start = starts[name]
        if start is None:
            continue
        later = [edge for edge in edges if edge > start]
        spans[name] = (start, later[0] if later else None)
    return spans


def against(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Pair every formula step with the milk a child of that age would otherwise drink.

    Because a) every pack declares the month it is sold from b) every reference declares
    the age it covers c) a step and a reference that cover the same month are the only
    like for like the kinds allow.

    Breast milk covers the lactation windows the study reached. Cow milk covers from the
    twelfth month on. A step that neither reaches holds no pair rather than a stretched
    one.
    """
    held: dict[str, list[dict[str, Any]]] = {}
    for article in data["articles"]:
        held.setdefault(article["stage"], []).append(article)

    covers: list[tuple[str, list[dict[str, Any]]]] = []
    for name in REFERENCES:
        band = []
        for article in held.get(name, []):
            span = age_span(article["name"])
            if span is None:
                continue
            band.append({"article": article, "from": span[0],
                         "to": span[1] if span[1] is not None else float("inf")})
        if band:
            covers.append((name, sorted(band, key=lambda one: one["from"])))
    if not covers:
        return []

    paired = []
    for name, (start, end) in step_spans(data).items():
        for reference, band in covers:
            matched = [one for one in band
                       if one["to"] > start and (end is None or one["from"] < end)]
            if not matched:
                continue
            articles = held[name]
            nutrients = []
            none_of_it = []
            for nutrient in data["nutrients"]:
                key = nutrient["name"]
                drunk = [one["article"]["values"][key] for one in matched
                         if key in one["article"]["values"]]
                made = [a["values"][key] for a in articles if key in a["values"]]
                if (len(drunk) < len(matched) * MIN_SHARE
                        or len(made) < len(articles) * MIN_SHARE):
                    continue
                # a ratio against nothing is not a ratio. Cow milk declares no vitamin C
                # and no long chain fats so those are named rather than divided by.
                if statistics.median(drunk) == 0:
                    none_of_it.append(key)
                    continue
                nutrients.append({
                    "name": key,
                    "unit": nutrient["unit"],
                    "milk": _spread(drunk),
                    "field": _spread(made),
                })
            paired.append({
                "stage": name,
                "reference": reference,
                "from": start,
                "to": end,
                "windows": [one["article"]["variant"] for one in matched],
                "articles": len(articles),
                "nutrients": nutrients,
                "none_of_it": none_of_it,
            })
            break  # one reference per step, the first that covers its months
    return paired
