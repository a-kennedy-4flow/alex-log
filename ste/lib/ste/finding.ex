defmodule Ste.Finding do
  @moduledoc "One place where a text does not obey a rule."

  @enforce_keys [:rule, :message]
  defstruct [:rule, :message, :text, :offset, suggestions: []]

  @type t :: %__MODULE__{
          rule: String.t(),
          message: String.t(),
          text: String.t() | nil,
          offset: non_neg_integer() | nil,
          suggestions: [String.t()]
        }
end
