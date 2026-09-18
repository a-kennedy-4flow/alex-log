"""Walking the listing."""

from dmscrape.listing import entries, iter_entries
from dmscrape.scrape import collect, scrape_category


class Pages:
    """Answers like the search service and the product service."""

    def __init__(self, pages, details=None):
        self.pages = pages
        self.details = details or {}
        self.asked = []

    def get_json(self, url):
        self.asked.append(url)
        if "/search/" in url:
            page = int(url.split("currentPage=")[1].split("&")[0])
            return self.pages[page]
        dan = int(url.rsplit("/", 1)[1])
        return self.details[dan]


def tile(dan, title="Milch"):
    return {
        "dan": dan,
        "gtin": 4000000000000 + dan,
        "brandName": "Marke",
        "title": title,
        "tileData": {"self": f"/p/d/{dan}/marke-milch"},
    }


def test_reads_every_page():
    client = Pages([
        {"products": [tile(1), tile(2)], "totalPages": 2},
        {"products": [tile(3)], "totalPages": 2},
    ])
    assert [entry.dan for entry in iter_entries(client)] == [1, 2, 3]
    assert len(client.asked) == 2


def test_gives_an_article_back_once():
    client = Pages([
        {"products": [tile(1), tile(2)], "totalPages": 2},
        {"products": [tile(2), tile(3)], "totalPages": 2},
    ])
    assert [entry.dan for entry in iter_entries(client)] == [1, 2, 3]


def test_stops_on_an_empty_page():
    client = Pages([{"products": [], "totalPages": 9}])
    assert entries(client) == []


def test_reads_the_tile_fields():
    client = Pages([{"products": [tile(7, "Folgemilch 2, 500 g")], "totalPages": 1}])
    (entry,) = entries(client)
    assert (entry.dan, entry.brand, entry.title) == (7, "Marke", "Folgemilch 2, 500 g")
    assert entry.url == "https://www.dm.de/p/d/7/marke-milch"


def detail(dan):
    return {
        "dan": dan,
        "gtin": 4000000000000 + dan,
        "brand": {"name": "Marke"},
        "title": {"headline": "Folgemilch 2, 500 g", "subheadline": "Folgenahrung"},
        "self": f"/p/d/{dan}/marke-milch",
        "descriptionGroups": [
            {
                "header": "Nährwerte",
                "contentBlock": [{"table": [["Angaben", "pro 100 ml"], ["Fett", "3,7 g"]]}],
            }
        ],
    }


def test_collects_the_whole_listing():
    client = Pages(
        [{"products": [tile(1), tile(2)], "totalPages": 1}],
        {1: detail(1), 2: detail(2)},
    )
    result = scrape_category(client)
    assert [product.dan for product in result.products] == [1, 2]
    assert result.failures == []
    assert result.without_nutrition == []


def test_a_limit_stops_the_run_early():
    client = Pages(
        [{"products": [tile(1), tile(2)], "totalPages": 1}],
        {1: detail(1), 2: detail(2)},
    )
    assert len(scrape_category(client, limit=1).products) == 1


def test_one_broken_article_does_not_stop_the_rest():
    client = Pages([], {1: detail(1), 2: {"no": "dan"}, 3: detail(3)})
    result = collect(client, [1, 2, 3])
    assert [product.dan for product in result.products] == [1, 3]
    assert [failure.dan for failure in result.failures] == [2]
