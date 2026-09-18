"""The comparable set and the chart page."""

import json
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import make_chart  # noqa: E402
from compare_data import (  # noqa: E402
    build,
    canonical_units,
    nutrient_order,
    ready_basis_of,
    stage_of,
    value_in,
    variant_of,
)

VOID = {"meta", "link", "br", "hr", "img", "input", "source", "col", "area", "base"}


def article(name, bases, nutrients, brand="HiPP", dan=1, size=""):
    return {
        "dan": dan,
        "gtin": 4000000000000 + dan,
        "brand": brand,
        "name": name,
        "legal_category": "",
        "net_quantity": size,
        "url": f"https://www.dm.de/p/d/{dan}/x",
        "nutrition": {"caption": "", "bases": bases, "nutrients": nutrients},
    }


def nutrient(name, basis, text, *quantities):
    return {
        "name": name,
        "measurements": [
            {
                "basis": basis,
                "text": text,
                "quantities": [
                    {"value": value, "unit": unit, "qualifier": None} for value, unit in quantities
                ],
            }
        ],
    }


READY = "pro 100 ml des verzehrfertigen Erzeugnisses"


def test_reads_the_age_step_off_the_name():
    assert stage_of("Anfangsmilch Pre von Geburt an, 500 g") == "Pre"
    assert stage_of("Anfangsmilch 1 von Geburt an, 500 g") == "1"
    assert stage_of("Anfangsmilch HA1 Combiotik von Geburt an, 600 g") == "1"
    assert stage_of("Folgemilch 2 nach dem 6. Monat, 500 g") == "2"
    assert stage_of("Folgemilch 3 ab dem 10. Monat, 500 g") == "3"
    assert stage_of("Folgemilch 4 ab dem 12. Monat, 600 g") == "4"
    assert stage_of("Kindermilch Combiotik ab 1 Jahr, 600 g") == "Kindermilch"
    assert stage_of("Spezialnahrung Anti-Reflux von Geburt an, 600 g") == "Spezialnahrung"


def test_a_special_food_never_counts_as_an_ordinary_step():
    assert stage_of("Anfangsmilch FMS Muttermilchsupplement von Geburt an, 200 g") == "Spezialnahrung"


def test_a_toddler_milk_never_counts_as_stage_one():
    assert stage_of("Kindermilch 1 ab dem 12.Monat, 0,5 kg") == "Kindermilch"


def test_the_label_keeps_only_what_tells_two_packs_apart():
    assert variant_of("Anfangsmilch Pre Combiotik von Geburt an, 600 g", "Pre", "600 g") == "Combiotik"
    assert variant_of("Anfangsmilch Pre von Geburt an, 500 g", "Pre", "500 g") == ""
    assert variant_of("Folgemilch 2 aus Ziegenmilch nach dem 6. Monat, 400 g", "2", "400 g") == "aus Ziegenmilch"


def test_the_label_keeps_the_hypoallergenic_mark():
    assert variant_of("Folgemilch HA2 Combiotik nach dem 6.Monat, 600 g", "2", "600 g") == "HA Combiotik"
    assert variant_of("Anfangsmilch HA1 Combiotik von Geburt an, 600 g", "1", "600 g") == "HA Combiotik"


def test_the_label_keeps_the_toddler_tier():
    assert variant_of("Kindermilch Combiotik ab 1 Jahr, 600 g", "Kindermilch", "600 g") == "Combiotik 1+"
    assert variant_of("Kindermilch Combiotik ab 2 Jahren, 600 g", "Kindermilch", "600 g") == "Combiotik 2+"
    assert variant_of("Kindermilch 1 ab dem 12.Monat, 0,5 kg", "Kindermilch", "0,5 kg") == "1+"


def test_finds_the_column_that_counts_the_milk_as_fed():
    assert ready_basis_of(article("x", [READY], [])) == READY
    assert ready_basis_of(article("x", ["pro 100 g", "pro 100 ml"], [])) == "pro 100 ml"
    assert ready_basis_of(article("x", ["pro 100 g"], [])) is None


def test_picks_the_unit_most_brands_declared():
    units = canonical_units([
        {"DHA": {"quantities": [{"value": 13.6, "unit": "mg"}]}},
        {"DHA": {"quantities": [{"value": 12.0, "unit": "mg"}]}},
        {"DHA": {"quantities": [{"value": 0.017, "unit": "g"}]}},
    ])
    assert units["DHA"] == "mg"


def test_energy_is_always_the_kilocalorie():
    units = canonical_units([{"Brennwert": {"quantities": [
        {"value": 285, "unit": "kJ"}, {"value": 68, "unit": "kcal"}]}}])
    assert units["Brennwert"] == "kcal"


