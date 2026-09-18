"""Pairing a formula step with the breast milk a baby of that age drinks."""

import json
import statistics
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import reference  # noqa: E402
from compare_data import MOTHER, against, age_span, build, sold_from  # noqa: E402
from make_page import ready_to_drink, repacks  # noqa: E402


@pytest.mark.parametrize("name, months", [
    ("Anfangsmilch Pre von Geburt an, 800 g", (0.0, None)),
    ("Folgemilch 2 nach dem 6. Monat, 600 g", (6.0, None)),
    ("Folgemilch 3 ab dem 10.Monat, 500 g", (10.0, None)),
    ("Kindermilch ab 1 Jahr, 600 g", (12.0, None)),
    ("Kindergetränk ab 2 Jahren, 400 g", (24.0, None)),
    ("1. bis 2. Monat", (1.0, 2.0)),
    ("8. bis 8,5. Monat", (8.0, 8.5)),
])
def test_the_age_is_read_off_the_name(name, months):
    assert age_span(name) == months


def test_a_lactation_window_in_days_becomes_months():
    start, end = age_span("4. bis 17. Tag")
    assert start == pytest.approx(4 / 30.44)
    assert end == pytest.approx(17 / 30.44)


def test_a_name_with_no_age_gives_nothing():
    assert age_span("Ziegenmilch Bio") is None


def test_the_step_takes_the_age_most_of_its_packs_declare():
    packs = [{"name": "Folgemilch 2 nach dem 6. Monat"}] * 5
    packs += [{"name": "Folgemilch 2 ab dem 7. Monat"}]
    assert sold_from(packs) == 6.0
    assert sold_from([{"name": "Ziegenmilch"}]) is None


@pytest.fixture(scope="module")
def data():
    collected = json.loads((ROOT / "products.json").read_text(encoding="utf-8"))["products"]
    kept = [p for p in reference.merge(collected) if not ready_to_drink(p)]
    dropped = repacks(kept)
    return build([p for p in kept if p["dan"] not in dropped])


@pytest.fixture(scope="module")
def pairs(data):
    return against(data)


def test_only_the_steps_breast_milk_reaches_pair_with_it(pairs):
    """MILQ stops at 8,5 months so no step sold from 10 months on faces breast milk."""
    from compare_data import MOTHER
    against_milk = [p["stage"] for p in pairs if p["reference"] == MOTHER]
    assert against_milk == ["Pre", "1", "2", "Spezialnahrung"]


def test_a_pair_holds_only_the_windows_that_share_its_months(pairs, data):
    held = {p["stage"]: p for p in pairs}
    assert len(held["Pre"]["windows"]) == 7
    assert held["Pre"]["windows"][0] == "4. bis 17. Tag"
    assert held["2"]["windows"] == ["6. bis 7. Monat", "7. bis 8. Monat", "8. bis 8,5. Monat"]
    assert held["2"]["from"] == 6.0
    assert held["2"]["to"] == 10.0


def test_the_milk_figure_is_the_median_of_the_matched_windows_alone(pairs, data):
    milk = {a["variant"]: a for a in data["articles"] if a["stage"] == MOTHER}
    for pair in pairs:
        if pair["reference"] != MOTHER:
            continue
        for nutrient in pair["nutrients"]:
            declared = [milk[w]["values"][nutrient["name"]] for w in pair["windows"]
                        if nutrient["name"] in milk[w]["values"]]
            assert nutrient["milk"]["median"] == pytest.approx(statistics.median(declared))
            assert nutrient["milk"]["count"] == len(declared)


def test_the_field_figure_is_the_median_of_that_step_alone(pairs, data):
    for pair in pairs:
        articles = [a for a in data["articles"] if a["stage"] == pair["stage"]]
        for nutrient in pair["nutrients"]:
            declared = [a["values"][nutrient["name"]] for a in articles
                        if nutrient["name"] in a["values"]]
            assert nutrient["field"]["median"] == pytest.approx(statistics.median(declared))


def test_a_nutrient_only_one_side_declares_is_left_out(pairs):
    for pair in pairs:
        for nutrient in pair["nutrients"]:
            assert nutrient["milk"]["count"] >= 1
            assert nutrient["field"]["count"] >= 1


def test_no_pair_when_there_is_no_reference(data):
    from compare_data import REFERENCES
    plain = dict(data)
    plain["articles"] = [a for a in data["articles"] if a["stage"] not in REFERENCES]
    assert against(plain) == []


def test_without_cow_milk_only_breast_milk_pairs(data):
    from compare_data import COW, MOTHER
    plain = dict(data)
    plain["articles"] = [a for a in data["articles"] if a["stage"] != COW]
    paired = against(plain)
    assert {p["reference"] for p in paired} == {MOTHER}
    assert [p["stage"] for p in paired] == ["Pre", "1", "2", "Spezialnahrung"]


