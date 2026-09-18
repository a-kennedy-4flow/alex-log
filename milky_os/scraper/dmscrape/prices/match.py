"""Decides whether an article a shop lists is the article dm lists.

Terms used across this package. An **offer** is one price one shop publishes for one
article. A **candidate** is a result a shop returned before it was accepted or refused.
A **key** is the brand the age step and the pack size together. A **name match** is an
offer accepted on the key alone because neither side published a shared barcode.
"""

from __future__ import annotations

import re
import unicodedata

FOLD = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}
SIZE = re.compile(r"(\d[\d.,]*)\s*(kg|g|ml|l)\b", re.IGNORECASE)
MULTIPACK = re.compile(r"(\d+)\s*[x\u00d7]\s*(\d[\d.,]*)\s*(kg|g|ml|l)\b", re.IGNORECASE)
THOUSANDS = re.compile(r"\.(?=\d{3}\b)")
# Below this a number in the name is a count rather than a pack size.
SMALLEST = 20.0
NOISE = frozenset(
    {
        "pulver",
        "milchpulver",
        "anfangsmilch",
        "folgemilch",
        "kindermilch",
        "kindergetraenk",
        "saeuglingsfolgemilch",
        "nahrung",
        "anfangsnahrung",
        "saeuglingsmilch",
        "saeuglingsnahrung",
        "saeuglingsanfangsnahrung",
        "folgenahrung",
        "milch",
        "bio",
        "von",
        "ab",
        "dem",
        "der",
        "an",
        "nach",
        "monat",
        "jahr",
        "jahren",
        "geburt",
        "packung",
        "dose",
        "aus",
        "auf",
        "mit",
        "und",
        "fuer",
        "das",
        "die",
        "den",
        "des",
        "bei",
        "neu",
        "st",
        "stueck",
    }
)
# A feature either side declares must be declared by both.
# Because a) goat milk and cow milk are two recipes under one brand and one age step
# b) a hypoallergenic recipe and an ordinary one are priced apart c) a bottle sold ready
# to drink is never the powder of the same name.
FEATURES = [
    ("goat", re.compile(r"ziege")),
    ("hypoallergenic", re.compile(r"\bha\s*[1234]?\b|hypoallergen")),
    ("ready", re.compile(r"trinkfertig|fluessig")),
    ("sensitive", re.compile(r"sensitiv")),
    ("comfort", re.compile(r"comfort")),
    ("peptide", re.compile(r"pepti")),
    ("reflux", re.compile(r"reflux|\bar\b")),
]
# A shop sells a recipe under the maker rather than the label dm prints.
ALIAS = {
    "aptamil": "aptamil",
    "milupa": "milupa",
    "nutricia": "aptamil",
    "milupino": "milupino",
    "nestle beba": "beba",
    "beba": "beba",
    "nestle": "beba",
    "hipp": "hipp",
    "holle": "holle",
    "humana": "humana",
    "toepfer": "toepfer",
    "bebivita": "bebivita",
    "loewenzahn organics": "loewenzahn",
    "loewenzahn": "loewenzahn",
    "babylove": "babylove",
    "milasan": "milasan",
    "dmbio": "dmbio",
    "bambinchen": "bambinchen",
}


def fold(text: str) -> str:
    """Put German text into plain lowercase ascii."""
    lowered = (text or "").lower()
    for letter, pair in FOLD.items():
        lowered = lowered.replace(letter, pair)
    stripped = unicodedata.normalize("NFKD", lowered)
    return "".join(c for c in stripped if not unicodedata.combining(c))


def tokens(text: str) -> set[str]:
    """Break a name into the words that tell one recipe from another."""
    words = re.findall(r"[a-z0-9+]+", fold(text))
    return {w for w in words if w not in NOISE and len(w) > 1}


def brand_key(brand: str) -> str:
    """Name the maker behind a brand label."""
    folded = fold(brand).strip()
    if folded in ALIAS:
        return ALIAS[folded]
    for label, key in ALIAS.items():
        if folded.startswith(label):
            return key
    return folded.split(" ")[0] if folded else ""


def number(text: str) -> float:
    """Read a German number.

    Because a) a full stop separates thousands so 1.200 g is one thousand two hundred
    b) a comma is the decimal mark so 1,2 kg is one and two tenths c) reading either as a
    plain float gives 1,2 for both and the pack size guard then never fires.
    """
    cleaned = text.strip()
    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    else:
        cleaned = THOUSANDS.sub("", cleaned)
    return float(cleaned)


