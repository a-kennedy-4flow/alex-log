"""Parser tests. No image is read here."""

from conftest import make_lines, make_rows

from labelocr.parse import (
    find_quantities,
    match_nutrient,
    parse_allergens,
    parse_barcode,
    parse_dates,
    parse_ingredients,
    parse_may_contain,
    parse_net_quantity,
    parse_nutrition,
    parse_product_name,
    parse_rows,
    parse_storage,
)


def quantities(text):
    return [(q.value, q.unit) for q in find_quantities(text)]


def test_reads_plain_quantities():
    assert quantities("Fat 32.0g") == [(32.0, "g")]
    assert quantities("Energy 2180kJ / 523kcal") == [(2180.0, "kJ"), (523.0, "kcal")]


def test_reads_a_comma_decimal():
    assert quantities("Salt 1,25g") == [(1.25, "g")]


def test_repairs_letters_the_engine_read_as_digits():
    assert quantities("Protein l0.5g") == [(10.5, "g")]
    assert quantities("Energy 2l8k] / 64kcaI") == [(218.0, "kJ"), (64.0, "kcal")]


def test_ignores_a_word_that_ends_in_a_unit_letter():
    assert quantities("Sunflower Oil") == []


def test_names_the_sub_nutrient_not_its_parent():
    assert match_nutrient("of which saturates 2.8g") == "saturates"
    assert match_nutrient("of which sugars 0.9g") == "sugars"
    assert match_nutrient("Saturated fat 2.8g") == "saturates"
    assert match_nutrient("Fat 32.0g") == "fat"
    assert match_nutrient("Carbohydrate 50.1g") == "carbohydrate"


def test_ingredients_are_not_a_nutrient():
    assert match_nutrient("Potatoes, Sunflower Oil, Sea Salt") is None


def test_splits_a_two_column_table_by_position():
    rows = make_rows(
        [
            [("NUTRITION", 60), ("per 100g", 470), ("per 30g serving", 700)],
            [("Energy", 60), ("2180kJ / 523kcal", 470), ("654kJ / 157kcal", 700)],
            [("Fat", 60), ("32.0g", 470), ("9.6g", 700)],
            [("of which saturates", 60), ("2.8g", 470), ("0.8g", 700)],
            [("Salt", 60), ("1.30g", 470), ("0.39g", 700)],
        ]
    )
    nutrition, basis, serving = parse_nutrition(rows)
    table = {nutrient.name: nutrient for nutrient in nutrition}
    assert basis == "per 100 g"
    assert serving == "per 30g serving"
    assert table["energy_kj"].per_100.value == 2180
    assert table["energy_kj"].per_serving.value == 654
    assert table["energy_kcal"].per_100.value == 523
    assert table["fat"].per_100.value == 32.0
    assert table["fat"].per_serving.value == 9.6
    assert table["saturates"].per_100.value == 2.8
    assert table["salt"].per_serving.value == 0.39


def test_reads_a_single_column_table_in_millilitres():
    rows = make_rows(
        [
            [("Typical values", 60), ("per 100ml", 520)],
            [("Energy", 60), ("268kJ / 64kcal", 520)],
            [("Fat", 60), ("3.6g", 520)],
        ]
    )
    nutrition, basis, serving = parse_nutrition(rows)
    table = {nutrient.name: nutrient for nutrient in nutrition}
    assert basis == "per 100 ml"
    assert serving is None
    assert table["fat"].per_100.value == 3.6
    assert table["fat"].per_serving is None


def test_ingredients_run_to_the_next_section():
    rows = make_lines(
        [
            "INGREDIENTS: Potatoes, Sunflower Oil (22%),",
            "Sea Salt, Milk Powder, Wheat Flour.",
            "Allergy advice: contains milk and wheat.",
            "Energy 2180kJ",
        ]
    )
    assert parse_ingredients(rows) == "Potatoes, Sunflower Oil (22%), Sea Salt, Milk Powder, Wheat Flour."


def test_finds_the_declared_allergens():
    rows = make_lines(["Allergy advice: contains milk and wheat."])
    found = parse_allergens(rows, "Potatoes, Milk Powder, Wheat Flour, Barley Malt Extract.")
    assert found == ["cereals containing gluten", "milk"]


def test_peanut_butter_is_not_milk():
    assert parse_allergens([], "Peanut Butter, Sugar, Palm Oil.") == ["peanuts"]


def test_may_contain_is_kept_apart_from_the_declaration():
    rows = make_lines(["Ingredients: Oats, Almonds.", "May contain peanuts and sesame."])
    ingredients = parse_ingredients(rows)
    assert parse_allergens(rows, ingredients) == ["cereals containing gluten", "nuts"]
    assert parse_may_contain(rows) == ["peanuts", "sesame"]


def test_net_quantity_is_not_the_per_100_column():
    rows = make_lines(["Typical values per 100g", "Fat 32.0g", "Net weight 150g e"])
    quantity = parse_net_quantity(rows)
    assert (quantity.value, quantity.unit) == (150.0, "g")


def test_net_quantity_stands_on_its_own_line():
    quantity = parse_net_quantity(make_lines(["FRESH WHOLE MILK", "1 litre e"]))
    assert (quantity.value, quantity.unit) == (1.0, "l")


def test_reads_both_date_forms():
    best_before, use_by = parse_dates(make_lines(["Best before: 14/03/2027", "Use by 21 SEP 2026"]))
    assert best_before == "14/03/2027"
    assert use_by == "21 SEP 2026"


def test_reads_a_date_printed_on_the_next_line():
    best_before, _use_by = parse_dates(make_lines(["Best before end", "MAR 2027"]))
    assert best_before == "MAR 2027"


