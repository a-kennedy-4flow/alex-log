"""The matcher the size reader and the three sources."""

from __future__ import annotations

import json

import pytest

from dmscrape.models import Product
from dmscrape.prices import collect_prices
from dmscrape.prices.match import (
    accepts,
    brand_key,
    features,
    grams,
    markers,
    number,
    stage_token,
    tokens,
)
from dmscrape.prices.models import Offer
from dmscrape.prices.sources.dm import DmSource, money
from dmscrape.prices.sources.shopapotheke import ShopApothekeSource, hits_in
from dmscrape.prices.sources.volksversand import VolksversandSource, impressions_in


def article(**kwargs) -> Product:
    base = dict(
        dan=1617230,
        gtin=4062300398894,
        brand="HiPP",
        name="Anfangsmilch Pre Combiotik von Geburt an, 600 g",
        legal_category="Säuglingsanfangsnahrung",
        net_quantity="600 g",
        category="",
        url="https://www.dm.de/p/d/1617230/x",
        nutrition=None,
    )
    base.update(kwargs)
    return Product(**base)


class Answers:
    """A client that replays prepared bodies and records what was asked."""

    def __init__(self, pages: dict[str, str] | None = None, payloads: dict[str, dict] | None = None):
        self.pages = pages or {}
        self.payloads = payloads or {}
        self.asked: list[str] = []

    def get_text(self, url: str, headers=None) -> str:
        self.asked.append(url)
        return self.pages.get(url, "")

    def get_json(self, url: str):
        self.asked.append(url)
        return self.payloads.get(url, {})


class TestNumber:
    @pytest.mark.parametrize(
        "text,expected",
        [("1.200", 1200.0), ("1,2", 1.2), ("800", 800.0), ("2.131", 2131.0), ("0,5", 0.5)],
    )
    def test_reads_german_forms(self, text, expected):
        assert number(text) == expected


class TestGrams:
    @pytest.mark.parametrize(
        "text,expected",
        [
            ("600 g", 600.0),
            ("1.200 g", 1200.0),
            ("1,2 kg", 1200.0),
            ("0,5 l", 500.0),
            ("200 ml", 200.0),
            ("Aptamil Pre 800 G Pulver", 800.0),
            ("keine Größe", None),
        ],
    )
    def test_reads_a_pack(self, text, expected):
        assert grams(text) == expected

    def test_reads_a_multipack_as_the_whole_pack(self):
        assert grams("Beba Pre Trinkfertig 6 X 200 ml") == 1200.0

    def test_a_count_is_not_a_size(self):
        assert grams("2 St. je 5 g") is None or grams("2 St. je 5 g") >= 20.0


class TestBrandKey:
    @pytest.mark.parametrize(
        "label,expected",
        [("Nestlé BEBA", "beba"), ("Löwenzahn Organics", "loewenzahn"), ("Milupa", "milupa"),
         ("Aptamil", "aptamil"), ("dmBio", "dmbio")],
    )
    def test_names_the_maker(self, label, expected):
        assert brand_key(label) == expected


class TestStageToken:
    @pytest.mark.parametrize(
        "name,expected",
        [
            ("Anfangsmilch Pre Combiotik", "pre"),
            ("Folgemilch 2 HA", "2"),
            ("Kindermilch 1+", "kinder"),
            ("Spezialnahrung Anti-Reflux", "spezial"),
        ],
    )
    def test_names_the_step(self, name, expected):
        assert stage_token(name) == expected


class TestFeatures:
    def test_goat_is_declared(self):
        assert features("Holle Ziegenmilch 1") == {"goat"}

    def test_ready_to_drink_is_declared(self):
        assert "ready" in features("Beba Pre trinkfertig")

    def test_nothing_declared(self):
        assert features("Aptamil Pronutra Pre") == set()


class TestMarkers:
    def test_drops_the_maker_of_either_side(self):
        assert markers("Milupa Aptamil Pre Pulver 800 G", "Aptamil", "Milupa") == set()

    def test_keeps_a_recipe_word(self):
        assert markers("HiPP Combiotik Pre", "HiPP") == {"combiotik"}

    def test_one_feature_however_it_is_spelt(self):
        assert markers("Holle Ziegenmilchbasis 1", "Holle") == markers("Holle Ziegenmilch 1", "Holle")


