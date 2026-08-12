defmodule SteTest do
  use ExUnit.Case, async: true
  doctest Ste

  test "passes?/3 answers true or false for one rule and one string" do
    assert Ste.passes?("Obey the safety instructions.", "1.1")
    refute Ste.passes?("A value of 2 mm is acceptable.", "1.1")
  end

  test "check/3 gives the findings" do
    result = Ste.check("A value of 2 mm is acceptable.", "1.1")

    assert result.rule == "1.1"
    refute result.passed?
    assert [%Ste.Finding{text: "acceptable"}] = result.findings
  end

  test "check_all/2 runs every implemented rule" do
    results = Ste.check_all("Obey the safety instructions.")

    assert Map.keys(results) == Map.keys(Ste.rules())
    assert Enum.all?(results, fn {_rule, result} -> result.passed? end)
  end

  test "a rule that is not implemented yet says so" do
    assert_raise ArgumentError, ~r/rule "2.1" is not implemented/, fn ->
      Ste.check("Runway light connection resistance calibration.", "2.1")
    end
  end
end