def test_converts_a_declaration_into_the_chosen_unit():
    grams = {"quantities": [{"value": 0.017, "unit": "g"}]}
    assert value_in(grams, "mg") == 17.0
    assert value_in({"quantities": [{"value": 20, "unit": "µg"}]}, "mg") == 0.02
    assert value_in({"quantities": [{"value": 5, "unit": "mg"}]}, "mg") == 5.0


def test_a_unit_that_cannot_convert_gives_nothing_back():
    assert value_in({"quantities": [{"value": 5, "unit": "kJ"}]}, "kcal") is None


def test_only_offers_a_nutrient_most_articles_declare():
    units = {"Fett": "g", "Rares": "mg"}
    assert nutrient_order(units, {"Fett": 0.9, "Rares": 0.2}) == ["Fett"]


def test_the_macronutrients_come_first():
    units = {"Zink": "mg", "Fett": "g", "Brennwert": "kcal", "Calcium": "mg"}
    share = dict.fromkeys(units, 1.0)
    assert nutrient_order(units, share) == ["Brennwert", "Fett", "Calcium", "Zink"]


def test_leaves_out_an_article_that_never_states_a_volume():
    powder = article("Spezialnahrung Comfort von Geburt an, 600 g", ["pro 100 g"],
                     [nutrient("Fett", "pro 100 g", "26 g", (26.0, "g"))], dan=2)
    fed = article("Anfangsmilch Pre von Geburt an, 500 g", [READY],
                  [nutrient("Fett", READY, "3,5 g", (3.5, "g"))], dan=3)
    data = build([powder, fed])
    assert [a["dan"] for a in data["articles"]] == [3]
    assert [s["dan"] for s in data["skipped"]] == [2]


def test_a_run_puts_every_article_under_its_step():
    made = [
        article("Anfangsmilch Pre von Geburt an, 500 g", [READY],
                [nutrient("Fett", READY, "3,5 g", (3.5, "g"))], dan=i, size="500 g")
        for i in range(1, 4)
    ]
    made.append(article("Folgemilch 2 nach dem 6. Monat, 500 g", [READY],
                        [nutrient("Fett", READY, "3,1 g", (3.1, "g"))], dan=9, size="500 g"))
    data = build(made)
    assert data["stages"] == ["Pre", "2"]
    assert {a["stage"] for a in data["articles"]} == {"Pre", "2"}
    assert data["nutrients"] == [{"name": "Fett", "unit": "g"}]
    assert data["articles"][0]["values"]["Fett"] == 3.5


class Balance(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.bad = []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if not self.stack or self.stack[-1] != tag:
            self.bad.append(tag)
        else:
            self.stack.pop()


def sample_page():
    made = [
        article("Anfangsmilch Pre <b>Combiotik</b> von Geburt an, 600 g", [READY],
                [nutrient("Fett", READY, "3,5 g", (3.5, "g"))], dan=1, size="600 g"),
        article("Anfangsmilch Pre von Geburt an, 500 g", [READY],
                [nutrient("Fett", READY, "3,3 g", (3.3, "g"))], brand="Holle", dan=2, size="500 g"),
    ]
    return make_chart.page(build(made), "13 September 2026")


def test_builds_a_balanced_chart_page():
    built = sample_page()
    check = Balance()
    check.feed(built)
    assert check.bad == []
    assert check.stack == []
    assert '<option value="Pre">Pre</option>' in built
    assert "13 September 2026" in built


def test_the_embedded_data_survives_the_page():
    built = sample_page()
    raw = built.split("window.__COMPARE__ = ", 1)[1].split(";</script>", 1)[0]
    data = json.loads(raw)
    assert len(data["articles"]) == 2
    assert data["nutrients"] == [{"name": "Fett", "unit": "g"}]


def test_escapes_what_the_publisher_wrote_into_the_controls():
    assert "<b>Combiotik</b>" not in sample_page()


def test_a_name_cannot_close_the_script_block_it_rides_in():
    hostile = article("Anfangsmilch Pre </script><img src=x> von Geburt an, 500 g", [READY],
                      [nutrient("Fett", READY, "3,5 g", (3.5, "g"))], dan=1, size="500 g")
    built = make_chart.page(build([hostile]), "13 September 2026")
    assert "</script><img" not in built
    assert built.count("</script>") == 2
    raw = built.split("window.__COMPARE__ = ", 1)[1].split(";</script>", 1)[0]
    assert "</script>" in json.loads(raw)["articles"][0]["name"]