def _mass(value: float, unit: str) -> float:
    return value * 1000.0 if unit.lower() in {"kg", "l"} else value


def grams(text: str) -> float | None:
    """Read a pack size as grams or millilitres.

    A pack sold as six bottles is read as the whole pack. Because a) the shop prices the
    pack rather than the bottle b) a per kilo figure taken off one bottle is six times the
    true one c) the multiplier is always printed in front of the size.
    """
    body = text or ""
    pack = MULTIPACK.search(body)
    if pack:
        return int(pack.group(1)) * _mass(number(pack.group(2)), pack.group(3))
    for value, unit in SIZE.findall(body):
        try:
            size = _mass(number(value), unit)
        except ValueError:
            continue
        if size >= SMALLEST:
            return size
    return None


def overlap(left: str, right: str) -> float:
    """Share of the smaller name the two names have in common."""
    a, b = tokens(left), tokens(right)
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))



STAGE_RULES = [
    ("spezial", re.compile(r"spezialnahrung|anti[- ]?reflux|\bar\b", re.I)),
    ("kinder", re.compile(r"kindermilch|kindergetr|ab\s*[12]\s*jahr|\b[12]\+", re.I)),
    ("pre", re.compile(r"\bpre\b", re.I)),
    ("1", re.compile(r"\b(?:ha\s*)?1\b(?!\s*(?:kg|l|jahr))", re.I)),
    ("2", re.compile(r"\b(?:ha\s*)?2\b(?!\s*(?:kg|l|jahr))", re.I)),
    ("3", re.compile(r"\b3\b(?!\s*(?:kg|l|jahr))", re.I)),
    ("4", re.compile(r"\b4\b(?!\s*(?:kg|l|jahr))", re.I)),
]
SIZE_TOKEN = re.compile(r"^\d+$")
MINIMUM = 0.45
# A candidate that names no recipe at all is the weakest accept this package makes.
BARE = 0.6


def stage_token(name: str) -> str:
    """Name the age step a pack name declares."""
    for label, rule in STAGE_RULES:
        if rule.search(name or ""):
            return label
    return ""


def features(name: str) -> set[str]:
    """Name every declared feature of a recipe."""
    folded = fold(name)
    return {label for label, rule in FEATURES if rule.search(folded)}


def markers(name: str, *brands: str) -> set[str]:
    """Keep only the words that tell one recipe of a step from another.

    A maker word is dropped only when it is the maker of one of the two articles being
    weighed. Because a) a shop prefixes the maker onto the label dm prints so Milupa
    Aptamil is one article b) Milumil is another article of the same maker c) dropping
    every known maker word would make those two look alike.
    """
    drop = {brand_key(b) for b in brands if b} | {fold(b).strip() for b in brands if b}
    stage = stage_token(name)
    kept = set()
    for word in tokens(name):
        if word in drop or SIZE_TOKEN.match(word) or word == stage:
            continue
        # A declared feature is one marker however the shop spells it.
        # Because a) one shop writes Ziegenmilch where another writes Ziegenmilchbasis
        # b) both name the same recipe c) two spellings would read as two recipes.
        label = next((name_ for name_, rule in FEATURES if rule.search(word)), word)
        kept.add(label)
    return kept


def jaccard(left: str, right: str) -> float:
    a, b = tokens(left), tokens(right)
    return len(a & b) / len(a | b) if a | b else 0.0


def accepts(
    wanted_brand: str,
    wanted_name: str,
    wanted_grams: float | None,
    title: str,
    title_grams: float | None,
    title_brand: str = "",
) -> float:
    """Score a candidate against the article dm lists and refuse it at zero.

    Because a) neither shop publishes the dm article number b) a barcode only matches when
    both sides printed the same pack c) the maker the age step the pack size together name
    one recipe so a candidate disagreeing on any of the three is a different article.
    """
    key = brand_key(wanted_brand)
    if key and key not in fold(title) and key != brand_key(title_brand):
        return 0.0
    if stage_token(wanted_name) != stage_token(title):
        return 0.0
    if features(wanted_name) != features(title):
        return 0.0
    if wanted_grams and title_grams and abs(wanted_grams - title_grams) > 1.0:
        return 0.0
    both = (wanted_brand, title_brand)
    left, right = markers(wanted_name, *both), markers(title, *both)
    if left and right and not (left <= right or right <= left):
        return 0.0
    score = jaccard(wanted_name, title)
    if left != right:
        score *= BARE
    return score if score >= MINIMUM else 0.0
