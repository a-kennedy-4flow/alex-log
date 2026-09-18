"""The declaration parser."""

from dmscrape.parse import (
    find_nutrition_table,
    nutrition_of,
    parse_quantities,
    parse_table,
    tidy,
    to_number,
)


def test_reads_a_plain_value():
    (quantity,) = parse_quantities("3,7 g")
    assert (quantity.value, quantity.unit, quantity.qualifier) == (3.7, "g", "")


def test_reads_both_energy_units_from_one_cell():
    joules, calories = parse_quantities("285 kJ / 68 kcal")
    assert (joules.value, joules.unit) == (285.0, "kJ")
    assert (calories.value, calories.unit) == (68.0, "kcal")


def test_reads_a_thousands_separator_as_a_thousand():
    joules, _ = parse_quantities("2.131 kJ / 510 kcal")
    assert joules.value == 2131.0


def test_keeps_a_limit_as_a_qualifier():
    (quantity,) = parse_quantities("< 0,01 mg")
    assert (quantity.qualifier, quantity.value, quantity.unit) == ("<", 0.01, "mg")


def test_normalises_the_greek_mu_to_the_micro_sign():
    (quantity,) = parse_quantities("10 μg")
    assert quantity.unit == "µg"


def test_gives_nothing_back_for_a_cell_without_a_number():
    assert parse_quantities("Spuren") == ()
    assert parse_quantities("") == ()


def test_reads_a_german_decimal():
    assert to_number("70,1") == 70.1
    assert to_number("1.475") == 1475.0
    assert to_number("keine") is None


def test_tidies_the_blanks_the_publisher_leaves():
    assert tidy(" 0,5 g​ ") == "0,5 g"
    assert tidy(None) == ""


def test_splits_a_table_into_one_nutrient_per_row():
    table = parse_table(
        [
            ["Durchschnittliche Nährwertangaben", "pro 100 g", "pro 100 ml"],
            ["Brennwert", "2.131 kJ / 510 kcal", "275 kJ / 66 kcal"],
            ["Fett", "27,9 g", "3,6 g"],
        ]
    )
    assert table.caption == "Durchschnittliche Nährwertangaben"
    assert table.bases == ["pro 100 g", "pro 100 ml"]
    assert [nutrient.name for nutrient in table.nutrients] == ["Brennwert", "Fett"]
    fat = table.nutrient("fett")
    assert fat.under("pro 100 ml").quantities[0].value == 3.6


def test_a_short_row_declares_nothing_under_the_missing_basis():
    table = parse_table(
        [
            ["Durchschnittliche Nährwertangaben", "pro 100 g", "pro 100 ml"],
            ["Ballaststoffe", "0 g"],
        ]
    )
    fibre = table.nutrient("Ballaststoffe")
    assert [measurement.basis for measurement in fibre.measurements] == ["pro 100 g"]
    assert fibre.under("pro 100 ml") is None
    assert table.unparsed == []


def test_skips_a_row_the_publisher_left_empty():
    table = parse_table([["caption", "pro 100 g"], ["", ""], ["Salz", "2 g"]])
    assert [nutrient.name for nutrient in table.nutrients] == ["Salz"]


def test_finds_the_table_under_the_nutrition_heading():
    payload = {
        "descriptionGroups": [
            {"header": "Zutaten", "contentBlock": [{"table": [["Zutat"], ["Magermilch"]]}]},
            {"header": "Nährwerte", "contentBlock": [{"table": [["x", "pro 100 g"], ["Fett", "1 g"]]}]},
        ]
    }
    assert find_nutrition_table(payload)[1] == ["Fett", "1 g"]
    assert nutrition_of(payload).nutrient("Fett") is not None


def test_gives_nothing_back_when_no_table_was_published():
    assert nutrition_of({"descriptionGroups": []}) is None
    assert nutrition_of({}) is None