class TestAccepts:
    def test_keeps_the_same_recipe(self):
        assert accepts("HiPP", "HiPP Anfangsmilch Pre Combiotik von Geburt an, 600 g", 600.0,
                       "HiPP - Bio Combiotik PRE Säuglingsmilch ab der Geburt", 600.0, "HiPP") > 0

    def test_refuses_another_step(self):
        assert accepts("Aptamil", "Aptamil Pronutra Pre, 800 g", 800.0,
                       "Aptamil Pronutra 2 Folgemilch 800 G", 800.0, "Aptamil") == 0

    def test_refuses_another_size(self):
        assert accepts("Aptamil", "Aptamil Pronutra Pre, 800 g", 800.0,
                       "Aptamil Pronutra Pre 300 G", 300.0, "Aptamil") == 0

    def test_refuses_goat_for_cow(self):
        assert accepts("Holle", "Holle Anfangsmilch 1 von Geburt an, 400 g", 400.0,
                       "Holle Bio Anfangsmilch 1 auf Ziegenmilchbasis 400 G", 400.0, "Holle") == 0

    def test_keeps_goat_for_goat(self):
        assert accepts("Holle", "Holle Anfangsmilch 1 aus Ziegenmilch, 400 g", 400.0,
                       "Holle Bio Anfangsmilch 1 auf Ziegenmilchbasis 400 G", 400.0, "Holle") > 0

    def test_refuses_another_maker(self):
        assert accepts("Milupa", "Milupa Anfangsmilch Pre Milumil, 800 g", 800.0,
                       "Milupa Aptamil Pre Pulver 800 G Pulver", 800.0, "Milupa") == 0

    def test_refuses_a_ready_bottle_for_a_powder(self):
        assert accepts("Nestlé BEBA", "Nestlé BEBA Anfangsmilch Pre, 800 g", 800.0,
                       "Nestle Beba Pre Trinkfertig 6 X 200 ml", 1200.0, "Nestle") == 0


class TestOffer:
    def test_works_out_a_kilo_price(self):
        offer = Offer("x", "t", 15.0, "u", "name", 1.0, grams=600.0)
        assert round(offer.kilo_price, 2) == 25.0

    def test_keeps_a_published_kilo_price(self):
        offer = Offer("x", "t", 15.0, "u", "name", 1.0, grams=600.0, per_kilo=26.58)
        assert offer.kilo_price == 26.58

    def test_without_a_size_there_is_no_kilo_price(self):
        assert Offer("x", "t", 15.0, "u", "name", 1.0).kilo_price is None


class TestDmSource:
    def test_reads_the_price_and_the_kilo_price(self):
        url = "https://products.dm.de/product/products/detail/DE/dan/1617230"
        client = Answers(payloads={url: {
            "price": {"price": {"current": {"value": "15,95 €"}},
                      "infos": ["0,6 kg (26,58 € je 1 kg)"]},
        }})
        offer = DmSource(client).offer_for(article())
        assert offer.price == 15.95
        assert offer.per_kilo == 26.58
        assert offer.matched == "dan"

    def test_falls_back_to_the_metadata_price(self):
        url = "https://products.dm.de/product/products/detail/DE/dan/1617230"
        client = Answers(payloads={url: {"metadata": {"price": 14.95}}})
        assert DmSource(client).offer_for(article()).price == 14.95

    def test_no_price_is_no_offer(self):
        url = "https://products.dm.de/product/products/detail/DE/dan/1617230"
        assert DmSource(Answers(payloads={url: {}})).offer_for(article()) is None

    @pytest.mark.parametrize("text,expected", [("15,95 €", 15.95), ("1.299,00 €", 1299.0), ("", None)])
    def test_money(self, text, expected):
        assert money(text) == expected


HIT = {
    "productName": "HiPP - Bio Combiotik PRE Säuglingsmilch ab der Geburt",
    "brand": "HiPP",
    "ean": "4062300398894",
    "packSize": "600 g",
    "pricePerUnit": "29,98 € / 1 kg",
    "prices": {"retailPrice": {"amount": 17.99}},
    "deeplink": "/baby/CH07836384/x.htm",
}


