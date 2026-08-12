defmodule Ste.TextTest do
  use ExUnit.Case, async: true
  doctest Ste.Text

  alias Ste.Text

  defp kinds(text), do: text |> Text.tokenize() |> Enum.map(&{&1.text, &1.kind})

  test "an ordinary sentence is words" do
    assert kinds("Remove the cover.") == [{"Remove", :word}, {"the", :word}, {"cover", :word}]
  end

  test "numbers, units, and identifiers are not words" do
    # Rule 8.6: a number, a number with its unit, and an alphanumeric
    # identifier each count as one word and are not dictionary vocabulary.
    assert kinds("Put 2 mm of grease on the seal.") == [
             {"Put", :word},
             {"2", :number},
             {"mm", :number},
             {"of", :word},
             {"grease", :word},
             {"on", :word},
             {"the", :word},
             {"seal", :word}
           ]

    assert {"36L7", :identifier} in kinds("Tag circuit breaker 36L7.")
    assert {"twenty-one", :number} in kinds("The spar box has twenty-one ribs.")
    assert {"four", :number} in kinds("Remove the four screws.")
  end

  test "a unit symbol is a word when no number comes before it" do
    assert {"in", :word} in kinds("Install the seal in the housing.")
    assert {"in", :number} in kinds("The length is 6 in.")
  end

  test "uppercase text is quoted text, not vocabulary" do
    # Rule 8.6, item 5: uppercase letters can show quoted text.
    assert kinds("Release the SHORT-CIRCUIT TEST switch.") == [
             {"Release", :word},
             {"the", :word},
             {"SHORT-CIRCUIT", :caps},
             {"TEST", :caps},
             {"switch", :word}
           ]
  end

  test "text between quotation marks is one token" do
    assert {"Service Overview", :quoted} in kinds(
             "Touch the “Service Overview” arrow to select the function page."
           )
  end

  test "words/1 keeps only the words" do
    assert Text.words("Do steps 13 thru 16 a minimum of three times.")
           |> Enum.map(& &1.text) == ["Do", "steps", "thru", "a", "minimum", "of", "times"]
  end

  test "a token keeps its offset in the text" do
    [_do, steps | _] = Text.words("Do steps 13 thru 16.")
    assert steps.offset == 3
  end
end
