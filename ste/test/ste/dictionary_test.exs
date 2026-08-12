defmodule Ste.DictionaryTest do
  use ExUnit.Case, async: true
  doctest Ste.Dictionary

  alias Ste.Dictionary

  test "holds the whole dictionary of part 2" do
    %{counts: counts} = Dictionary.source()

    # Part 2 states 875 approved words and 1274 words that are not approved.
    # The extraction is within a word of the approved count; the entries that
    # are not approved come out higher because a word with two parts of speech
    # is two entries here.
    assert_in_delta counts["approved"], 875, 5
    assert counts["not_approved"] >= 1274
  end

  describe "approved?/1" do
    test "approves a headword" do
      assert Dictionary.approved?("remove")
      assert Dictionary.approved?("REMOVE")
      assert Dictionary.approved?("Obey")
    end

    test "approves the verb forms that the entry lists" do
      assert Dictionary.approved?("removes")
      assert Dictionary.approved?("removed")
      assert Dictionary.approved?("gave")
      assert Dictionary.approved?("given")
    end

    test "approves the comparative and superlative forms that the entry lists" do
      assert Dictionary.approved?("slower")
      assert Dictionary.approved?("slowest")
    end

    test "approves the plural of an approved countable noun" do
      assert Dictionary.approved?("surfaces")
      assert Dictionary.approved?("flanges")
    end

    test "refuses a word that the dictionary lists as not approved" do
      refute Dictionary.approved?("acceptable")
      refute Dictionary.approved?("accuracy")
      refute Dictionary.approved?("vary")
    end

    test "does not approve a technical noun that the dictionary lists only as a verb" do
      # Rule 1.7: "screw" is a technical noun and the dictionary lists it as a
      # verb that is not approved. As a noun it comes from the glossary.
      refute Dictionary.approved?("screw")
      refute Dictionary.approved?("screws")
      assert Ste.Glossary.technical_noun?("screws", [])
    end

    test "refuses a word that the dictionary does not list at all" do
      refute Dictionary.approved?("staircase")
      refute Dictionary.listed?("staircase")
    end

    test "approves the multi-word entries" do
      assert Dictionary.approved?("make sure")
      assert Dictionary.approved?("aft of")
    end
  end

  describe "approved?/2" do
    test "separates the parts of speech that an entry approves" do
      # Rule 1.2: "test" is an approved noun, but not an approved verb.
      assert Dictionary.approved?("test", "n")
      refute Dictionary.approved?("test", "v")

      # Rule 9.2: "work" is approved as a noun, "help" as a verb.
      assert Dictionary.approved?("work", "n")
      refute Dictionary.approved?("work", "v")
      assert Dictionary.approved?("help", "v")
      refute Dictionary.approved?("help", "n")

      # Rule 9.2: "damage" is approved as a noun, not as a verb.
      assert Dictionary.approved?("damage", "n")
      refute Dictionary.approved?("damage", "v")
    end

    test "keeps both parts of speech of a word that has two" do
      assert Dictionary.approved?("clean", "v")
      assert Dictionary.approved?("clean", "adj")
      assert Dictionary.approved?("flush", "v")
      assert Dictionary.approved?("flush", "adj")
    end
  end

  describe "not_approved/1" do
    test "gives the approved alternatives of a word that is not approved" do
      alternatives =
        "main"
        |> Dictionary.not_approved()
        |> Enum.flat_map(& &1.alternatives)
        |> Enum.map(& &1.word)

      assert "PRIMARY" in alternatives
    end

    test "is empty for an approved word" do
      assert Dictionary.not_approved("remove") == []
    end
  end

  test "keeps the approved meaning of an approved word" do
    entry = Dictionary.lookup("obey") |> hd()
    assert entry.approved
    assert entry.meaning =~ "procedures"
  end
end
