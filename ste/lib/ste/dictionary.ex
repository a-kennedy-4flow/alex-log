defmodule Ste.Dictionary do
  @moduledoc """
  The controlled dictionary of part 2 of ASD-STE100, Issue 9.

  `priv/dictionary.json` is produced from the PDF by
  `tools/extract_dictionary.py` and is read into module attributes at compile
  time, so a lookup is a map read with no process or file access.

  Each entry has a word, a part of speech, whether it is approved, its other
  approved forms, its approved meaning (approved entries), and its approved
  alternatives (entries that are not approved).
  """

  @path Path.expand("../../priv/dictionary.json", __DIR__)
  @external_resource @path

  @data @path |> File.read!() |> JSON.decode!()
  @entries Enum.map(@data["entries"], fn entry ->
             %{
               word: entry["word"],
               pos: entry["pos"],
               approved: entry["approved"],
               forms: entry["forms"],
               meaning: entry["meaning"],
               alternatives:
                 Enum.map(entry["alternatives"], &%{word: &1["word"], pos: &1["pos"]})
             }
           end)

  # Every spelling that a dictionary entry approves (the headword plus its
  # listed verb, comparative and superlative forms) mapped to the parts of
  # speech it is approved as.
  @approved_forms @entries
                  |> Enum.filter(& &1.approved)
                  |> Enum.flat_map(fn entry ->
                    Enum.map([entry.word | entry.forms], &{String.downcase(&1), entry.pos})
                  end)
                  |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))
                  |> Map.new(fn {word, pos} -> {word, Enum.uniq(pos)} end)

  @not_approved @entries
                |> Enum.reject(& &1.approved)
                |> Enum.group_by(&String.downcase(&1.word))

  @by_word Enum.group_by(@entries, &String.downcase(&1.word))

  # The dictionary has multi-word entries ("MAKE SURE", "AFT OF", "as to").
  # A caller that walks a text needs to know how far to look ahead.
  @phrase_length @by_word
                 |> Map.keys()
                 |> Enum.map(&length(String.split(&1, " ")))
                 |> Enum.max()

  @doc "Every dictionary entry."
  @spec entries() :: [map()]
  def entries, do: @entries

  @doc "How the dictionary was built and how many entries it holds."
  @spec source() :: map()
  def source, do: %{source: @data["source"], counts: @data["counts"]}

  @doc "The largest number of words in a dictionary entry."
  @spec phrase_length() :: pos_integer()
  def phrase_length, do: @phrase_length

  @doc """
  Whether the dictionary approves this word as any part of speech.

  A plural of an approved countable noun is approved (part 2, "Forms of
  approved words"). Rule 1.1 only asks whether the word is approved at all;
  whether it is used as the approved part of speech is rule 1.2.

      iex> Ste.Dictionary.approved?("remove")
      true

      iex> Ste.Dictionary.approved?("removed")
      true

      iex> Ste.Dictionary.approved?("acceptable")
      false
  """
  @spec approved?(String.t()) :: boolean()
  def approved?(word), do: approved_as(word) != []

  @doc """
  Whether the dictionary approves this word as this part of speech.

      iex> Ste.Dictionary.approved?("test", "n")
      true

      iex> Ste.Dictionary.approved?("test", "v")
      false
  """
  @spec approved?(String.t(), String.t()) :: boolean()
  def approved?(word, pos), do: pos in approved_as(word)

  @doc """
  The parts of speech that this word is approved as.

      iex> Enum.sort(Ste.Dictionary.approved_as("clean"))
      ["adj", "v"]

      iex> Ste.Dictionary.approved_as("surfaces")
      ["n"]
  """
  @spec approved_as(String.t()) :: [String.t()]
  def approved_as(word) do
    key = normalize(word)

    case Map.get(@approved_forms, key) do
      nil -> plural_of_approved_noun(key)
      pos -> pos
    end
  end

  @doc """
  The entries for a word that the dictionary lists as not approved.

  Used to explain a violation: each entry carries the approved alternatives.

      iex> Ste.Dictionary.not_approved("acceptable") |> hd() |> Map.get(:alternatives) |> Enum.map(& &1.word)
      ["PERMITTED", "SATISFACTORY", "SERVICEABLE"]
  """
  @spec not_approved(String.t()) :: [map()]
  def not_approved(word), do: Map.get(@not_approved, normalize(word), [])

  @doc "Every entry for a word, approved or not."
  @spec lookup(String.t()) :: [map()]
  def lookup(word), do: Map.get(@by_word, normalize(word), [])

  @doc "Whether the dictionary lists the word at all, approved or not."
  @spec listed?(String.t()) :: boolean()
  def listed?(word), do: lookup(word) != []

  defp plural_of_approved_noun(key) do
    if Enum.any?(Ste.Inflect.singulars(key), &("n" in Map.get(@approved_forms, &1, []))) do
      ["n"]
    else
      []
    end
  end

  defp normalize(word) do
    word
    |> String.downcase()
    |> String.replace("’", "'")
    |> String.trim()
  end
end