def test_what_the_pairing_actually_finds(pairs):
    """The two ends of the answer the option was built to give."""
    pre = next(p for p in pairs if p["stage"] == "Pre")
    times = {n["name"]: n["field"]["median"] / n["milk"]["median"] for n in pre["nutrients"]}
    # a Pre recipe matches the energy of the milk it imitates
    assert times["Brennwert"] == pytest.approx(1.08, abs=0.05)
    # and it does not match the iron because formula iron is absorbed far less well
    assert times["Eisen"] > 15
    # a few nutrients run the other way
    assert times["Inositol"] < 0.5


# --- the star wall -------------------------------------------------------------------


def test_the_star_wall_is_an_option_against_the_milk():
    from make_views import VIEWS
    view = next(v for v in VIEWS if v["key"] == "stars")
    assert view["group"] == "against"
    assert view["controls"] == ["pair", "spokes", "view", "clear"]
    assert "clear" in view["controls"], "a wall you can hold plots on needs a way to let go"


def test_every_spoke_group_names_nutrients_the_pairing_offers(pairs):
    """A spoke that no step declares would draw an arm that is always missing."""
    import re

    from make_views import VIEWS
    draw = next(v for v in VIEWS if v["key"] == "stars")["draw"]
    groups = re.search(r"const SPOKES = \{(.*?)\n\};", draw, re.S).group(1)
    wanted = set(re.findall(r"'([^']+)'", groups))
    offered = {n["name"] for p in pairs for n in p["nutrients"]}
    assert wanted, "no spokes were parsed out of the draw"
    assert wanted <= offered, sorted(wanted - offered)


def test_the_draw_touches_no_document_before_the_shared_script_runs():
    """A page puts the draw block before the shared script so el is not defined yet."""
    import re

    from make_views import VIEWS
    for view in VIEWS:
        body = view["draw"]
        # strip everything inside a function so only top level statements are left
        depth, top = 0, []
        for line in body.splitlines():
            if depth == 0 and re.match(r"\s*el\(", line):
                top.append(line.strip())
            depth += line.count("{") - line.count("}")
        assert top == [], (view["key"], top)


def test_the_star_block_declares_no_name_the_shared_script_already_has():
    """Two top level consts of one name in two script tags is a syntax error."""
    import re

    from make_views import SCRIPT, STAR_DRAW
    mine = set(re.findall(r"^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)", STAR_DRAW, re.M))
    theirs = set(re.findall(r"^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)", SCRIPT, re.M))
    assert mine
    assert mine & theirs <= {"drawChart", "viewTable"}, sorted(mine & theirs)


# --- cow milk as the second reference ------------------------------------------------


def test_cow_milk_is_one_article_of_its_own_stage():
    from compare_data import COW, REFERENCES
    cows = reference.cow_products()
    assert len(cows) == 1
    assert cows[0]["brand"] == COW
    assert COW in REFERENCES
    assert cows[0]["net_quantity"] == ""  # no pack so neither filter touches it


def test_the_cow_article_names_the_age_it_is_for():
    """The pairing reads the age off the name so the phrasing has to match a pack."""
    from compare_data import age_span
    name = reference.cow_products()[0]["name"]
    assert age_span(name) == (12.0, None)


def test_the_steps_of_twelve_months_pair_with_cow_milk(pairs):
    held = {p["stage"]: p for p in pairs}
    assert [p["stage"] for p in pairs] == ["Pre", "1", "2", "4", "Kindermilch", "Spezialnahrung"]
    assert held["Pre"]["reference"] == "Muttermilch"
    assert held["4"]["reference"] == "Kuhmilch"
    assert held["Kindermilch"]["reference"] == "Kuhmilch"


def test_stage_three_still_reaches_neither(pairs, data):
    """Breast milk stops at 8,5 months and cow milk starts at 12 so nothing covers 10 to 12."""
    assert "3" in data["stages"]
    assert "3" not in {p["stage"] for p in pairs}


def test_a_reference_that_declares_none_of_something_is_named_not_divided_by(pairs):
    """Cow milk carries no vitamin C so a ratio against it would be infinite."""
    held = {p["stage"]: p for p in pairs}
    assert "Vitamin C" in held["Kindermilch"]["none_of_it"]
    assert "Vitamin C" not in {n["name"] for n in held["Kindermilch"]["nutrients"]}
    for pair in pairs:
        for nutrient in pair["nutrients"]:
            assert nutrient["milk"]["median"] > 0, (pair["stage"], nutrient["name"])


def test_what_the_cow_milk_pairing_finds(pairs):
    """Kindermilch is sold against cow milk so this is the comparison it rests on."""
    held = {p["stage"]: p for p in pairs}["Kindermilch"]
    times = {n["name"]: n["field"]["median"] / n["milk"]["median"] for n in held["nutrients"]}
    assert times["Eisen"] > 20          # the claim it is sold on
    assert times["Vitamin D"] > 10
    assert times["Eiweiß"] < 0.5        # and a third of the protein
    assert times["Brennwert"] == pytest.approx(1.0, abs=0.1)


def test_a_reference_is_never_counted_as_a_step(data):
    """A reference is a milk to read against and not a rung of the ladder."""
    from compare_data import REFERENCES, step_spans
    spans = step_spans(data)
    for name in REFERENCES:
        assert name not in spans