def test_storage_keeps_the_line_that_follows_it():
    rows = make_lines(["Keep refrigerated below 5C.", "Once opened use within 3 days.", "Use by: 21 SEP 2026"])
    assert parse_storage(rows) == "Keep refrigerated below 5C. Once opened use within 3 days."


def test_reads_a_thirteen_digit_barcode():
    assert parse_barcode(make_lines(["5012345678900"])) == "5012345678900"
    assert parse_barcode(make_lines(["501 2345 678900"])) == "5012345678900"


def test_rejects_a_number_that_is_not_a_barcode():
    assert parse_barcode(make_lines(["12345"])) is None


def test_product_name_is_the_largest_text_at_the_top():
    rows = make_rows([[("SALTED CRISPS", 60)], [("Hand cooked potato crisps", 60)]], height=64)
    rows[1].cells[0].box = rows[1].cells[0].box.__class__(60, 90, 400, 114)
    assert parse_product_name(rows) == "SALTED CRISPS"


def test_a_label_with_no_text_returns_empty_fields():
    label = parse_rows([])
    assert label.product_name is None
    assert label.nutrition == []
    assert label.confidence == 0.0


def test_reads_a_german_table():
    rows = make_rows(
        [
            [("Nährwerte", 60), ("pro 100 ml", 520)],
            [("Brennwert", 60), ("278 kJ", 520)],
            [("Fett", 60), ("3,6 g", 520)],
            [("davon gesättigte Fettsäuren", 60), ("1,5 g", 520)],
            [("Kohlenhydrate", 60), ("7,1 g", 520)],
            [("davon Zucker", 60), ("7,1 g", 520)],
            [("Eiweiß", 60), ("1,4 g", 520)],
            [("Salz", 60), ("0,05 g", 520)],
        ]
    )
    nutrition, basis, _serving = parse_nutrition(rows)
    table = {nutrient.name: nutrient.per_100.value for nutrient in nutrition}
    assert basis == "per 100 ml"
    assert table == {
        "energy_kj": 278.0,
        "fat": 3.6,
        "saturates": 1.5,
        "carbohydrate": 7.1,
        "sugars": 7.1,
        "protein": 1.4,
        "salt": 0.05,
    }


def test_matches_a_name_the_engine_spelled_wrongly():
    assert match_nutrient("Kohlenhvdrate 7,1g") == "carbohydrate"
    assert match_nutrient("Kohlenhydrote 7,1g") == "carbohydrate"
    assert match_nutrient("-gesottigteFettsoren 1,5g") == "saturates"
    assert match_nutrient("Folsoure 60ug") is None


def test_keeps_two_panels_apart():
    rows = make_rows(
        [
            [("pro 100 ml", 200), ("pro 100 ml", 560)],
            [("Energie", 60), ("278 kJ", 200), ("Calcium", 400), ("51 mg", 560)],
            [("Fett", 60), ("3,6 g", 200), ("Eisen", 400), ("0,50 mg", 560)],
        ]
    )
    nutrition, _basis, _serving = parse_nutrition(rows)
    table = {nutrient.name: nutrient for nutrient in nutrition}
    assert table["calcium"].per_100.value == 51
    assert table["calcium"].per_serving is None
    assert table["iron"].per_100.value == 0.5
    assert table["fat"].per_100.value == 3.6


def test_two_panels_each_keep_a_serving_column():
    rows = make_rows(
        [
            [("pro 100 ml", 180), ("pro Portion", 300), ("pro 100 ml", 520), ("pro Portion", 650)],
            [("Fett", 60), ("3,1 g", 180), ("4,7 g", 300), ("Calcium", 400), ("51 mg", 520), ("77 mg", 650)],
        ]
    )
    nutrition, _basis, _serving = parse_nutrition(rows)
    table = {nutrient.name: nutrient for nutrient in nutrition}
    assert (table["fat"].per_100.value, table["fat"].per_serving.value) == (3.1, 4.7)
    assert (table["calcium"].per_100.value, table["calcium"].per_serving.value) == (51, 77)


def test_reads_german_sections():
    rows = make_lines(
        [
            "Zutaten: Magermilch, Lactose, pflanzliche Öle, Fischöl.",
            "Kann Spuren von Soja enthalten.",
            "Kühl und trocken lagern.",
            "Mindestens haltbar bis: 14.03.2027",
            "Füllmenge: 500 g",
        ]
    )
    label = parse_rows(rows)
    assert label.ingredients.startswith("Magermilch")
    assert label.allergens == ["fish", "milk"]
    assert label.may_contain == ["soybeans"]
    assert label.storage == "Kühl und trocken lagern."
    assert label.best_before == "14.03.2027"
    assert (label.net_quantity.value, label.net_quantity.unit) == (500.0, "g")


def test_a_free_from_claim_is_not_a_declaration():
    assert parse_allergens([], "Reismehl, Zucker. Glutenfrei.") == []
    assert parse_allergens([], "Rice flour, sugar. Gluten free.") == []
    assert parse_allergens([], "Oat drink. Lactose free.") == ["cereals containing gluten"]


def test_a_panel_on_its_own_has_no_product_name():
    rows = make_rows(
        [
            [("Nährwerte", 60), ("pro 100 ml", 520)],
            [("Energie", 60), ("278 kJ", 520)],
            [("Fett", 60), ("3,6 g", 520)],
        ]
    )
    assert parse_product_name(rows) is None


def test_warns_when_the_print_is_too_small():
    small = make_rows([[("Energie", 60), ("278 kJ", 520)]], height=11)
    assert "pixels tall" in parse_rows(small).warnings[0]
    large = make_rows([[("Energie", 60), ("278 kJ", 520)]], height=30)
    assert parse_rows(large).warnings == []
