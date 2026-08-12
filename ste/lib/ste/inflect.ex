defmodule Ste.Inflect do
  @moduledoc """
  The small amount of morphology that the STE rules need.

  Part 2 of the standard gives nouns only in their singular form and says that
  "the plural form of countable nouns is permitted". Verb and adjective forms
  are listed in the dictionary itself, so they need no guessing: only plurals
  are derived here.
  """

  @doc """
  Candidate singular forms of a word, best guess first.

  Returns `[]` when the word cannot be a regular plural.

      iex> Ste.Inflect.singulars("screws")
      ["screw"]

      iex> Ste.Inflect.singulars("batteries")
      ["batterie", "battery"]

      iex> Ste.Inflect.singulars("screw")
      []
  """
  @spec singulars(String.t()) :: [String.t()]
  def singulars(word) do
    cond do
      String.ends_with?(word, "ies") -> [trim(word, 1), trim(word, 3) <> "y"]
      String.ends_with?(word, ["ses", "xes", "zes", "ches", "shes"]) -> [trim(word, 1), trim(word, 2)]
      String.ends_with?(word, "s") and not String.ends_with?(word, "ss") -> [trim(word, 1)]
      true -> []
    end
  end

  defp trim(word, count), do: String.slice(word, 0, String.length(word) - count)
end
