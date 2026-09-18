"""Field extraction from the rows a label reader produced.

The parser never touches an image. It works on rows so it can be tested without the
OCR stack and so a row list from any engine can be fed to it.

British and German labels are both read. A term list carries the two languages and a
fuzzy match covers what the engine spelled wrongly.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from statistics import median

from .models import Label, Nutrient, Quantity, Row

NUMBER = r"\d{1,5}(?:[.,]\d{1,3})?"
UNIT = r"kcal|kj|cal|kg|mg|[µu]g|mcg|ml|cl|litres?|l|grammes?|grams?|g"
QUANTITY_RE = re.compile(rf"({NUMBER})\s*({UNIT})(?![a-z])", re.I)

UNIT_NAMES = {
    "kj": "kJ",
    "kcal": "kcal",
    "cal": "kcal",
    "kg": "kg",
    "mg": "mg",
    "µg": "µg",
    "ug": "µg",
    "mcg": "µg",
    "ml": "ml",
    "cl": "cl",
    "l": "l",
    "litre": "l",
    "litres": "l",
    "g": "g",
    "gram": "g",
    "grams": "g",
    "gramme": "g",
    "grammes": "g",
}

UNIT_REPAIRS: list[tuple[re.Pattern[str], str]] = [
    # "kJ" prints small and comes back as "k]" or "kl" or "kI".
    (re.compile(r"(?<=\d)\s*k\s*[\]\)\|Il1ij](?![a-z0-9])", re.I), "kJ"),
    (re.compile(r"(?<=\d)\s*k\s*c\s*[a@]\s*[l1iI]\b", re.I), "kcal"),
    (re.compile(r"(?<=\d)\s*q\b"), "g"),
]

DIGIT_LOOKALIKES = str.maketrans({"O": "0", "o": "0", "D": "0", "I": "1", "l": "1", "|": "1", "S": "5", "B": "8"})
NUMBER_LIKE_RE = re.compile(rf"\b([0-9OoDIl|SB]{{1,6}}(?:[.,][0-9OoDIl|SB]{{1,3}})?)\s*(?={UNIT})", re.I)

OF_WHICH = r"(?:(?:of\s+which|davon|dovon|worunter)[\s:.\-]*)?"

MACRONUTRIENT_TERMS: list[tuple[str, list[str]]] = [
    ("saturates", ["saturated fatty acids", "saturated fat", "saturates", "gesättigte fettsäuren", "gesattigte fettsauren"]),
    ("mono-unsaturates", ["monounsaturates", "mono-unsaturates", "monounsaturated fat", "einfach ungesättigte fettsäuren", "einfach ungesattigte fettsauren"]),
    ("polyunsaturates", ["polyunsaturates", "polyunsaturated fat", "mehrfach ungesättigte fettsäuren", "mehrfach ungesattigte fettsauren"]),
    ("sugars", ["total sugars", "sugars", "sugar", "zucker"]),
    ("polyols", ["polyols", "mehrwertige alkohole"]),
    ("starch", ["starch", "stärke", "starke"]),
    ("fibre", ["dietary fibre", "fibre", "fiber", "ballaststoffe"]),
    ("fat", ["total fat", "fat", "fett"]),
    ("carbohydrate", ["carbohydrates", "carbohydrate", "kohlenhydrate"]),
    ("protein", ["protein", "proteins", "eiweiss", "eiweiß"]),
    ("salt", ["salt equivalent", "salt", "salz"]),
    ("energy", ["energy", "energie", "brennwert"]),
]

MICRONUTRIENT_TERMS: list[tuple[str, list[str]]] = [
    ("sodium", ["sodium", "natrium"]),
    ("potassium", ["potassium", "kalium"]),
    ("chloride", ["chloride", "chlorid"]),
    ("calcium", ["calcium", "kalzium"]),
    ("phosphorus", ["phosphorus", "phosphor"]),
    ("magnesium", ["magnesium"]),
    ("iron", ["iron", "eisen"]),
    ("zinc", ["zinc", "zink"]),
    ("copper", ["copper", "kupfer"]),
    ("manganese", ["manganese", "mangan"]),
    ("fluoride", ["fluoride", "fluorid"]),
    ("selenium", ["selenium", "selen"]),
    ("iodine", ["iodine", "jod"]),
    ("vitamin_b12", ["vitamin b12"]),
    ("vitamin_b6", ["vitamin b6"]),
    ("thiamin", ["vitamin b1", "thiamin", "thiamine"]),
    ("riboflavin", ["vitamin b2", "riboflavin"]),
    ("vitamin_a", ["vitamin a"]),
    ("vitamin_d", ["vitamin d"]),
    ("vitamin_e", ["vitamin e"]),
    ("vitamin_k", ["vitamin k"]),
    ("vitamin_c", ["vitamin c"]),
    ("niacin", ["niacin", "niacine"]),
    ("folate", ["folic acid", "folate", "folsäure", "folsaure"]),
    ("pantothenic acid", ["pantothenic acid", "pantothensäure", "pantothensaure"]),
    ("biotin", ["biotin"]),
    ("choline", ["choline", "cholin"]),
    ("linoleic acid", ["linoleic acid", "linolsäure", "linolsaure"]),
    ("alpha-linolenic acid", ["alpha-linolenic acid", "alpha-linolensäure", "alpha-linolensaure"]),
]

TABLE_TERMS = MACRONUTRIENT_TERMS + MICRONUTRIENT_TERMS
FUZZY_RATIO = 0.82


def _term_pattern(term: str) -> str:
    return re.escape(term).replace(r"\ ", r"[\s\-]*").replace(r"\-", r"[\s\-]*")


def _build(table: list[tuple[str, list[str]]]) -> list[tuple[str, re.Pattern[str]]]:
    return [
        (name, re.compile(rf"^\s*{OF_WHICH}(?:{'|'.join(_term_pattern(term) for term in terms)})\b", re.I))
        for name, terms in table
    ]


MACRONUTRIENT_RE = _build(MACRONUTRIENT_TERMS)
TABLE_RE = _build(TABLE_TERMS)

TABLE_HEADER_RE = re.compile(r"per\s*100|pro\s*100|je\s*100|100\s*(g|ml)\b|typical\s+values|nutrition|n[äa]hrwert|durchschnittliche", re.I)
PER_100_RE = re.compile(r"100\s*(g|ml)", re.I)
SERVING_RE = re.compile(r"serving|portion|per\s+pack|per\s+bar|per\s+slice|messl[öo]ffel|pro\s+glas", re.I)

INGREDIENTS_START_RE = re.compile(r"^\s*(ingredient|zutaten)", re.I)
SECTION_START_RE = re.compile(
    r"^\s*(nutrition|typical\s+values|nutritional|n[äa]hrwert|durchschnittliche|storage|store\b|keep\b|once\s+opened|"
    r"best\s+before|use\s+by|mindestens\s+haltbar|verbrauchen\s+bis|mhd\b|"
    r"net\s+(weight|quantity|content|wt)|f[üu]llmenge|nettof[üu]llmenge|nettogewicht|abtropfgewicht|"
    r"allerg|contains\b|may\s+contain|kann\s+spuren|suitable\s+for|zutaten|"
    r"k[üu]hl|lagern|aufbewahr|nach\s+dem\s+[öo]ffnen|"
    r"produced|packed|manufactured|distributed|www\.|for\s+more|customer|energy\b|energie\b|brennwert\b)",
    re.I,
)
ALLERGY_STATEMENT_RE = re.compile(r"^\s*(allerg\w*\s*(advice|information|hinweis)?\s*[:\-]?|contains\b|enth[äa]lt\b)", re.I)
MAY_CONTAIN_RE = re.compile(r"^\s*(may\s+contain|kann\s+spuren|not\s+suitable\s+for|made\s+in\s+a\s+(factory|site))", re.I)
STORAGE_START_RE = re.compile(
    r"^\s*(store\b|storage\b|keep\s+(refrigerated|frozen|in|cool)|once\s+opened|refrigerate|"
    r"k[üu]hl\b|trocken\s+lagern|gek[üu]hlt|nach\s+dem\s+[öo]ffnen|vor\s+w[äa]rme)",
    re.I,
)

NET_WORDS = r"net\s+(?:weight|quantity|content|wt)|nettof[üu]llmenge|f[üu]llmenge|nettogewicht|abtropfgewicht|inhalt"
NET_RE = re.compile(rf"^(?:(?:{NET_WORDS})\s*[:\-]?\s*)?({NUMBER})\s*(kg|g|ml|cl|litres?|l)\s*[e℮]?\s*$", re.I)
NET_LABELLED_RE = re.compile(rf"(?:{NET_WORDS})\s*[:\-]?\s*({NUMBER})\s*(kg|g|ml|cl|litres?|l)", re.I)

MONTHS = r"jan|feb|mar|m[äa]r|apr|may|mai|jun|jul|aug|sep|o[ck]t|nov|de[cz]"
DATE = (
    rf"\d{{1,2}}[\s./-]\d{{1,2}}[\s./-]\d{{2,4}}"
    rf"|\d{{1,2}}\s*\.?\s*(?:{MONTHS})\w*\s*\.?\s*\d{{2,4}}"
    rf"|(?:{MONTHS})\w*\s*\d{{4}}"
    rf"|\d{{1,2}}[./-]\d{{4}}"
)
DATE_RE = re.compile(DATE, re.I)
BEST_BEFORE_RE = re.compile(r"best\s*before(?:\s*end)?|mindestens\s*haltbar\s*bis|\bmhd\b", re.I)
USE_BY_RE = re.compile(r"use\s*by|(?:zu\s+)?verbrauchen\s+bis", re.I)

BARCODE_RE = re.compile(r"^\D{0,3}(\d[\d\s]{6,16}\d)\D{0,3}$")

MIN_TEXT_HEIGHT = 16
"""A text box shorter than this in the source image holds guesswork. The reader says so.

