defmodule Ste.Rule do
  @moduledoc """
  What every rule module implements.

  One module per rule of part 1 of ASD-STE100. A rule takes a text and returns
  the places where the text does not obey it; no findings means the text passes
  the rule. Each rule decides one thing only, so that a text can fail rule 1.2
  and still pass rule 1.1 (`Check the laptop battery.` uses a word that is
  approved, but not as the approved part of speech).

  The written specification of each rule is in `docs/rules/`.
  """

  @callback id() :: String.t()
  @callback statement() :: String.t()
  @callback check(String.t(), keyword()) :: [Ste.Finding.t()]

  defmodule Result do
    @moduledoc "The outcome of one rule on one text."
    @enforce_keys [:rule, :passed?, :findings]
    defstruct [:rule, :passed?, :findings]

    @type t :: %__MODULE__{rule: String.t(), passed?: boolean(), findings: [Ste.Finding.t()]}
  end

  @doc "Runs a rule module and wraps its findings in a `Result`."
  @spec evaluate(module(), String.t(), keyword()) :: Result.t()
  def evaluate(rule, text, opts \\ []) do
    findings = rule.check(text, opts)
    %Result{rule: rule.id(), passed?: findings == [], findings: findings}
  end

  defmacro __using__(id: id, statement: statement) do
    quote do
      @behaviour Ste.Rule

      @impl Ste.Rule
      def id, do: unquote(id)

      @impl Ste.Rule
      def statement, do: unquote(statement)

      @doc "Whether the text obeys rule #{unquote(id)}."
      @spec passes?(String.t(), keyword()) :: boolean()
      def passes?(text, opts \\ []), do: check(text, opts) == []
    end
  end
end
