"""Reading one article."""

import json
from pathlib import Path

from dmscrape.listing import Entry, search_url
from dmscrape.product import detail_url, net_quantity_of, parse_product

FIXTURES = Path(__file__).parent / "fixtures"


def payload(name):
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def test_reads_the_identity_of_an_article():
    product = parse_product(payload("single_column"))
    assert product.dan == 1615434
    assert product.brand == "Aptamil"
    assert product.name == "Kindermilch Pronutra ab 2 Jahren, 800 g"
    assert product.full_name == "Aptamil Kindermilch Pronutra ab 2 Jahren, 800 g"
    assert product.net_quantity == "800 g"
    assert product.url.startswith("https://www.dm.de/p/d/1615434/")
    assert product.category.endswith("Babymilch")


def test_reads_a_single_basis_declaration():
    table = parse_product(payload("single_column")).nutrition
    assert table.bases == ["pro 100 ml*"]
    energy = table.nutrient("Brennwert").measurements[0]
    assert (energy.unit("kJ").value, energy.unit("kcal").value) == (264.0, 63.0)
    assert table.unparsed == []


def test_reads_a_two_basis_declaration():
    table = parse_product(payload("double_column")).nutrition
    assert len(table.bases) == 2
    powder, ready = table.nutrient("Fett").measurements
    assert powder.quantities[0].value > ready.quantities[0].value
    assert table.unparsed == []


def test_pulls_the_pack_size_off_the_name():
    assert net_quantity_of("Anfangsmilch Pre von Geburt an, 600 g") == "600 g"
    assert net_quantity_of("Kindermilch trinkfertig, 200 ml") == "200 ml"
    assert net_quantity_of("Anfangsmilch Pre Pronutra von Geburt an, 1,2 kg") == "1,2 kg"
    assert net_quantity_of("Folgemilch ohne a size") == ""


def test_builds_the_service_urls():
    assert detail_url(1230306).endswith("/DE/dan/1230306")
    first = search_url(category="050502", page=0)
    assert "allCategories.id=050502" in first
    assert "currentPage=0" in first
    assert "pageSize=100" in first


def test_an_entry_points_at_the_page():
    entry = Entry(1, None, "b", "t", "/p/d/1/x")
    assert entry.url == "https://www.dm.de/p/d/1/x"
    assert Entry(1, None, "b", "t", "").url == ""