The box is taller than the print it holds. Sixteen pixels of box is about nine pixels of
print. Recognition below that is unreliable.
"""

ALLERGENS: dict[str, list[str]] = {
    "cereals containing gluten": [r"wheat", r"weizen", r"\brye\b", r"roggen", r"barley", r"gerste", r"\boats?\b", r"hafer", r"spelt", r"dinkel", r"kamut", r"gluten(?!\s*-?\s*(frei|free))", r"semolina", r"durum", r"grie(ss|ß)"],
    "crustaceans": [r"crustacean", r"krebstiere", r"prawns?", r"shrimps?", r"garnele", r"crab", r"krabbe", r"lobster", r"hummer", r"crayfish"],
    "eggs": [r"\beggs?\b", r"\beier?\b", r"eiklar", r"volleipulver", r"albumen", r"ovalbumin"],
    "fish": [r"\bfish\b", r"fisch", r"anchov", r"\bcod\b", r"tuna", r"thunfisch", r"salmon", r"lachs", r"haddock", r"sardine"],
    "peanuts": [r"peanuts?", r"erdnuss|erdn[üu]sse", r"groundnuts?", r"arachis"],
    "soybeans": [r"\bsoya\b", r"soybeans?", r"\bsoja\w*", r"tofu"],
    "milk": [r"\bmilk(?!\s*-?\s*free)\b", r"milch(?!\s*-?\s*frei)", r"lactose(?!\s*-?\s*free)", r"laktose(?!\s*-?\s*frei)", r"whey", r"molke\w*", r"casein", r"kasein", r"(?<!peanut )(?<!cocoa )(?<!shea )(?<!nut )butter", r"cheese", r"\bk[äa]se", r"(?<!coconut )(?<!oat )(?<!soya )cream", r"sahne", r"\brahm\b", r"yogh?urt", r"joghurt"],
    "nuts": [r"almonds?", r"mandeln?", r"hazelnuts?", r"haseln[üu]ss\w*", r"walnuts?", r"waln[üu]ss\w*", r"cashews?", r"pecans?", r"pekan\w*", r"brazil\s+nuts?", r"paranuss", r"pistachios?", r"pistazien?", r"macadamia", r"schalenfr[üu]chte"],
    "celery": [r"celery", r"sellerie", r"celeriac"],
    "mustard": [r"mustard", r"senf"],
    "sesame": [r"sesame", r"sesam", r"tahini"],
    "sulphur dioxide and sulphites": [r"sulphur\s+dioxide", r"schwefeldioxid", r"sul[pf]hites?", r"sulfite", r"e22[0-8]"],
    "lupin": [r"lupin", r"lupine"],
    "molluscs": [r"mollusc", r"weichtiere", r"mussels?", r"muscheln?", r"oysters?", r"austern?", r"squid", r"tintenfisch", r"octopus", r"scallops?", r"clams?"],
}
ALLERGEN_RE = {name: [re.compile(pattern, re.I) for pattern in patterns] for name, patterns in ALLERGENS.items()}


def repair_numbers(text: str) -> str:
    """Turn letters the engine mistook for digits back into digits.

    Only a token that already holds a digit and stands in front of a unit is touched.
    Because a) a pure word in front of a unit is a word not a number b) a number away
    from a unit carries no meaning on a label.
    """

    def replace(match: re.Match[str]) -> str:
        token = match.group(1)
        if not any(character.isdigit() for character in token):
            return token
        return token.translate(DIGIT_LOOKALIKES)

    return NUMBER_LIKE_RE.sub(replace, text)


def repair_units(text: str) -> str:
    for pattern, unit in UNIT_REPAIRS:
        text = pattern.sub(unit, text)
    return text


def parse_quantity(value: str, unit: str) -> Quantity:
    return Quantity(float(value.replace(",", ".")), UNIT_NAMES.get(unit.lower(), unit.lower()))


def find_quantities(text: str) -> list[Quantity]:
    prepared = repair_numbers(repair_units(text))
    return [parse_quantity(value, unit) for value, unit in QUANTITY_RE.findall(prepared)]


def _squash(text: str) -> str:
    """Strip everything a fuzzy comparison should not see."""
    return re.sub(r"[^0-9a-zäöüß]", "", text.lower())


LEAD_RE = re.compile(r"^[\s\-–•*]*(?:of\s+which|davon|dovon)?[\s:.\-–]*([^\d(]{3,40})", re.I)


def _match_table(text: str, patterns: list[tuple[str, re.Pattern[str]]], terms: list[tuple[str, list[str]]]) -> tuple[str, int] | None:
    cleaned = text.replace(":", " ")
    for name, pattern in patterns:
        match = pattern.match(cleaned)
        if match:
            return name, match.end()
    lead = LEAD_RE.match(cleaned)
    if not lead:
        return None
    candidate = _squash(lead.group(1))
    if len(candidate) < 4:
        return None
    for name, options in terms:
        for term in options:
            if SequenceMatcher(None, candidate, _squash(term)).ratio() >= FUZZY_RATIO:
                return name, lead.end(1)
    return None


def match_nutrient(text: str) -> str | None:
    """Name the macronutrient a line declares.

    Micronutrients stay out of this. Because a) it decides where a section ends b) an
    ingredient such as calcium carbonate would otherwise read as a nutrition row.
    """
    found = _match_table(text, MACRONUTRIENT_RE, MACRONUTRIENT_TERMS)
    return found[0] if found else None


def match_table_row(text: str) -> tuple[str, int] | None:
    return _match_table(text, TABLE_RE, TABLE_TERMS)


def _looks_like(word: str, target: str, ratio: float = 0.8) -> bool:
    return SequenceMatcher(None, word.lower(), target).ratio() >= ratio


def _collapse(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([,.;:%)])", r"\1", text)
    text = re.sub(r"\(\s+", "(", text)
    return text


class Columns:
    """Where the per 100 readings and the serving readings are printed.

    A panel printed beside another panel repeats both headings so each heading holds a
    list of positions.
    """

    def __init__(self, per_100: list[float], serving: list[float], basis: str | None, heading: str | None):
        self.per_100 = per_100
        self.serving = serving
        self.basis = basis
        self.heading = heading

    @property
    def split(self) -> bool:
        return bool(self.per_100 and self.serving)

    def column_of(self, centre: float) -> int:
        near_100 = min(abs(position - centre) for position in self.per_100)
        near_serving = min(abs(position - centre) for position in self.serving)
        return 0 if near_100 <= near_serving else 1


def _column_centres(rows: list[Row], start: int) -> Columns:
    """Read the column positions from the header of the nutrition table."""
    for row in rows[start : start + 3]:
        per_100: list[float] = []
        serving: list[float] = []
        basis = None
        heading = None
        for cell in row.cells:
            found = PER_100_RE.search(cell.text)
            if found:
                per_100.append(cell.box.centre_x)
                basis = f"per 100 {found.group(1).lower()}"
            elif SERVING_RE.search(cell.text):
                serving.append(cell.box.centre_x)
                heading = _collapse(cell.text)
        if per_100 or serving:
            return Columns(per_100, serving, basis, heading)
    return Columns([], [], None, None)


def _assign(values: list[tuple[Quantity, float]], columns: Columns) -> tuple[Quantity | None, Quantity | None]:
    """Put each reading in its column.

    Position decides only where the table declares both a per 100 column and a serving
    column. Because a) printed order settles every other table b) a reading missing
    from the first column is the case order cannot settle c) the position of a reading
    is meaningless where the heading it belongs to was never found.
    """
    if columns.split:
        found: list[Quantity | None] = [None, None]
        for quantity, centre in values:
            index = columns.column_of(centre)
            if found[index] is None:
                found[index] = quantity
        if any(item is not None for item in found):
            return found[0], found[1]
    ordered = [quantity for quantity, _centre in values]
    return (ordered[0] if ordered else None), (ordered[1] if len(ordered) > 1 else None)


def _segments(row: Row) -> list[tuple[str, list[tuple[Quantity, float]]]]:
    """Split a row into one part per nutrient.

    A label prints two panels side by side often enough that a row holds two nutrients.
    """
    segments: list[tuple[str, list[tuple[Quantity, float]]]] = []
    for cell in row.cells:
        found = match_table_row(cell.text)
        if found:
            name, end = found
            segments.append((name, [(quantity, cell.box.centre_x) for quantity in find_quantities(cell.text[end:])]))
        elif segments:
            segments[-1][1].extend((quantity, cell.box.centre_x) for quantity in find_quantities(cell.text))
    return segments


def parse_nutrition(rows: list[Row]) -> tuple[list[Nutrient], str | None, str | None]:
    start = None
    for index, row in enumerate(rows):
        if TABLE_HEADER_RE.search(row.text):
            start = index
            break
        if match_nutrient(row.text) and find_quantities(row.text):
            start = index
            break
    if start is None:
        return [], None, None

    columns = _column_centres(rows, start)
    nutrients: list[Nutrient] = []
    seen: set[str] = set()
    misses = 0
    for row in rows[start:]:
        segments = _segments(row)
        if not segments:
            misses += 1
            # Three lines without a nutrient name end the table.
            if misses >= 3 and nutrients:
                break
            continue
        misses = 0
        for name, values in segments:
            if name == "energy":
                for unit, label in (("kJ", "energy_kj"), ("kcal", "energy_kcal")):
                    same_unit = [pair for pair in values if pair[0].unit == unit]
                    if not same_unit or label in seen:
                        continue
                    per_100, per_serving = _assign(same_unit, columns)
                    nutrients.append(Nutrient(label, per_100, per_serving))
                    seen.add(label)
                continue
            if not values or name in seen:
                continue
            per_100, per_serving = _assign(values, columns)
            nutrients.append(Nutrient(name, per_100, per_serving))
            seen.add(name)

    basis = columns.basis
    if nutrients and basis is None:
        basis = "per 100 g"
    return nutrients, basis, columns.heading


def parse_ingredients(rows: list[Row]) -> str | None:
    start = None
    for index, row in enumerate(rows):
        words = row.text.split()
        if INGREDIENTS_START_RE.match(row.text) or (words and (_looks_like(words[0], "ingredients") or _looks_like(words[0], "zutaten"))):
            start = index
            break
    if start is None:
        return None

    first = re.sub(r"^\s*\S+\s*[:\-]?\s*", "", rows[start].text, count=1)
    parts = [first]
    for row in rows[start + 1 :]:
        if SECTION_START_RE.match(row.text) or match_nutrient(row.text):
            break
        parts.append(row.text)
    text = _collapse(" ".join(part for part in parts if part.strip()))
    return text or None


def _allergens_in(text: str) -> list[str]:
    if not text.strip():
        return []
    return [name for name, patterns in ALLERGEN_RE.items() if any(pattern.search(text) for pattern in patterns)]


def parse_allergens(rows: list[Row], ingredients: str | None) -> list[str]:
    """Read the declared allergens.

    The ingredients carry the declaration. An allergy advice line repeats it. A "may
    contain" warning is a different statement so it is read separately.
    """
    statements = [row.text for row in rows if ALLERGY_STATEMENT_RE.match(row.text) and not MAY_CONTAIN_RE.match(row.text)]
    return _allergens_in(" ".join([ingredients or ""] + statements))


def parse_may_contain(rows: list[Row]) -> list[str]:
    return _allergens_in(" ".join(row.text for row in rows if MAY_CONTAIN_RE.match(row.text)))


def parse_net_quantity(rows: list[Row]) -> Quantity | None:
    for row in rows:
        match = NET_LABELLED_RE.search(row.text)
        if match:
            return parse_quantity(match.group(1), match.group(2))
    for row in rows:
        if PER_100_RE.search(row.text) or match_nutrient(row.text):
            continue
        match = NET_RE.match(repair_numbers(row.text.strip()))
        if match:
            return parse_quantity(match.group(1), match.group(2))
    return None


def _date_text(value: str) -> str:
    # Small print often loses the space between the month and the year.
    return _collapse(re.sub(r"(?<=[A-Za-z])(?=\d)", " ", value))


def _date_after(rows: list[Row], index: int, tail: str) -> str | None:
    match = DATE_RE.search(tail)
    if match:
        return _date_text(match.group(0))
    for row in rows[index + 1 : index + 3]:
        match = DATE_RE.search(row.text)
        if match and len(row.text.strip()) <= 30:
            return _date_text(match.group(0))
    return None


def parse_dates(rows: list[Row]) -> tuple[str | None, str | None]:
    best_before = None
    use_by = None
    for index, row in enumerate(rows):
        text = row.text
        if best_before is None:
            match = BEST_BEFORE_RE.search(text)
            if match:
                best_before = _date_after(rows, index, text[match.end() :])
        if use_by is None:
            match = USE_BY_RE.search(text)
            if match:
                use_by = _date_after(rows, index, text[match.end() :])
    return best_before, use_by


def parse_storage(rows: list[Row]) -> str | None:
    parts: list[str] = []
    for index, row in enumerate(rows):
        if not STORAGE_START_RE.match(row.text):
            continue
        parts.append(row.text)
        for follower in rows[index + 1 : index + 3]:
            if STORAGE_START_RE.match(follower.text):
                parts.append(follower.text)
                continue
            if SECTION_START_RE.match(follower.text) or match_nutrient(follower.text):
                break
            parts.append(follower.text)
        break
    return _collapse(" ".join(parts)) or None


def parse_barcode(rows: list[Row]) -> str | None:
    for row in rows:
        match = BARCODE_RE.match(row.text.strip())
        if not match:
            continue
        digits = re.sub(r"\s", "", match.group(1))
        if len(digits) in (8, 12, 13, 14):
            return digits
    return None


def _is_wording(text: str) -> bool:
    """Test whether a line is wording rather than a reading or a fragment."""
    letters = len(re.sub(r"[^A-Za-zÄÖÜäöüß]", "", text))
    solid = len(re.sub(r"\s", "", text))
    return letters >= 3 and solid > 0 and letters / solid >= 0.6


NAME_HEIGHT_RATIO = 1.4
"""A product name is printed larger than the rest.

