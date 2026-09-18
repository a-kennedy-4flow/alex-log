"""The page generator."""

import json
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from make_page import (  # noqa: E402
    by_brand,
    count,
    energy_of,
    pack_size,
    page,
    ready_to_drink,
    repacks,
    short_name,
    slug,
    table_html,
)

FIXTURES = Path(__file__).parent / "fixtures"
VOID = {"meta", "link", "br", "hr", "img", "input", "source", "col", "area", "base"}


def article(dan, brand, name, size=""):
    return {
        "dan": dan,
        "gtin": 4000000000000 + dan,
        "brand": brand,
        "name": name,
        "legal_category": "Folgenahrung",
        "net_quantity": size,
        "url": f"https://www.dm.de/p/d/{dan}/x",
        "nutrition": {
            "caption": "Durchschnittliche Nährwertangaben",
            "bases": ["pro 100 g", "pro 100 ml"],
            "nutrients": [
                {
                    "name": "Brennwert",
                    "measurements": [
                        {"basis": "pro 100 g", "text": "2.131 kJ / 510 kcal", "quantities": []},
                        {"basis": "pro 100 ml", "text": "275 kJ / 66 kcal", "quantities": []},
                    ],
                },
                {
                    "name": "Ballaststoffe",
                    "measurements": [{"basis": "pro 100 g", "text": "0 g", "quantities": []}],
                },
            ],
        },
    }


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


def test_spots_a_drink_by_the_word():
    assert ready_to_drink(article(1, "HiPP", "Anfangsmilch Pre trinkfertig", "200 ml"))
    assert ready_to_drink(article(1, "BEBA", "Milchgetränk, trinkfertig, Junior", "0,5 l"))


def test_spots_a_drink_the_name_never_names():
    assert ready_to_drink(article(1, "Milupa", "Kindermilch Milupino ab 1 Jahr", "1 l"))
    assert ready_to_drink(article(1, "Aptamil", "Kindermilch Pronutra ab 1 Jahr", "200 ml"))


def test_leaves_a_powder_alone():
    assert not ready_to_drink(article(1, "HiPP", "Anfangsmilch Pre Combiotik", "600 g"))
    assert not ready_to_drink(article(1, "Aptamil", "Anfangsmilch 1 Pronutra", "1,2 kg"))
    assert not ready_to_drink(article(1, "Holle", "Folgemilch 2", ""))


def test_says_how_many_were_left_out():
    built = page({"products": [article(1, "HiPP", "Milch", "600 g")]}, "13 September 2026", 19)
    assert "19 ready to drink articles left out." in built
    assert "left out" not in page({"products": []}, "13 September 2026", 0)


def test_names_both_kinds_it_left_out():
    one = [article(1, "HiPP", "Milch", "600 g")]
    assert "19 ready to drink articles and 6 repacks left out." in page(
        {"products": one}, "13 September 2026", 19, 6
    )
    assert "1 repack left out." in page({"products": one}, "13 September 2026", 0, 1)


def test_reads_a_pack_size_as_one_unit():
    assert pack_size(article(1, "HiPP", "a", "800 g")) == ("mass", 800.0)
    assert pack_size(article(1, "HiPP", "a", "1,2 kg")) == ("mass", 1200.0)
    assert pack_size(article(1, "HiPP", "a", "1.200 g")) == ("mass", 1200.0)
    assert pack_size(article(1, "HiPP", "a", "0,8 l")) == ("volume", 800.0)


def test_reads_no_pack_size_off_a_pack_that_names_none():
    assert pack_size(article(1, "HiPP", "a", "")) is None
    assert pack_size(article(1, "HiPP", "a", "6 x 200 ml")) is None


def test_drops_the_bigger_pack_of_one_recipe():
    big = article(1, "Aptamil", "Anfangsmilch Pre Pronutra, 1,2 kg", "1,2 kg")
    small = article(2, "Aptamil", "Anfangsmilch Pre Pronutra, 800 g", "800 g")
    assert repacks([big, small]) == {1}