class TestShopApotheke:
    def test_pulls_the_result_out_of_the_page(self):
        page = 'window.state = {"results":[{"hits":' + json.dumps([HIT]) + ',"nbHits":1}]}'
        assert hits_in(page)[0]["ean"] == "4062300398894"

    def test_a_page_without_a_result_gives_nothing(self):
        assert hits_in("<html>nothing here</html>") == []

    def test_the_barcode_wins(self):
        url = "https://www.shop-apotheke.com/search.htm?q=4062300398894"
        client = Answers(pages={url: '{"hits":' + json.dumps([HIT]) + "}"})
        offer = ShopApothekeSource(client).offer_for(article())
        assert offer.matched == "gtin"
        assert offer.score == 1.0
        assert offer.per_kilo == 29.98
        assert offer.url.endswith("/baby/CH07836384/x.htm")

    def test_the_name_is_asked_only_when_the_barcode_missed(self):
        hit = dict(HIT, ean="9999999999999")
        first = "https://www.shop-apotheke.com/search.htm?q=4062300398894"
        second = "https://www.shop-apotheke.com/search.htm?q=HiPP+combiotik+pre"
        client = Answers(pages={first: "{}", second: '{"hits":' + json.dumps([hit]) + "}"})
        offer = ShopApothekeSource(client).offer_for(article())
        assert offer.matched == "name"
        assert len(client.asked) == 2

    def test_a_different_recipe_is_refused(self):
        hit = dict(HIT, ean="9", productName="HiPP Bio Combiotik 2 Folgemilch")
        client = Answers(pages={
            "https://www.shop-apotheke.com/search.htm?q=4062300398894": "{}",
            "https://www.shop-apotheke.com/search.htm?q=HiPP+combiotik+pre":
                '{"hits":' + json.dumps([hit]) + "}",
        })
        assert ShopApothekeSource(client).offer_for(article()) is None


IMPRESSION = {"name": "HiPP Bio Combiotik Pre 600 G Pulver", "id": "12345",
              "price": 16.4, "brand": "HiPP"}


class TestVolksversand:
    def test_pulls_the_result_out_of_the_tracking_block(self):
        page = 'dataLayer.push({"ecommerce":{"impressions": ' + json.dumps([IMPRESSION]) + "}})"
        assert impressions_in(page)[0]["id"] == "12345"

    def test_asks_once_per_maker_and_step(self):
        url = "https://volksversand.de/search?q=HiPP+Pre"
        client = Answers(pages={url: '{"impressions": ' + json.dumps([IMPRESSION]) + "}"})
        offer = VolksversandSource(client).offer_for(article())
        assert offer.price == 16.4
        assert offer.site == "volksversand.de"
        assert client.asked == [url]

    def test_a_second_query_drops_the_step(self):
        client = Answers(pages={"https://volksversand.de/search?q=HiPP": "{}"})
        assert VolksversandSource(client).offer_for(article()) is None
        assert client.asked == ["https://volksversand.de/search?q=HiPP+Pre",
                                "https://volksversand.de/search?q=HiPP"]


class TestCollect:
    def test_one_quote_per_article_and_a_coverage_count(self):
        detail = "https://products.dm.de/product/products/detail/DE/dan/1617230"
        client = Answers(
            payloads={detail: {"price": {"price": {"current": {"value": "15,95 €"}}, "infos": []}}},
            pages={"https://www.shop-apotheke.com/search.htm?q=4062300398894":
                   '{"hits":' + json.dumps([HIT]) + "}"},
        )
        run = collect_prices(client, [article()], sites=["dm.de", "shop-apotheke.com"])
        assert run.coverage()["dm.de"] == 1
        assert run.coverage()["shop-apotheke.com"] == 1
        assert run.quotes[0].cheapest.site == "dm.de"

    def test_a_source_that_raises_is_recorded_and_the_run_goes_on(self):
        class Angry(Answers):
            def get_json(self, url):
                raise ValueError("refused")

        run = collect_prices(Angry(), [article()], sites=["dm.de"])
        assert run.failures[0]["site"] == "dm.de"
        assert len(run.quotes) == 1
