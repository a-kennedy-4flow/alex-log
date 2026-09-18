"""The command line front end."""

import csv
import json
from pathlib import Path

from dmscrape import client as client_module
from dmscrape.cli import main, report, rows_of
from dmscrape.product import parse_product

FIXTURES = Path(__file__).parent / "fixtures"


def payload(name):
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


class FakeResponse:
    def __init__(self, body):
        self._body = body
        self.headers = {}

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *unused):
        return False


def serve_fixtures(monkeypatch):
    """Answer a detail URL from the fixture of that article."""
    by_dan = {str(payload(name)["dan"]): payload(name) for name in ("single_column", "double_column")}

    def fake_urlopen(request, timeout=None):
        dan = request.full_url.rsplit("/", 1)[1]
        return FakeResponse(json.dumps(by_dan[dan]).encode("utf-8"))

    monkeypatch.setattr(client_module.urllib.request, "urlopen", fake_urlopen)


def test_writes_one_row_per_declared_number():
    product = parse_product(payload("single_column"))
    rows = list(rows_of(product))
    energy = [row for row in rows if row["nutrient"] == "Brennwert"]
    assert [row["unit"] for row in energy] == ["kJ", "kcal"]
    assert every_row_carries_the_article(rows, product.dan)


def every_row_carries_the_article(rows, dan):
    return all(row["dan"] == dan and row["name"] and row["basis"] for row in rows)


def test_an_article_without_a_declaration_writes_no_row():
    product = parse_product(payload("single_column"))
    product.nutrition = None
    assert list(rows_of(product)) == []


def test_the_report_names_the_article_and_its_nutrients():
    text = report(parse_product(payload("double_column")))
    assert "Spezialnahrung Anti-Reflux" in text
    assert "Brennwert" in text
    assert "dan 1620675" in text


def test_a_run_writes_the_json_and_the_csv(monkeypatch, tmp_path):
    serve_fixtures(monkeypatch)
    out = tmp_path / "products.json"
    table = tmp_path / "nutrition.csv"
    code = main(
        [
            "--dan", "1615434",
            "--dan", "1620675",
            "--out", str(out),
            "--csv", str(table),
            "--cache", str(tmp_path / "cache"),
            "--gap", "0",
            "--quiet",
        ]
    )
    assert code == 0
    collected = json.loads(out.read_text(encoding="utf-8"))
    assert collected["count"] == 2
    assert collected["failures"] == []
    assert all(product["nutrition"]["nutrients"] for product in collected["products"])
    rows = list(csv.DictReader(table.open(encoding="utf-8")))
    assert len(rows) > 100
    assert {row["dan"] for row in rows} == {"1615434", "1620675"}


def test_a_failed_article_sets_the_exit_code(monkeypatch, tmp_path):
    serve_fixtures(monkeypatch)
    code = main(
        [
            "--dan", "999",
            "--out", str(tmp_path / "products.json"),
            "--cache", str(tmp_path / "cache"),
            "--gap", "0",
            "--tries", "1",
            "--quiet",
        ]
    )
    assert code == 1
