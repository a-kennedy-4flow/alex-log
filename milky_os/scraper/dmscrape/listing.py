"""Walks a dm category listing and gives back its articles."""

from __future__ import annotations

import urllib.parse
from dataclasses import dataclass
from typing import Any, Iterator

from .client import Client
from .parse import tidy

SEARCH_URL = "https://product-search.services.dmtech.com/de/search/crawl"
BABY_MILK = "050502"
MAX_PAGE_SIZE = 100
PAGE_CEILING = 200


@dataclass(frozen=True)
class Entry:
    """One tile of the listing."""

    dan: int
    gtin: int | None
    brand: str
    title: str
    path: str

    @property
    def url(self) -> str:
        return f"https://www.dm.de{self.path}" if self.path else ""


def search_url(
    category: str = BABY_MILK,
    page: int = 0,
    page_size: int = MAX_PAGE_SIZE,
    sort: str = "editorial_relevance",
    query: str = "",
) -> str:
    fields = {"currentPage": page, "pageSize": page_size, "sort": sort}
    if category:
        fields["allCategories.id"] = category
    if query:
        fields["query"] = query
    return f"{SEARCH_URL}?{urllib.parse.urlencode(fields)}"


def _entry(tile: dict[str, Any]) -> Entry | None:
    dan = tile.get("dan")
    if dan is None:
        return None
    detail = tile.get("tileData") or {}
    return Entry(
        dan=int(dan),
        gtin=int(tile["gtin"]) if tile.get("gtin") else None,
        brand=tidy(tile.get("brandName")),
        title=tidy(tile.get("title")),
        path=tidy(detail.get("self")),
    )


def iter_entries(
    client: Client,
    category: str = BABY_MILK,
    page_size: int = MAX_PAGE_SIZE,
    sort: str = "editorial_relevance",
    query: str = "",
) -> Iterator[Entry]:
    """Give back every article of the category once.

    Because a) the service reports totalPages for the page size asked for b) a listing
    can shift between two pages and repeat an article c) the article number settles it.
    """
    seen: set[int] = set()
    page = 0
    while page < PAGE_CEILING:
        payload = client.get_json(search_url(category, page, page_size, sort, query))
        tiles = payload.get("products") or []
        for tile in tiles:
            entry = _entry(tile)
            if entry and entry.dan not in seen:
                seen.add(entry.dan)
                yield entry
        total = int(payload.get("totalPages") or 0)
        page += 1
        if page >= total or not tiles:
            return


def entries(client: Client, **options: Any) -> list[Entry]:
    return list(iter_entries(client, **options))