Because a) a nutrition panel photographed on its own carries no name b) the largest line
of a panel is still a table row c) demanding a line well above the usual height is what
separates a name from a row.
"""


def parse_product_name(rows: list[Row]) -> str | None:
    if not rows:
        return None
    page_bottom = max(row.box.bottom for row in rows)
    usual = median([cell.box.height for row in rows for cell in row.cells])
    best: tuple[float, Row] | None = None
    for row in rows:
        if row.box.top > page_bottom * 0.45:
            continue
        text = row.text.strip()
        if not _is_wording(text) or find_quantities(text):
            continue
        if SECTION_START_RE.match(text) or INGREDIENTS_START_RE.match(text):
            continue
        if any(match_table_row(cell.text) for cell in row.cells):
            continue
        height = max(cell.box.height for cell in row.cells)
        if height < usual * NAME_HEIGHT_RATIO:
            continue
        if best is None or height > best[0]:
            best = (height, row)
    return _collapse(best[1].text) if best else None


def check_resolution(rows: list[Row]) -> str | None:
    """Warn where the print is too small to read.

    Boxes are in the coordinates of the source image so the height is the height the
    camera captured.
    """
    if not rows:
        return "no text was found"
    heights = [cell.box.height for row in rows for cell in row.cells]
    typical = median(heights)
    if typical >= MIN_TEXT_HEIGHT:
        return None
    return (
        f"the print is about {typical:.0f} pixels tall in this image. "
        f"Readings below {MIN_TEXT_HEIGHT} pixels are unreliable. Photograph the label closer."
    )


def parse_rows(rows: list[Row]) -> Label:
    ingredients = parse_ingredients(rows)
    nutrition, basis, serving = parse_nutrition(rows)
    best_before, use_by = parse_dates(rows)
    warning = check_resolution(rows)
    return Label(
        product_name=parse_product_name(rows),
        net_quantity=parse_net_quantity(rows),
        ingredients=ingredients,
        allergens=parse_allergens(rows, ingredients),
        may_contain=parse_may_contain(rows),
        nutrition=nutrition,
        nutrition_basis=basis,
        serving=serving,
        best_before=best_before,
        use_by=use_by,
        storage=parse_storage(rows),
        barcode=parse_barcode(rows),
        warnings=[warning] if warning else [],
        rows=rows,
    )