def test_keeps_two_recipes_of_one_size():
    first = article(1, "HiPP", "Anfangsmilch Pre Bio, 600 g", "600 g")
    second = article(2, "HiPP", "Anfangsmilch Pre Combiotik, 600 g", "600 g")
    assert repacks([first, second]) == set()


def test_keeps_one_recipe_two_brands_sell():
    first = article(1, "HiPP", "Folgemilch 2, 600 g", "600 g")
    second = article(2, "Holle", "Folgemilch 2, 400 g", "400 g")
    assert repacks([first, second]) == set()


def test_keeps_the_powder_a_carton_shares_a_name_with():
    tin = article(1, "Aptamil", "Kindermilch Pronutra ab 1 Jahr, 800 g", "800 g")
    carton = article(2, "Aptamil", "Kindermilch Pronutra ab 1 Jahr, 200 ml", "200 ml")
    assert repacks([tin, carton]) == set()


def test_keeps_a_pack_that_names_no_size():
    first = article(1, "Holle", "Folgemilch 2", "")
    second = article(2, "Holle", "Folgemilch 2", "")
    assert repacks([first, second]) == set()


def test_counts_one_thing_without_an_s():
    assert count(1, "article") == "1 article"
    assert count(0, "brand") == "0 brands"
    assert count(30, "article") == "30 articles"


def test_makes_an_anchor_from_a_brand():
    assert slug("Nestlé BEBA") == "nestle-beba"
    assert slug("Löwenzahn Organics") == "lowenzahn-organics"
    assert slug("!!!") == "brand"


def test_puts_the_largest_brand_first():
    groups = by_brand([article(1, "Holle", "a"), article(2, "HiPP", "b"), article(3, "HiPP", "a")])
    assert [brand for brand, _ in groups] == ["HiPP", "Holle"]
    assert [product["name"] for product in groups[0][1]] == ["a", "b"]


def test_names_an_article_without_a_brand():
    (brand, _), = by_brand([article(1, "", "a")])
    assert brand == "Ohne Marke"


def test_drops_the_pack_size_the_name_repeats():
    assert short_name(article(1, "HiPP", "Folgemilch 2, 600 g", "600 g")) == "Folgemilch 2"
    assert short_name(article(1, "HiPP", "Folgemilch 2", "600 g")) == "Folgemilch 2"


def test_reads_the_energy_of_the_first_basis():
    assert energy_of(article(1, "HiPP", "a")) == "2.131 kJ / 510 kcal"
    assert energy_of({"nutrition": {"nutrients": []}}) == ""


def test_marks_a_basis_the_publisher_left_out():
    body = table_html(article(1, "HiPP", "a")["nutrition"])
    assert body.count('<td class="none">—</td>') == 1
    assert 'class="energy"' in body


def test_says_so_when_nothing_was_published():
    assert "No declaration" in table_html(None)
    assert "No declaration" in table_html({"nutrients": []})


def test_escapes_what_the_publisher_wrote():
    hostile = article(1, "HiPP", "<script>alert(1)</script>")
    assert "<script>alert(1)</script>" not in page({"products": [hostile]}, "1 January 2026")


def test_builds_a_balanced_page():
    products = [article(index, "HiPP", f"Milch {index}", "600 g") for index in range(3)]
    built = page({"products": products}, "13 September 2026")
    check = Balance()
    check.feed(built)
    assert check.bad == []
    assert check.stack == []
    assert "13 September 2026" in built
    assert "3 articles from 1 brand." in built


def test_builds_the_page_from_a_real_article():
    payload = json.loads((FIXTURES / "double_column.json").read_text(encoding="utf-8"))
    from dmscrape.product import parse_product

    built = page({"products": [parse_product(payload).to_dict()]}, "13 September 2026")
    assert "Anti-Reflux" in built
    assert "pro 100 ml" in built
