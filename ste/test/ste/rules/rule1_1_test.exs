defmodule Ste.Rules.Rule1_1Test do
  use ExUnit.Case, async: true
  doctest Ste.Rules.Rule1_1

  alias Ste.Rules.Rule1_1

  defp flagged(text, opts \\ []) do
    text |> Rule1_1.check(opts) |> Enum.map(& &1.text)
  end

  describe "words that are approved in the dictionary" do
    test "passes a sentence of approved words" do
      assert Rule1_1.passes?("Obey the safety instructions.")
      assert Rule1_1.passes?("Make sure that the area is clean.")
      assert Rule1_1.passes?("Do the procedures that follow:")
    end

    test "passes the approved forms of an approved verb" do
      assert Rule1_1.passes?("The operator removed the cover.")
      assert Rule1_1.passes?("The operator removes the cover.")
    end

    test "passes the plural of an approved noun" do
      assert Rule1_1.passes?("Clean the inner surfaces of the container.")
    end
  end

  describe "words that are not approved" do
    test "fails a word that the dictionary lists as not approved" do
      # Rule 9.1: "acceptable" is not approved.
      refute Rule1_1.passes?("A value of 2 mm is acceptable.")
      assert flagged("A value of 2 mm is acceptable.") == ["acceptable"]
    end

    test "gives the approved alternatives of the dictionary as suggestions" do
      [finding] = Rule1_1.check("The accuracy of the adjustment can change.")

      assert finding.rule == "1.1"
      assert finding.text == "accuracy"
      assert finding.suggestions == ["PRECISION (n)"]
      assert finding.message =~ "not approved"
    end

    test "fails a word that the dictionary does not list at all" do
      [finding] = Rule1_1.check("Follow the green lights to the nearest staircase.")

      assert finding.text == "staircase"
      assert finding.suggestions == []
      assert finding.message =~ "technical noun"
    end

    test "points at the word in the text" do
      [finding] = Rule1_1.check("A value of 2 mm is acceptable.")
      assert binary_part("A value of 2 mm is acceptable.", finding.offset, 10) == "acceptable"
    end
  end

  describe "technical nouns and technical verbs" do
    test "passes the technical nouns of the rule 1.5 categories" do
      # "The word 'engine' is a technical noun." (rule 1.1, examples)
      assert Rule1_1.passes?("Install the engine.")
      # "Backup" is a technical noun of category 19 (rule 1.6, examples).
      assert Rule1_1.passes?("Do the backup of the laptop at regular intervals.")
    end

    test "passes the technical verbs of the rule 1.12 categories" do
      # "The word 'ream' is a technical verb." (rule 1.1, examples)
      assert Rule1_1.passes?("Ream the hole to a diameter of 10 mm.")
      assert Rule1_1.passes?("Weld the two brackets.", technical_nouns: ["bracket"])
    end

    test "fails a technical noun that no glossary gives" do
      assert flagged("Make sure that the valve can operate.") == ["valve"]
    end

    test "passes a technical noun that the caller's glossary gives" do
      assert Rule1_1.passes?("Make sure that the valve can operate.",
               technical_nouns: ["valve"]
             )
    end

    test "passes a multi-word technical noun" do
      assert Rule1_1.passes?("Retract the main landing gear.",
               technical_nouns: ["main landing gear"]
             )
    end

    test "default_glossary: false checks against the caller's terms only" do
      refute Rule1_1.passes?("Install the engine.", default_glossary: false)
      assert Rule1_1.passes?("Install the engine.",
               default_glossary: false,
               technical_nouns: ["engine"]
             )
    end
  end

  describe "elements that are not vocabulary" do
    test "skips numbers, units, and alphanumeric identifiers" do
      assert Rule1_1.passes?("Remove the four screws (10) that attach the flange (15).")
      assert Rule1_1.passes?("Do steps 13 thru 16 a minimum of three times.")
      assert flagged("Tag circuit breaker 36L7.") == ["circuit", "breaker"]
    end

    test "skips quoted text and text in uppercase letters" do
      assert Rule1_1.passes?("Release the SHORT-CIRCUIT TEST switch.")
      assert Rule1_1.passes?("Set the switch to ON.")
      assert Rule1_1.passes?("Touch the “Service Overview” arrow.")
    end

    test "passes an empty text" do
      assert Rule1_1.passes?("")
      assert Rule1_1.passes?("   \n  ")
    end
  end

  describe "the rule decides one thing only" do
    test "a word that is approved as a different part of speech still passes" do
      # Rule 3.7 and rule 9.2 reject "Check the laptop battery." because "check"
      # is approved as a noun and not as a verb. Rule 1.1 asks only whether the
      # word may be used at all, so it passes here.
      assert Rule1_1.passes?("Check the laptop battery.", technical_nouns: ["battery"])
    end

    test "a word that is used with a meaning that is not approved still passes" do
      # Rule 1.3 rejects "Follow the safety instructions." because the approved
      # meaning of "follow" is "come after, go after". Rule 1.1 does not.
      assert Rule1_1.passes?("Follow the safety instructions.")
    end
  end

  test "reports the rule and its statement" do
    assert Rule1_1.id() == "1.1"
    assert Rule1_1.statement() =~ "approved in the dictionary"
  end
end
