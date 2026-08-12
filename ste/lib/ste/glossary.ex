defmodule Ste.Glossary do
  @moduledoc """
  Technical nouns (rule 1.5) and technical verbs (rule 1.12).

  The dictionary does not include technical nouns or technical verbs, because
  "there are too many, and each subject field uses different technical nouns for
  their texts". A checker therefore cannot decide on its own whether a word is a
  technical noun or verb: it needs the glossary or terminology database of the
  company, industry, or subject field.

  The default glossary here is only the example terms that rules 1.5 and 1.12
  list for each category. Pass your own terms to any check that needs them:

      Ste.check(text, "1.1", technical_nouns: ["flange", "shroud"], technical_verbs: ["lockwire"])

  Set `default_glossary: false` to check against your own terms only.

  ## Project glossaries

  A subject field that is used often enough is kept as a file in
  `priv/glossaries/` and named in the options instead:

      Ste.check(text, "1.1", glossaries: [:java_python])

  `available/0` lists them. A project glossary has the same shape as
  `priv/technical_terms.json`: a `"nouns"` and a `"verbs"` object, each of them
  a category name to a list of terms. `tools/validate_glossary.py` checks one
  against the rules it has to obey, and reports the terms where it overrides
  part 2 of the standard.
  """

  @path Path.expand("../../priv/technical_terms.json", __DIR__)
  @external_resource @path

  @data @path |> File.read!() |> JSON.decode!()

  @glossary_paths Path.expand("../../priv/glossaries", __DIR__)
                  |> Path.join("*.json")
                  |> Path.wildcard()
                  |> Enum.sort()

  for path <- @glossary_paths do
    @external_resource path
  end

  @glossaries Map.new(@glossary_paths, fn path ->
                data = path |> File.read!() |> JSON.decode!()

                collect = fn key ->
                  data
                  |> Map.get(key, %{})
                  |> Map.values()
                  |> List.flatten()
                  |> Enum.map(&String.downcase/1)
                  |> Enum.uniq()
                  |> Enum.sort()
                end

                {String.to_atom(Path.basename(path, ".json")),
                 %{nouns: collect.("nouns"), verbs: collect.("verbs")}}
              end)

  @nouns @data["nouns"] |> Map.values() |> List.flatten() |> Enum.map(&String.downcase/1) |> Enum.sort() |> Enum.uniq()
  @verbs @data["verbs"] |> Map.values() |> List.flatten() |> Enum.map(&String.downcase/1) |> Enum.sort() |> Enum.uniq()

  @noun_categories Map.new(@data["nouns"], fn {category, terms} ->
                     {category, Enum.map(terms, &String.downcase/1)}
                   end)
  @verb_categories Map.new(@data["verbs"], fn {category, terms} ->
                     {category, Enum.map(terms, &String.downcase/1)}
                   end)

  @doc """
  The project glossaries in `priv/glossaries/`, by name.

      iex> :java_python in Ste.Glossary.available()
      true
  """
  @spec available() :: [atom()]
  def available, do: Map.keys(@glossaries) |> Enum.sort()

  @doc "The default technical nouns, from the categories of rule 1.5."
  @spec default_nouns() :: [String.t()]
  def default_nouns, do: @nouns

  @doc "The default technical verbs, from the categories of rule 1.12."
  @spec default_verbs() :: [String.t()]
  def default_verbs, do: @verbs

  @doc """
  The rule 1.5 categories a term belongs to, or `[]`.

      iex> Ste.Glossary.noun_categories("engine")
      ["1_official_parts_information"]
  """
  @spec noun_categories(String.t()) :: [String.t()]
  def noun_categories(term) do
    key = String.downcase(term)
    for {category, terms} <- @noun_categories, key in terms, do: category
  end

  @doc """
  The rule 1.12 categories a term belongs to, or `[]`.

      iex> Ste.Glossary.verb_categories("ream")
      ["1a_manufacturing_remove_material"]
  """
  @spec verb_categories(String.t()) :: [String.t()]
  def verb_categories(term) do
    key = String.downcase(term)
    for {category, terms} <- @verb_categories, key in terms, do: category
  end

  @doc """
  Whether a term is a technical noun of this glossary.

  A plural of a technical noun counts as the technical noun.

      iex> Ste.Glossary.technical_noun?("screws", [])
      true

      iex> Ste.Glossary.technical_noun?("flange", [])
      false

      iex> Ste.Glossary.technical_noun?("flange", technical_nouns: ["flange"])
      true

      iex> Ste.Glossary.technical_noun?("bytecode", glossaries: [:java_python])
      true
  """
  @spec technical_noun?(String.t(), keyword()) :: boolean()
  def technical_noun?(term, opts) do
    member?(term, nouns(opts))
  end

  @doc """
  Whether a term is a technical verb of this glossary.

      iex> Ste.Glossary.technical_verb?("ream", [])
      true

      iex> Ste.Glossary.technical_verb?("lockwire", technical_verbs: ["lockwire"])
      true
  """
  @spec technical_verb?(String.t(), keyword()) :: boolean()
  def technical_verb?(term, opts) do
    member?(term, verbs(opts))
  end

  @doc "Whether a term is either a technical noun or a technical verb."
  @spec technical_term?(String.t(), keyword()) :: boolean()
  def technical_term?(term, opts) do
    technical_noun?(term, opts) or technical_verb?(term, opts)
  end

  @doc "The technical nouns in use: the defaults unless disabled, plus the caller's."
  @spec nouns(keyword()) :: [String.t()]
  def nouns(opts), do: terms(opts, :technical_nouns, @nouns)

  @doc "The technical verbs in use: the defaults unless disabled, plus the caller's."
  @spec verbs(keyword()) :: [String.t()]
  def verbs(opts), do: terms(opts, :technical_verbs, @verbs)

  @doc "The largest number of words in a glossary term."
  @spec phrase_length(keyword()) :: pos_integer()
  def phrase_length(opts) do
    (nouns(opts) ++ verbs(opts))
    |> Enum.map(&length(String.split(&1, " ")))
    |> Enum.max(fn -> 1 end)
  end

  defp terms(opts, key, defaults) do
    kind = if key == :technical_nouns, do: :nouns, else: :verbs
    custom = opts |> Keyword.get(key, []) |> Enum.map(&String.downcase/1)
    named = opts |> Keyword.get(:glossaries, []) |> Enum.flat_map(&Map.fetch!(glossary!(&1), kind))
    defaults = if Keyword.get(opts, :default_glossary, true), do: defaults, else: []

    defaults ++ named ++ custom
  end

  defp glossary!(name) do
    case Map.fetch(@glossaries, name) do
      {:ok, glossary} ->
        glossary

      :error ->
        raise ArgumentError,
              "unknown glossary #{inspect(name)}. Available: " <>
                Enum.map_join(available(), ", ", &inspect/1)
    end
  end

  defp member?(term, terms) do
    key = String.downcase(term)
    key in terms or Enum.any?(Ste.Inflect.singulars(key), &(&1 in terms))
  end
end
