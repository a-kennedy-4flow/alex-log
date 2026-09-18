"""Every figure on every article page names where it came from."""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import reference  # noqa: E402
from make_page import item_html, sources_html, table_html  # noqa: E402

DATA = ROOT / "breastmilk.json"


@pytest.fixture(scope="module")
def payload():
    return json.loads(DATA.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def articles():
    return reference.products(DATA)


def test_every_figure_names_a_study_that_exists(payload):
    for one in payload["nutrients"]:
        assert one["source"] in payload["sources"], one["name"]


def test_every_study_is_actually_used(payload):
    """A citation nothing rests on is a citation that has gone stale."""
    used = {one["source"] for one in payload["nutrients"]}
    assert set(payload["sources"]) == used


def test_every_study_can_be_looked_up(payload):
    for key, source in payload["sources"].items():
        assert source["citation"].strip(), key
        assert source.get("doi") or source.get("url") or source.get("pmcid"), key


def test_every_measurement_carries_its_source(articles):
    for article in articles:
        for nutrient in article["nutrition"]["nutrients"]:
            for measurement in nutrient["measurements"]:
                assert measurement.get("source"), (article["name"], nutrient["name"])


def test_cited_by_names_each_study_once_in_table_order(articles):
    for article in articles:
        cited = reference.cited_by(article)
        assert len(cited) == len(set(cited))
        first_seen = []
        for nutrient in article["nutrition"]["nutrients"]:
            key = nutrient["measurements"][0]["source"]
            if key not in first_seen:
                first_seen.append(key)
        assert cited == first_seen


def test_a_reference_row_prints_a_source_column(articles):
    article = articles[2]
    cited = reference.cited_by(article)
    built = table_html(article["nutrition"], cited, article["dan"])
    assert "Src" in built
    assert f'href="#src-{article["dan"]}-{cited[0]}"' in built


def test_a_dm_row_prints_no_source_column():
    table = {
        "caption": "Durchschnittliche Nährwertangaben",
        "bases": ["pro 100 ml"],
        "nutrients": [{"name": "Brennwert",
                       "measurements": [{"basis": "pro 100 ml", "text": "285 kJ",
                                         "quantities": [{"value": 285.0, "unit": "kJ"}]}]}],
    }
    built = table_html(table, [], 1230306)
    assert "Src" not in built
    assert "src-" not in built


def test_a_dm_article_names_dm_and_the_day_it_was_collected():
    product = {"dan": 1230306, "url": "https://www.dm.de/p/d/1230306/x", "nutrition": None}
    built = sources_html(product, [], "13 September 2026")
    assert "dm publishes it" in built
    assert "13 September 2026" in built
    assert "https://www.dm.de/p/d/1230306/x" in built
    assert "Nothing was corrected." in built


def test_a_reference_article_prints_every_citation_it_rests_on(articles):
    article = articles[2]
    cited = reference.cited_by(article)
    built = sources_html(article, cited, "13 September 2026")
    known = reference.sources(DATA)
    for key in cited:
        assert f'id="src-{article["dan"]}-{key}"' in built
        assert known[key]["citation"][:50] in built


def test_the_panel_of_every_kind_carries_a_source(articles):
    milk = item_html(articles[0], "13 September 2026")
    assert 'class="sources"' in milk and "Sources." in milk
    pack = item_html({
        "dan": 1230306, "gtin": 4018852021117, "brand": "Bebivita",
        "name": "Folgemilch 3 ab dem 10.Monat, 500 g", "legal_category": "Folgenahrung",
        "net_quantity": "500 g", "url": "https://www.dm.de/p/d/1230306/x", "nutrition": None,
    }, "13 September 2026")
    assert 'class="sources"' in pack and "Source." in pack


@pytest.mark.parametrize("name, unit, first, last", [
    # 6 µg/L from the EFSA assessment
    ("Fluorid", "mg", 0.0006, 0.0006),
    # 406 nmol/ml in colostrum and 335 in mature milk at 125,15 g per mole
    ("Taurin", "mg", 406 * 125.15 / 10000, 335 * 125.15 / 10000),
    # the medians of 79 samples
    ("Molybdän", "µg", 0.318, 0.318),
    ("Chrom", "µg", 0.1, 0.1),
    # the middle of the range LactMed calls the average
    ("Vitamin C", "mg", 7.0, 7.0),
])
def test_the_figures_added_by_the_later_research(payload, name, unit, first, last):
    one = next(n for n in payload["nutrients"] if n["name"] == name and n["unit"] == unit)
    values = list(one["per_100_ml"].values())
    assert values[0] == pytest.approx(first)
    assert values[-1] == pytest.approx(last)


def test_a_figure_with_a_published_spread_carries_it(articles):
    article = articles[2]
    found = {n["name"]: n["measurements"][0] for n in article["nutrition"]["nutrients"]}
    assert found["Vitamin C"]["published_range"] == [5.0, 9.0]
    assert found["Molybdän"]["published_range"] == [0.01, 2.591]
    # a figure the study published as one number carries no spread
    assert "published_range" not in found["Brennwert"]


def test_the_weakest_figure_says_so(payload):
    """Manganese rests on one study and a second reading disagrees with it.

    The caveat sits on the manganese row rather than on the study so it does not follow
    every other nutrient that study supplies.
    """
    mangan = next(n for n in payload["nutrients"] if n["name"] == "Mangan")
    assert "Frisbie" in mangan["note"]
    assert "one study" in mangan["note"]
    folate = next(n for n in payload["nutrients"] if n["name"] == "Folat, gesamt")
    assert folate["source"] == mangan["source"]
    assert "Frisbie" not in folate.get("note", "")


# --- one substance under two printed names ------------------------------------------


def test_the_two_names_for_milk_sugar_never_appear_together():
    """The evidence that they are one nutrient rather than a total and its fraction."""
    collected = json.loads((ROOT / "products.json").read_text(encoding="utf-8"))["products"]
    lactose, sugar = set(), set()
    for product in collected:
        names = {n["name"] for n in (product.get("nutrition") or {}).get("nutrients", [])}
        if "Laktose" in names:
            lactose.add(product["dan"])
        if "davon Milchzucker" in names:
            sugar.add(product["dan"])
    assert lactose and sugar
    assert lactose & sugar == set()
    assert len(lactose | sugar) == len(lactose) + len(sugar)


def test_the_fold_puts_both_names_under_one():
    from compare_data import folded
    assert list(folded({"davon Milchzucker": {"text": "7,2 g"}})) == ["Laktose"]
    assert list(folded({"Laktose": {"text": "7,2 g"}})) == ["Laktose"]


def test_the_total_folate_wins_where_a_pack_prints_both():
    from compare_data import folded
    both = folded({"Folsäure": {"text": "10 µg"}, "Folat, gesamt": {"text": "14 µg"}})
    assert both == {"Folat": {"text": "14 µg"}}
    assert folded({"Folsäure": {"text": "10 µg"}}) == {"Folat": {"text": "10 µg"}}


def test_the_fold_never_loses_or_doubles_a_row():
    from compare_data import FOLD, folded
    collected = json.loads((ROOT / "products.json").read_text(encoding="utf-8"))["products"]
    for product in collected:
        table = product.get("nutrition") or {}
        for basis in table.get("bases", []):
            declared = {n["name"]: n for n in table["nutrients"]
                        if any(m["basis"] == basis for m in n["measurements"])}
            after = folded(declared)
            # every folded name is one of the names that went in
            assert set(after) == {FOLD.get(name, name) for name in declared}
            assert len(after) <= len(declared)


def test_the_old_names_never_reach_a_chart():
    import reference as ref
    from compare_data import build
    from make_page import ready_to_drink, repacks
    collected = json.loads((ROOT / "products.json").read_text(encoding="utf-8"))["products"]
    kept = [p for p in ref.merge(collected) if not ready_to_drink(p)]
    dropped = repacks(kept)
    charted = {n["name"] for n in build([p for p in kept if p["dan"] not in dropped])["nutrients"]}
    assert "Laktose" in charted and "Folat" in charted
    for gone in ("davon Milchzucker", "Folat, gesamt", "Folsäure"):
        assert gone not in charted


def test_breast_milk_declares_folate_once_the_names_are_folded():
    """Human milk carries natural folate and never folic acid."""
    import reference as ref
    from compare_data import MOTHER, build
    from make_page import ready_to_drink, repacks
    collected = json.loads((ROOT / "products.json").read_text(encoding="utf-8"))["products"]
    kept = [p for p in ref.merge(collected) if not ready_to_drink(p)]
    dropped = repacks(kept)
    data = build([p for p in kept if p["dan"] not in dropped])
    milk = [a for a in data["articles"] if a["stage"] == MOTHER]
    assert any("Folat" in a["values"] for a in milk)


def test_no_name_i_added_is_a_near_miss_of_one_dm_prints(payload):
    """dm writes LNnt with a small t. A name that differs by a letter never matches."""
    import re
    import unicodedata

    def fold(text):
        text = unicodedata.normalize("NFKD", text).replace("ß", "ss").replace("\u2019", "'")
        text = "".join(c for c in text if not unicodedata.combining(c))
        return re.sub(r"[^a-z0-9]", "", text.lower())

    collected = json.loads((ROOT / "products.json").read_text(encoding="utf-8"))["products"]
    printed = {n["name"] for p in collected
               for n in (p.get("nutrition") or {}).get("nutrients", [])}
    by_fold = {fold(name): name for name in printed}
    for one in payload["nutrients"]:
        name = one["name"]
        if name in printed:
            continue
        # a name nobody prints is fine. A name that folds onto one nobody prints is a typo.
        assert fold(name) not in by_fold, (name, by_fold.get(fold(name)))


def test_the_names_breast_milk_alone_declares_are_the_expected_ones(payload):
    collected = json.loads((ROOT / "products.json").read_text(encoding="utf-8"))["products"]
    printed = {n["name"] for p in collected
               for n in (p.get("nutrition") or {}).get("nutrients", [])}
    mine = {n["name"] for n in payload["nutrients"]}
    # 3-FL is a real oligosaccharide of human milk that no pack on the shelf adds
    assert mine - printed == {"3-Fucosyllactose (3-FL)"}
