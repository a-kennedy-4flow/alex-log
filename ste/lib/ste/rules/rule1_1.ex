defmodule Ste.Rules.Rule1_1 do
  @moduledoc """
  Rule 1.1 - Use words that are approved in the dictionary, technical nouns, or
  technical verbs.

  The specification is `docs/rules/1.1.md`. In short, every word of the text must
  be one of:

    1. a word that part 2 approves, in any of its approved forms, or the plural
       of an approved countable noun;
    2. a technical noun of rule 1.5, alone or as part of one;
    3. a technical verb of rule 1.12.

  This rule asks only whether the word may be used at all. Whether it is used as
  the approved part of speech is rule 1.2, and whether it carries its approved
  meaning is rule 1.3.

  Elements that rule 8.6 lists as unchangeable are not vocabulary and are
  skipped: numbers and units, abbreviations, alphanumeric identifiers, quoted
  text, and text in uppercase letters.

      iex> Ste.Rules.Rule1_1.passes?("Obey the safety instructions.")
      true

      iex> Ste.Rules.Rule1_1.passes?("A value of 2 mm is acceptable.")
      false
  """

  use Ste.Rule,
    id: "1.1",
    statement: "Use words that are approved in the dictionary, technical nouns, or technical verbs."

  alias Ste.{Dictionary, Finding, Glossary, Text}

  @impl Ste.Rule
  def check(text, opts \\ []) do
    text
    |> Text.tokenize()
    |> Enum.filter(&(&1.kind == :word))
    |> walk(opts, [])
    |> Enum.reverse()
  end

  # Walks the words left to right. A multi-word dictionary entry ("make sure",
  # "aft of") or a multi-word technical noun ("landing gear") is matched as a
  # unit before its parts are judged on their own.
  defp walk([], _opts, findings), do: findings

  defp walk([token | rest] = tokens, opts, findings) do
    case phrase_match(tokens, opts) do
      {:ok, consumed} ->
        walk(Enum.drop(tokens, consumed), opts, findings)

      :error ->
        if permitted?(token.text, opts) do
          walk(rest, opts, findings)
        else
          walk(rest, opts, [finding(token) | findings])
        end
    end
  end

  defp phrase_match(tokens, opts) do
    max = min(length(tokens), max(Dictionary.phrase_length(), Glossary.phrase_length(opts)))

    Enum.find_value(max..2//-1, :error, fn size ->
      phrase = tokens |> Enum.take(size) |> Enum.map_join(" ", & &1.text)
      if permitted?(phrase, opts), do: {:ok, size}
    end)
  end

  defp permitted?(term, opts) do
    Dictionary.approved?(term) or Glossary.technical_term?(term, opts) or
      hyphenated_permitted?(term, opts)
  end

  # A hyphenated word counts as one word (rule 8.7) and is often a technical
  # noun of its own ("heat-treat", "e-mail"). If the whole is unknown, the parts
  # must each be permitted: "main-gear-door" is usable when "main", "gear", and
  # "door" are.
  defp hyphenated_permitted?(term, opts) do
    case Text.hyphen_parts(term) do
      [_single] ->
        false

      parts ->
        Enum.all?(parts, fn part ->
          Dictionary.approved?(part) or Glossary.technical_term?(part, opts)
        end)
    end
  end

  defp finding(token) do
    entries = Dictionary.not_approved(token.text)

    %Finding{
      rule: "1.1",
      text: token.text,
      offset: token.offset,
      message: message(token.text, entries),
      suggestions: suggestions(entries)
    }
  end

  defp message(word, []) do
    "\"#{word}\" is not in the dictionary and is not a technical noun or a technical verb. " <>
      "Use an approved word, or add it to your glossary if it is a technical noun or verb of your subject field."
  end

  defp message(word, _entries) do
    "\"#{word}\" is in the dictionary as a word that is not approved. " <>
      "Use one of its approved alternatives, or a different sentence construction."
  end

  defp suggestions(entries) do
    for entry <- entries, alternative <- entry.alternatives, uniq: true do
      "#{alternative.word} (#{alternative.pos})"
    end
  end
end
