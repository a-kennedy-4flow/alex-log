"""The four ways of showing every nutrient at once."""

import re
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from make_views import (  # noqa: E402
    CONTROL_ID,
    CONTROLS,
    GROUPS,
    VIEWS,
    choice_page,
    shape,
    view_page,
)

VOID = {"meta", "link", "br", "hr", "img", "input", "source", "col", "area", "base"}


def article(dan, brand, stage, values, size="600 g"):
    return {
        "dan": dan,
        "brand": brand,
        "variant": "Combiotik",
        "name": f"Anfangsmilch Pre Combiotik, {size}",
        "size": size,
        "url": f"https://www.dm.de/p/d/{dan}/x",
        "stage": stage,
        "values": values,
        "texts": {name: f"{value} g" for name, value in values.items()},
    }


def collected(articles, nutrients=("Brennwert", "Eisen")):
    return {
        "stages": sorted({a["stage"] for a in articles}),
        "nutrients": [{"name": name, "unit": "mg"} for name in nutrients],
        "articles": articles,
        "skipped": [],
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


def shell(page):
    """Give back the page without the script blocks that hold the data."""
    return re.sub(r"<script\b.*?</script>", "", page, flags=re.S)


def test_gives_every_step_its_own_nutrient_list():
    data = shape(collected([
        article(1, "HiPP", "Pre", {"Brennwert": 66, "Eisen": 0.5}),
        article(2, "Holle", "Pre", {"Brennwert": 67, "Eisen": 0.6}),
        article(3, "HiPP", "2", {"Brennwert": 68}),
    ]))
    holds = {stage["name"]: [n["name"] for n in stage["nutrients"]] for stage in data["stages"]}
    assert holds == {"Pre": ["Brennwert", "Eisen"], "2": ["Brennwert"]}


def test_leaves_out_a_nutrient_half_the_step_never_declares():
    data = shape(collected([
        article(1, "HiPP", "Pre", {"Brennwert": 66, "Eisen": 0.5}),
        article(2, "Holle", "Pre", {"Brennwert": 67}),
        article(3, "Töpfer", "Pre", {"Brennwert": 67}),
    ]))
    assert [n["name"] for n in data["stages"][0]["nutrients"]] == ["Brennwert"]


def test_names_the_median_and_the_two_ends():
    data = shape(collected([
        article(1, "HiPP", "Pre", {"Brennwert": 65}),
        article(2, "Holle", "Pre", {"Brennwert": 66}),
        article(3, "Töpfer", "Pre", {"Brennwert": 69}),
    ]))
    energy = data["stages"][0]["nutrients"][0]
    assert (energy["median"], energy["low"], energy["high"]) == (66, 65, 69)
    assert energy["count"] == 3


def test_builds_every_option_balanced():
    data = shape(collected([
        article(1, "HiPP", "Pre", {"Brennwert": 66, "Eisen": 0.5}),
        article(2, "Holle", "Pre", {"Brennwert": 67, "Eisen": 0.6}),
    ]))
    for view in VIEWS:
        check = Balance()
        check.feed(shell(view_page(view, data, "2 articles.")))
        assert check.bad == [], view["key"]
        assert check.stack == [], view["key"]


def test_every_option_states_its_cost():
    data = shape(collected([article(1, "HiPP", "Pre", {"Brennwert": 66})]))
    for view in VIEWS:
        built = view_page(view, data, "1 article.")
        assert "What it costs." in built
        assert view["cost"][:40] in built


def test_the_choice_page_holds_every_option():
    data = shape(collected([article(1, "HiPP", "Pre", {"Brennwert": 66})]))
    built = choice_page(data, "1 article.")
    check = Balance()
    check.feed(shell(built))
    assert check.bad == []
    assert check.stack == []
    for view in VIEWS:
        assert f'href="{view["file"]}"' in built
        assert view["name"] in built


def test_escapes_what_the_publisher_wrote():
    hostile = article(1, "<script>alert(1)</script>", "Pre", {"Brennwert": 66})
    data = shape(collected([hostile]))
    for view in VIEWS:
        built = view_page(view, data, "1 article.")
        assert "<script>alert(1)</script>" not in built
        assert "\\u003cscript\\u003e" in built


def test_holds_the_same_dataset_in_every_option():
    data = shape(collected([
        article(1, "HiPP", "Pre", {"Brennwert": 66}),
        article(2, "Holle", "Pre", {"Brennwert": 67}),
    ]))
    payloads = {
        re.search(r"window\.__VIEWS__ = (.*?);</script>", view_page(view, data, "x"), re.S).group(1)
        for view in VIEWS
    }
    assert len(payloads) == 1


def test_every_option_asks_for_controls_that_exist():
    for view in VIEWS:
        assert view["controls"], view["key"]
        assert set(view["controls"]) <= set(CONTROLS), view["key"]
        assert "view" in view["controls"], view["key"]
        assert view["group"] in {group for group, _, _ in GROUPS}, view["key"]


def test_every_option_carries_the_controls_it_asked_for():
    """A control key names what the option asks for and CONTROL_ID names the state."""
    data = shape(collected([article(1, "HiPP", "Pre", {"Brennwert": 66})]))
    for view in VIEWS:
        built = view_page(view, data, "1 article.")
        wanted = {CONTROL_ID.get(key, key) for key in view["controls"]}
        for key in wanted:
            assert f'id="{key}"' in built, f"{view['key']} {key}"
        for key in {CONTROL_ID.get(key, key) for key in CONTROLS} - wanted:
            assert f'id="{key}"' not in built, f"{view['key']} {key}"


def test_the_choice_page_groups_every_option():
    data = shape(collected([article(1, "HiPP", "Pre", {"Brennwert": 66})]))
    built = choice_page(data, "1 article.")
    for _, title, _ in GROUPS:
        assert title in built
    assert built.count('class="card option"') == len(VIEWS)
