"""The breast milk reference articles and the age step they are held in."""

import json
import statistics
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import reference  # noqa: E402
from compare_data import MOTHER, STAGE_ORDER, build, stage_of, variant_of  # noqa: E402
from make_page import ready_to_drink, repacks  # noqa: E402

DATA = ROOT / "breastmilk.json"


@pytest.fixture(scope="module")
def payload():
    return json.loads(DATA.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def articles():
    return reference.products(DATA)


def test_german_prints_a_comma_and_a_thousands_stop():
    assert reference.german(3.43) == "3,43"
    assert reference.german(262.3368) == "262"
    assert reference.german(0.00019589) == "0,000196"
    assert reference.german(1234.5) == "1.230"
    assert reference.german(5.0) == "5"
    assert reference.german(0) == "0"


def test_one_article_per_lactation_window(payload, articles):
    assert len(articles) == len(payload["windows"])
    assert [one["name"] for one in articles] == [w["name"] for w in payload["windows"]]
    assert {one["brand"] for one in articles} == {reference.BRAND}
    assert len({one["dan"] for one in articles}) == len(articles)


def test_the_article_numbers_cannot_collide_with_dm():
    collected = json.loads((ROOT / "products.json").read_text(encoding="utf-8"))
    taken = {product["dan"] for product in collected["products"]}
    assert taken.isdisjoint({one["dan"] for one in reference.products(DATA)})


def test_every_declaration_is_read_as_the_baby_drinks_it(articles):
    for one in articles:
        table = one["nutrition"]
        assert table["bases"] == ["pro 100 ml"]
        assert table["nutrients"]
        for nutrient in table["nutrients"]:
            for measurement in nutrient["measurements"]:
                assert measurement["basis"] == "pro 100 ml"
                assert measurement["quantities"]
                assert measurement["text"]


def test_the_energy_row_carries_both_units_the_way_a_pack_prints_them(articles):
    for one in articles:
        energy = next(n for n in one["nutrition"]["nutrients"] if n["name"] == "Brennwert")
        units = [q["unit"] for q in energy["measurements"][0]["quantities"]]
        assert units == ["kJ", "kcal"]
        assert " / " in energy["measurements"][0]["text"]


def test_a_nutrient_no_source_covers_is_left_undeclared(articles):
    """Vitamin D is only published from the second month on."""
    first = {n["name"] for n in articles[0]["nutrition"]["nutrients"]}
    later = {n["name"] for n in articles[2]["nutrition"]["nutrients"]}
    assert "Vitamin D" not in first
    assert "Vitamin D" in later


def test_the_milk_is_not_taken_for_a_drink_or_for_a_repack(articles):
    assert not any(ready_to_drink(one) for one in articles)
    assert repacks(articles) == set()


def test_the_brand_names_the_step_and_the_dm_names_still_read(articles):
    for one in articles:
        assert stage_of(one["name"], one["brand"]) == MOTHER
    assert stage_of("Anfangsmilch 1 von Geburt an, 800 g") == "1"
    assert stage_of("Pre Anfangsmilch, 800 g") == "Pre"
    assert stage_of("Spezialnahrung Muttermilchsupplement, 200 g") == "Spezialnahrung"
    assert STAGE_ORDER[0] == MOTHER


def test_the_window_survives_the_variant_label():
    """The stage token rule would otherwise eat the day the window opens on."""
    assert variant_of("4. bis 17. Tag", MOTHER) == "4. bis 17. Tag"
    assert variant_of("1. bis 2. Monat", MOTHER) == "1. bis 2. Monat"


def test_merge_puts_every_reference_first_and_keeps_the_rest(articles):
    cows = reference.cow_products()
    collected = [{"dan": 1, "brand": "HiPP", "name": "x"}]
    merged = reference.merge(collected, DATA)
    assert merged[: len(articles)] == articles
    assert merged[len(articles):len(articles) + len(cows)] == cows
    assert merged[len(articles) + len(cows):] == collected


def _prepared(products):
    kept = [p for p in products if not ready_to_drink(p)]
    dropped = repacks(kept)
    return [p for p in kept if p["dan"] not in dropped]


@pytest.fixture(scope="module")
def both():
    collected = json.loads((ROOT / "products.json").read_text(encoding="utf-8"))["products"]
    return (build(_prepared(collected)),
            build(_prepared(reference.merge(collected, DATA))))


def test_the_reference_becomes_its_own_step(both):
    without, with_milk = both
    assert MOTHER not in without["stages"]
    assert with_milk["stages"][0] == MOTHER
    held = [a for a in with_milk["articles"] if a["stage"] == MOTHER]
    assert len(held) == len(reference.products(DATA))


def test_no_formula_step_median_moves(both):
    """A reference must not shift the field every pack is measured against.

    It must not tip the unit either. Linolsäure is declared in grams by 36 packs and in
    milligrams by 39, so two reference articles voting would flip the whole column.
    """
    without, with_milk = both
    for stage in [s for s in without["stages"]]:
        for nutrient in without["nutrients"]:
            name = nutrient["name"]
            def median(data):
                values = [a["values"][name] for a in data["articles"]
                          if a["stage"] == stage and name in a["values"]]
                return statistics.median(values) if values else None
            assert median(without) == median(with_milk), (stage, name)


def test_the_milk_changes_over_lactation(both):
    """The whole reason there is an article per window rather than one article."""
    _, with_milk = both
    held = [a for a in with_milk["articles"] if a["stage"] == MOTHER]
    energy = [a["values"]["Brennwert"] for a in held]
    protein = [a["values"]["Eiweiß"] for a in held]
    assert energy[0] > energy[-1]
    assert protein[0] > protein[-1]
    assert len(set(energy)) > 1


@pytest.mark.parametrize("window, name, unit, published", [
    # MILQ publishes per litre so the per 100 ml column is a tenth of it
    ("1-2 m", "Eiweiß", "g", 9.81 / 10),
    ("1-2 m", "Fett", "g", 34.3 / 10),
    ("1-2 m", "Calcium", "mg", 294 / 10),
    ("1-2 m", "Vitamin B 2, Riboflavin", "mg", 124.0 / 10 / 1000),
    # Hopperton publishes per 100 g and 100 ml of milk weighs 103,1 g
    ("1-2 m", "Vitamin K", "µg", 0.19 * 1.031),
    ("1-2 m", "Jod", "µg", 18.25 * 1.031),
])
def test_the_figure_is_the_published_one(payload, window, name, unit, published):
    entry = next(one for one in payload["nutrients"]
                 if one["name"] == name and one["unit"] == unit)
    assert entry["per_100_ml"][window] == pytest.approx(published, rel=1e-6)


def test_every_number_names_the_study_it_came_from(payload):
    for one in payload["nutrients"]:
        assert one["source"] in payload["sources"], one["name"]
        assert one["per_100_ml"]
    for key, source in payload["sources"].items():
        assert source["citation"].strip(), key
        assert source.get("doi") or source.get("url"), key
