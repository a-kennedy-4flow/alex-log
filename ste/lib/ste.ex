defmodule Ste do
  @moduledoc """
  A checker for ASD-STE100 Simplified Technical English, Issue 9.

  Each writing rule of part 1 has a written specification in `docs/rules/` and,
  where the rule can be decided by a program, a module under `Ste.Rules`.

      iex> Ste.passes?("Obey the safety instructions.", "1.1")
      true

      iex> Ste.passes?("Check the accuracy of the adjustment.", "1.1")
      false

  `check/3` gives the reason instead of a boolean:

      iex> %Ste.Rule.Result{passed?: false, findings: [finding]} =
      ...>   Ste.check("Check the accuracy of the adjustment.", "1.1")
      iex> {finding.text, finding.suggestions}
      {"accuracy", ["PRECISION (n)"]}

  Rules that need the technical nouns and technical verbs of your subject field
  take them as options (see `Ste.Glossary`):

      iex> Ste.passes?("Remove the flange.", "1.1", technical_nouns: ["flange"])
      true

  A subject field that has a glossary in `priv/glossaries/` is named instead:

      iex> Ste.passes?("Compile the source file to bytecode.", "1.1")
      false

      iex> Ste.passes?("Compile the source file to bytecode.", "1.1", glossaries: [:java_python])
      true
  """

  alias Ste.Rule

  @rules %{"1.1" => Ste.Rules.Rule1_1}

  @doc "The rules that are implemented, by rule number."
  @spec rules() :: %{String.t() => module()}
  def rules, do: @rules

  @doc """
  Runs one rule against a text.

  Raises if the rule is not implemented yet.
  """
  @spec check(String.t(), String.t(), keyword()) :: Rule.Result.t()
  def check(text, rule, opts \\ []) do
    Rule.evaluate(module!(rule), text, opts)
  end

  @doc "Whether the text obeys one rule."
  @spec passes?(String.t(), String.t(), keyword()) :: boolean()
  def passes?(text, rule, opts \\ []), do: check(text, rule, opts).passed?

  @doc """
  Runs every implemented rule, or the rules given in `:only`.

      iex> Ste.check_all("Obey the safety instructions.") |> Map.keys()
      ["1.1"]
  """
  @spec check_all(String.t(), keyword()) :: %{String.t() => Rule.Result.t()}
  def check_all(text, opts \\ []) do
    {only, opts} = Keyword.pop(opts, :only, Map.keys(@rules))

    Map.new(only, fn rule -> {rule, check(text, rule, opts)} end)
  end

  defp module!(rule) do
    case Map.fetch(@rules, rule) do
      {:ok, module} ->
        module

      :error ->
        raise ArgumentError,
              "rule #{inspect(rule)} is not implemented. Implemented: " <>
                Enum.join(Enum.sort(Map.keys(@rules)), ", ")
    end
  end
end
