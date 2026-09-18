"""One profile page per declared nutrient with a sourced description and its caveats."""

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import make_profiles  # noqa: E402
from compare_data import FOLD, SAME_THING  # noqa: E402
from fetch_nutrients import ARTICLES, sentences  # noqa: E402

VOID = {"meta", "link", "br", "hr", "img", "input", "source", "col", "area", "base"}


class Balance(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.bad = [], []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack or self.stack[-1] != tag:
            self.bad.append(tag)
        else:
            self.stack.pop()


def shell(markup):
    return re.sub(r"(?is)<script.*?</script>|<style.*?</style>", "", markup)


@pytest.fixture(scope="module")
def book():
    return json.loads((ROOT / "nutrients.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def bag():
    return make_profiles.gather(make_profiles.prepared(ROOT / "products.json"))


@pytest.fixture(scope="module")
def names(bag):
    return sorted(set(bag["printed"]) | set(bag["charted"]) | set(bag["milk_by_name"]))


# --- the encyclopedia text ----------------------------------------------------------


def test_every_declared_name_is_mapped_to_an_article(names):
    for name in names:
        assert name in ARTICLES, name


def test_every_mapped_name_has_a_quote_and_a_link(book):
    for name, one in book["profiles"].items():
        assert one.get("quote"), name
        assert one["url"].startswith("https://en.wikipedia.org/"), name


def test_the_quote_is_whole_sentences():
    text = "Iron is a chemical element. It has symbol Fe. It is a metal. A fourth one."
    assert sentences(text, 2) == "Iron is a chemical element. It has symbol Fe."
    assert sentences(text, 9).endswith("A fourth one.")
    assert sentences("") == ""


def test_the_licence_is_named_and_linked(book):
    assert book["licence"]["name"] == "CC BY-SA 4.0"
    assert book["licence"]["url"].startswith("https://creativecommons.org/")


def test_the_page_quotes_rather_than_rewrites(bag, book):
    """The text carries a share alike licence so it has to stay a quote."""
    built = make_profiles.profile_page("Eisen", bag, book, "lede")
    quote = book["profiles"]["Eisen"]["quote"]
    assert quote[:60] in built
    assert "<blockquote>" in built
    assert book["profiles"]["Eisen"]["url"] in built
    assert "CC BY-SA 4.0" in built


# --- what the page says about the figure ---------------------------------------------


def test_a_folded_name_is_told_it_is_folded(bag, book):
    for canon, members, _ in SAME_THING:
        for member in members:
            if member == canon:
                continue
            built = make_profiles.profile_page(member, bag, book, "lede")
            assert f"counted under {canon}" in built


def test_the_canonical_name_says_what_it_gathered(bag, book):
    built = make_profiles.profile_page("Laktose", bag, book, "lede")
    assert "gathers more than one printed name" in built
    assert "davon Milchzucker" in built


def test_a_folded_name_still_shows_the_reference_figure(bag):
    """The figure lives under the name the charts use so the page must reach it."""
    for canon, members, _ in SAME_THING:
        under_canon = make_profiles.milk_of(bag, canon)
        if not any(r["text"] for r in under_canon):
            continue
        for member in members:
            rows = make_profiles.milk_of(bag, member)
            assert any(r["text"] for r in rows), member


def test_folate_reaches_the_page_breast_milk_files_it_under(bag, book):
    built = make_profiles.profile_page("Folat", bag, book, "lede")
    assert "Breast milk carries no figure here" not in built
    assert "7,69" in built


def test_a_window_no_source_reaches_is_named(bag, book):
    built = make_profiles.profile_page("Vitamin D", bag, book, "lede")
    assert "no figure for" in built


def test_a_published_error_is_named_on_its_own_page(bag, book):
    """The two dm errors the readme names are found rather than hardcoded."""
    built = make_profiles.profile_page("Mangan", bag, book, "lede")
    assert "times it" in built
    assert "passed through untouched" in built


def test_a_note_about_one_figure_stays_on_that_figure(bag, book):
    """The manganese caveat must not appear on every nutrient of the same study."""
    mangan = make_profiles.profile_page("Mangan", bag, book, "lede")
    folate = make_profiles.profile_page("Folat", bag, book, "lede")
    assert "Frisbie" in mangan
    assert "Frisbie" not in folate


def test_a_figure_the_charts_never_draw_says_so(bag, book):
    built = make_profiles.profile_page("Molybdän", bag, book, "lede")
    assert "No chart draws this" in built


def test_a_folded_name_is_not_blamed_on_the_share_gate(bag, book):
    """Folsäure is absent from the charts because it was folded and not because it is rare."""
    built = make_profiles.profile_page("Folsäure", bag, book, "lede")
    assert "No chart draws this. Only" not in built
    assert "counted under Folat" in built


def test_the_reference_citation_is_on_the_page(bag, book):
    built = make_profiles.profile_page("Eisen", bag, book, "lede")
    assert "Reference Values for Minerals in Human Milk" in built
    assert "doi.org/10.1016/j.advnut.2025.100431" in built


# --- the pages themselves ------------------------------------------------------------


def test_every_page_is_balanced_markup(bag, book, names):
    for name in names[:12] + ["Mangan", "Folat", "Laktose"]:
        check = Balance()
        check.feed(shell(make_profiles.profile_page(name, bag, book, "lede")))
        assert check.bad == [], name
        assert check.stack == [], name


def test_the_index_links_every_profile(bag, book, names):
    built = make_profiles.index_page(names, bag, book, "lede")
    check = Balance()
    check.feed(shell(built))
    assert check.bad == [] and check.stack == []
    for name in names:
        assert f'href="{make_profiles.file_of(name)}"' in built


def test_every_file_name_is_its_own(names):
    files = [make_profiles.file_of(name) for name in names]
    assert len(files) == len(set(files))
    for one in files:
        assert re.fullmatch(r"[a-z0-9-]+\.html", one), one


def test_the_built_pages_are_on_disk(names):
    out = ROOT / "profiles"
    if not out.exists():
        pytest.skip("profiles have not been built")
    for name in names:
        assert (out / make_profiles.file_of(name)).exists(), name
    assert (out / "index.html").exists()


# --- what a baby needs and how much of it is absorbed --------------------------------


@pytest.fixture(scope="module")
def needs():
    return json.loads((ROOT / "requirements.json").read_text(encoding="utf-8"))


def test_every_requirement_names_a_study(needs):
    for name, one in needs["requirements"].items():
        assert one["source"] in ("milq-macro", "milq-mineral", "milq-fat-soluble", "milq-b"), name
        assert one["needs_a_day"] > 0, name
        assert one["needs_per_100_ml"] > 0, name


def test_b1_is_not_read_as_b12(needs):
    """B1 and B12 both start with B1 so a careless match swaps them."""
    b1 = needs["requirements"]["Vitamin B 1, Thiamin"]
    b12 = needs["requirements"]["Vitamin B 12"]
    assert b1["as_printed"].startswith("B1 ")
    assert b12["as_printed"].startswith("B12")
    assert b1["needs_a_day"] == 200.0
    assert b12["needs_a_day"] == 0.4


def test_the_requirement_is_in_the_unit_the_pack_declares(needs):
    """The intake table counts vitamin D in international units and a pack does not."""
    d = needs["requirements"]["Vitamin D"]
    assert d["unit"] == "µg"
    assert d["needs_a_day"] == pytest.approx(10.0)
    assert "international units" in d["converted"]


def test_the_volume_turns_a_day_into_a_feed(needs):
    litres = needs["volume_used"]["millilitres"]
    assert 700 < litres < 900
    iron = needs["requirements"]["Eisen"]
    assert iron["needs_per_100_ml"] == pytest.approx(iron["needs_a_day"] / (litres / 100))


def test_every_absorption_record_is_sourced(needs):
    for name, one in needs["absorption"].items():
        assert one["source"] in needs["sources"], name
        assert one["says"].strip()
        for key in (one["source"], one.get("also")):
            if key:
                assert needs["sources"][key]["citation"].strip()
                assert needs["sources"][key].get("doi") or needs["sources"][key].get("url")


def test_iron_carries_both_readings(needs):
    iron = needs["absorption"]["Eisen"]
    assert iron["milk"] > iron["formula"] * 5
    assert needs["sources"][iron["source"]]["pmcid"] == "PMC11235178"
    assert needs["sources"][iron["also"]]["citation"].startswith("Saarinen")


def test_the_page_says_a_high_number_is_not_a_high_delivery(bag, book):
    built = make_profiles.profile_page("Eisen", bag, book, "lede")
    assert "not what reaches the child" in built
    assert "does not deliver many times as much" in built
    assert "Absorbed from human milk" in built


def test_a_milk_below_the_intake_is_not_called_short(bag, book):
    """The intake for this age is calculated from milk so it cannot convict milk."""
    built = make_profiles.profile_page("Vitamin B 2, Riboflavin", bag, book, "lede")
    assert "not a shortfall in the milk" in built
    assert "what adequate means at this age" in built
    assert "as few as 5 women" in built


def test_the_two_requirements_set_from_an_outcome_say_so(bag, book, needs):
    """Vitamin D and vitamin K are not worked out from milk so the milk really is short."""
    assert set(needs["set_from_outcome"]) == {"Vitamin D", "Vitamin K"}
    d = make_profiles.profile_page("Vitamin D", bag, book, "lede")
    assert "serum 25(OH)D" in d
    assert "does not provide sufficient vitamin D" in d
    assert "a supplement for the child rather than a different milk" in d
    assert "not a shortfall in the milk" not in d
    k = make_profiles.profile_page("Vitamin K", bag, book, "lede")
    assert "intramuscular injection" in k
    assert "an injection after birth rather than a different milk" in k


def test_only_the_two_exceptions_are_marked_uncircular(needs):
    for name, one in needs["requirements"].items():
        expected = name not in needs["set_from_outcome"]
        assert one["circular"] is expected, name


def test_a_nutrient_with_no_absorption_figure_says_so(bag, book):
    built = make_profiles.profile_page("Biotin", bag, book, "lede")
    assert "No measurement of how much of this is absorbed" in built


def test_a_corrigendum_is_not_a_caveat_of_every_nutrient(bag, book):
    """It corrects the copper figures so it belongs on the citation and nowhere else."""
    for name in ("Eisen", "Zink", "Kupfer"):
        built = make_profiles.profile_page(name, bag, book, "lede")
        watch = built[built.find("What to watch"):]
        assert "reprints the copper figures" not in watch, name


def test_the_step_table_carries_the_share_of_the_need(bag, book):
    built = make_profiles.profile_page("Eisen", bag, book, "lede")
    assert "Of the need" in built
