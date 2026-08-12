defmodule Ste.GlossaryTest do
  use ExUnit.Case, async: true
  doctest Ste.Glossary

  alias Ste.Glossary

  test "the default glossary is the example terms of rules 1.5 and 1.12" do
    assert "engine" in Glossary.default_nouns()
    assert "backup file" in Glossary.default_nouns()
    assert "ream" in Glossary.default_verbs()
    assert "heat-treat" in Glossary.default_verbs()
  end

  test "gives the category of a term" do
    assert Glossary.noun_categories("backup") == [
             "19_computer_science_information_and_communication_technology"
           ]

    # Rule 1.6: the same word can go into more than one category, because it has
    # a different meaning in a different context.
    assert length(Glossary.noun_categories("light")) > 1
    assert Glossary.noun_categories("base") == ["5_facilities_infrastructure_and_logistic_procedures"]
  end

  test "a plural of a technical noun is the technical noun" do
    assert Glossary.technical_noun?("engines", [])
    assert Glossary.technical_noun?("hazard lights", [])
  end

  test "the caller's terms are added to the defaults" do
    assert Glossary.technical_noun?("shroud", technical_nouns: ["shroud"])
    refute Glossary.technical_noun?("shroud", [])
  end

  test "default_glossary: false removes the defaults" do
    refute Glossary.technical_noun?("engine", default_glossary: false)
    assert Glossary.technical_noun?("engine", default_glossary: false, technical_nouns: ["engine"])
  end

  describe "project glossaries" do
    test "are loaded from priv/glossaries by name" do
      assert :java_python in Glossary.available()
    end

    test "add their technical nouns and technical verbs" do
      refute Glossary.technical_noun?("bytecode", [])
      assert Glossary.technical_noun?("bytecode", glossaries: [:java_python])
      assert Glossary.technical_verb?("deserialize", glossaries: [:java_python])
    end

    test "cover multi-word terms and plurals" do
      assert Glossary.technical_noun?("garbage collector", glossaries: [:java_python])
      assert Glossary.technical_noun?("stack traces", glossaries: [:java_python])
    end

    test "combine with the caller's own terms" do
      opts = [glossaries: [:java_python], technical_nouns: ["flange"]]
      assert Glossary.technical_noun?("heap", opts)
      assert Glossary.technical_noun?("flange", opts)
    end

    test "work without the defaults" do
      opts = [glossaries: [:java_python], default_glossary: false]
      assert Glossary.technical_noun?("heap", opts)
      refute Glossary.technical_noun?("engine", opts)
    end

    test "an unknown name says which ones exist" do
      assert_raise ArgumentError, ~r/unknown glossary :cobol.*:java_python/s, fn ->
        Glossary.technical_noun?("heap", glossaries: [:cobol])
      end
    end
  end

  test "phrase_length/1 covers the longest term in use" do
    assert Glossary.phrase_length([]) >= 3
    assert Glossary.phrase_length(technical_nouns: ["ramp service door safety connector pin"]) == 6
  end
end
