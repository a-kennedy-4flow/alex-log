defmodule Mix.Tasks.Ste.Check do
  @shortdoc "Checks a string against the implemented STE rules"

  @moduledoc """
  Checks a string against the implemented ASD-STE100 rules.

      mix ste.check "A value of 2 mm is acceptable."
      mix ste.check --rule 1.1 "Make sure that the valve can operate."
      mix ste.check --noun valve --noun shroud "Remove the valve from the shroud."

  Options:

    * `--rule` - the rule to check, by number. Repeatable. All implemented rules
      by default.
    * `--noun` - a technical noun of your subject field (rule 1.5). Repeatable.
    * `--verb` - a technical verb of your subject field (rule 1.12). Repeatable.

  Exits with status 1 when the text does not obey a rule.
  """

  use Mix.Task

  @switches [rule: :keep, noun: :keep, verb: :keep]

  @impl Mix.Task
  def run(argv) do
    {opts, texts} = OptionParser.parse!(argv, strict: @switches)
    text = Enum.join(texts, " ")

    if text == "" do
      Mix.raise(~s(give the text to check, for example: mix ste.check "Remove the cover."))
    end

    check_opts = [
      technical_nouns: Keyword.get_values(opts, :noun),
      technical_verbs: Keyword.get_values(opts, :verb)
    ]

    results =
      case Keyword.get_values(opts, :rule) do
        [] -> Ste.check_all(text, check_opts)
        rules -> Ste.check_all(text, Keyword.put(check_opts, :only, rules))
      end

    results
    |> Enum.sort_by(fn {rule, _result} -> rule end)
    |> Enum.each(&report/1)

    unless Enum.all?(results, fn {_rule, result} -> result.passed? end), do: exit({:shutdown, 1})
  end

  defp report({rule, result}) do
    if result.passed? do
      Mix.shell().info("rule #{rule}: pass")
    else
      Mix.shell().info("rule #{rule}: fail")

      for finding <- result.findings do
        Mix.shell().info("  #{finding.message}")

        case finding.suggestions do
          [] -> :ok
          suggestions -> Mix.shell().info("    approved alternatives: " <> Enum.join(suggestions, ", "))
        end
      end
    end
  end
end
