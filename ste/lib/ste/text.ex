defmodule Ste.Text do
  @moduledoc """
  Splits a string into the tokens that the rules talk about.

  The kinds follow the elements that rule 8.6 names, because most rules apply to
  words only and have to leave the other elements alone:

    * `:word` - an ordinary word, the only kind the dictionary rules apply to
    * `:caps` - a run of uppercase letters. Rule 8.6 says that uppercase letters
      can show quoted text (`Release the SHORT-CIRCUIT TEST switch.`) and that
      abbreviations are also one word (`obey NASA protocols`). Neither is
      dictionary vocabulary.
    * `:quoted` - text between quotation marks, which rule 8.6 says you cannot
      change
    * `:number` - a number, with or without a unit of measurement
    * `:identifier` - an alphanumeric identifier (`36L7`, `L42`)
    * `:symbol` - anything else that is not punctuation

  A token keeps its byte offset in the original string so that a finding can
  point at the text.
  """

  defmodule Token do
    @moduledoc "One token of a text."
    @enforce_keys [:text, :kind, :offset]
    defstruct [:text, :kind, :offset]

    @type kind :: :word | :caps | :quoted | :number | :identifier | :symbol
    @type t :: %__MODULE__{text: String.t(), kind: kind(), offset: non_neg_integer()}
  end

  @quote_marks ["\"", "“", "”", "„", "«", "»"]

  # Rule 8.6 counts a number, and a number together with its unit of
  # measurement, as one word. A number written in words is still a number
  # ("The spar box has twenty-one ribs." is six words).
  @number_words ~w(
    zero one two three four five six seven eight nine ten eleven twelve
    thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty
    thirty forty fifty sixty seventy eighty ninety hundred thousand million
    billion first second third fourth fifth sixth seventh eighth ninth tenth
    eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth
    eighteenth nineteenth twentieth thirtieth fortieth fiftieth sixtieth
    seventieth eightieth ninetieth hundredth thousandth half quarter
  )

  # Symbols of units of measurement. The standard writes them after their
  # number ("10 mA", "6 mm", "20 kg"), and they are not dictionary vocabulary.
  # Category 9 of rule 1.5 gives the symbols that STE itself uses; the rest are
  # the usual SI and engineering symbols.
  @unit_symbols ~w(
    mm cm dm m km in ft yd mi mil
    mg g kg t lb lbs oz
    ml cl l L cc cu.in. sq.in. sq.ft. cu.ft. gal
    s ms µs h hr min sec
    N Nm kN kgf lbf
    Pa kPa MPa bar mbar psi psig inHg mmHg
    V mV kV A mA µA W kW mW kWh Ah mAh Hz kHz MHz GHz
    ohm Ω dB rpm rps
    °C °F K
  )

  @doc """
  The tokens of a string, in order.

      iex> Ste.Text.tokenize("Remove the four screws (10).") |> Enum.map(& &1.text)
      ["Remove", "the", "four", "screws", "10"]

      iex> Ste.Text.tokenize("Tag circuit breaker 36L7.") |> Enum.map(&{&1.text, &1.kind})
      [{"Tag", :word}, {"circuit", :word}, {"breaker", :word}, {"36L7", :identifier}]
  """
  @spec tokenize(String.t()) :: [Token.t()]
  def tokenize(text) when is_binary(text) do
    text
    |> quoted_spans()
    |> Enum.flat_map(fn
      {:quoted, span, offset} -> [%Token{text: span, kind: :quoted, offset: offset}]
      {:plain, span, offset} -> plain_tokens(span, offset)
    end)
  end

  @doc """
  Only the `:word` tokens of a string.

      iex> Ste.Text.words("Do a check of the laptop battery.") |> Enum.map(& &1.text)
      ["Do", "a", "check", "of", "the", "laptop", "battery"]
  """
  @spec words(String.t()) :: [Token.t()]
  def words(text), do: text |> tokenize() |> Enum.filter(&(&1.kind == :word))

  @doc """
  The parts of a hyphenated word.

      iex> Ste.Text.hyphen_parts("soap-and-water")
      ["soap", "and", "water"]
  """
  @spec hyphen_parts(String.t()) :: [String.t()]
  def hyphen_parts(word), do: word |> String.split("-", trim: true)

  # Splits the text into quoted and unquoted spans. Anything between a pair of
  # quotation marks is one token, because rule 8.6 treats quoted text as one
  # unchangeable element.
  defp quoted_spans(text) do
    pattern = ~r/["“„«][^"”»„]*["”»]/u

    {spans, last} =
      Regex.scan(pattern, text, return: :index)
      |> Enum.reduce({[], 0}, fn [{start, length}], {acc, cursor} ->
        before = binary_part(text, cursor, start - cursor)
        quoted = binary_part(text, start, length)

        {[{:quoted, strip_quotes(quoted), start}, {:plain, before, cursor}] ++ acc,
         start + length}
      end)

    Enum.reverse([{:plain, binary_part(text, last, byte_size(text) - last), last} | spans])
  end

  defp strip_quotes(text) do
    text |> String.trim() |> String.trim_leading("\"") |> String.trim_trailing("\"")
    |> String.trim_leading("“") |> String.trim_trailing("”")
    |> String.trim_leading("„") |> String.trim_trailing("«") |> String.trim_trailing("»")
  end

  defp plain_tokens(span, base_offset) do
    ~r/[^\s]+/u
    |> Regex.scan(span, return: :index)
    |> Enum.flat_map(fn [{start, length}] ->
      raw = binary_part(span, start, length)

      case trim_edges(raw) do
        {"", _} ->
          []

        {trimmed, shift} ->
          [%Token{text: trimmed, kind: kind(trimmed), offset: base_offset + start + shift}]
      end
    end)
    |> mark_units()
  end

  # A unit symbol is only a unit when it follows a number, so that "in" stays a
  # word in "in the tank" and is a unit in "6 in".
  defp mark_units([]), do: []

  defp mark_units([%Token{kind: :number} = number, next | rest]) do
    if next.text in @unit_symbols do
      [number, %{next | kind: :number} | mark_units(rest)]
    else
      [number | mark_units([next | rest])]
    end
  end

  defp mark_units([token | rest]), do: [token | mark_units(rest)]

  # Removes the punctuation around a token but keeps what belongs to the word
  # itself: internal hyphens, apostrophes, and internal periods ("a.m.").
  defp trim_edges(raw) do
    trimmed = String.replace(raw, ~r/^[^\p{L}\p{N}]+/u, "")
    shift = byte_size(raw) - byte_size(trimmed)
    {String.replace(trimmed, ~r/[^\p{L}\p{N}]+$/u, ""), shift}
  end

  defp kind(text) do
    cond do
      text in @quote_marks -> :symbol
      Regex.match?(~r/^[\p{N}][\p{N}\p{L}\.,\/°%'"-]*$/u, text) and letters?(text) -> :identifier
      Regex.match?(~r/^[\p{N}][\p{N}\.,\/°%'"-]*$/u, text) -> :number
      Regex.match?(~r/^\p{L}[\p{L}'’.-]*$/u, text) and digits?(text) -> :identifier
      Regex.match?(~r/^\p{L}[\p{L}'’.-]*$/u, text) -> word_or_caps(text)
      Regex.match?(~r/^[\p{L}\p{N}][\p{L}\p{N}'’.\/-]*$/u, text) -> :identifier
      true -> :symbol
    end
  end

  defp word_or_caps(text) do
    letters = String.replace(text, ~r/[^\p{L}]/u, "")

    cond do
      number_word?(text) -> :number
      # An abbreviation written with periods ("a.m.", "sq.in.") counts as one
      # word (rule 8.6) and is not a dictionary word.
      String.contains?(text, ".") -> :identifier
      String.length(letters) > 1 and letters == String.upcase(letters) -> :caps
      true -> :word
    end
  end

  # "four", "twenty-one", "one-quarter".
  defp number_word?(text) do
    parts = text |> String.downcase() |> String.split(["-", "and"], trim: true)
    parts != [] and Enum.all?(parts, &(&1 in @number_words))
  end

  defp letters?(text), do: Regex.match?(~r/\p{L}/u, text)
  defp digits?(text), do: Regex.match?(~r/\p{N}/u, text)
end
