# Architecture

## The shape of the problem

A rule in ASD-STE100 is a predicate over some level of structure in a document, and the
levels differ wildly: 8.1 needs one codepoint, 6.6 needs paragraph boundaries, 3.2 needs verb
groups, 1.11 needs every document in the project at once. A design that gives every rule a
string and lets it do its own parsing will parse the same text nine times and disagree with
itself about where the sentences are.

So the engine is a **layered analysis pipeline** computed once per document, and rules
*declare* which layers they need. The engine builds only the layers some enabled rule asked
for — a repository running only 8.1 and 6.6 never pays for the part-of-speech lattice.

## Analysis layers

```
L0  Source        bytes, encoding, a SourceMap back to the original file
L1  Blocks        paragraphs, vertical lists, headings, tables, steps,
                  NOTE / WARNING / CAUTION blocks, and each block's TEXT TYPE
L2  Sentences     segmentation, incl. rule 8.4 (colon in a vertical list ends a sentence)
L3  Tokens        word · caps · quoted · number · number+unit · abbreviation ·
                  alphanumeric identifier · proper noun · symbol      (rule 8.6)
L4  Word count    the counting function defined by rules 8.4–8.7
L5  Lexicon       dictionary lookup, morphological analysis, glossary hits
L6  POS lattice   the set of readings for each token, with weights
L7  Chunks        multi-word nouns, verb groups, clauses, mood, voice, tense
L8  Corpus        cross-document term index, first-use tracking
```

Each layer is a separate, independently testable value derived from the one below. L4 is a
function, not a table — but it is a *layer* because it is shared, subtle, and consumed by
three rules that must all agree.

Two properties matter more than they look:

**Every layer preserves byte spans into L0.** A finding on a word inside a `<para>` in an
S1000D data module must point at that word in the original XML file, not at an offset in some
extracted plaintext. That means L1 emits blocks carrying a `SourceMap`, and every downstream
span is remapped on the way out. Retrofitting this is painful; it is cheap now.

**L1 owns text type.** Sections 5, 6, and 7 apply respectively to procedural, descriptive, and
safety content, and 3.6's passive-voice exception depends on the same distinction. Text type is
therefore part of the analysis, not a per-invocation flag: one document routinely contains a
descriptive introduction, procedural steps, and warnings, and applying a 20-word limit to the
introduction is wrong.

## Crates

```
ste/
├── crates/
│   ├── ste-core        types: Span, SourceMap, Finding, Severity, Confidence, RuleId
│   ├── ste-lex         dictionary, glossary, morphology, spelling map   (L5)
│   ├── ste-parse       blocks, sentences, tokens, word count            (L1–L4)
│   ├── ste-tag         POS lattice and disambiguation                   (L6)
│   ├── ste-chunk       multi-word nouns, verb groups, clauses, mood     (L7)
│   ├── ste-rules       one module per rule + the registry
│   ├── ste-engine      layer scheduling, dispatch, corpus reduce        (L8)
│   ├── ste-fmt         human / JSON / SARIF / LSP-diagnostic output
│   ├── ste-cli         the `ste` binary
│   ├── ste-lsp         language server
│   └── ste-wasm        browser and editor bindings
├── xtask/              dictionary + corpus extraction from the PDF
├── docs/rules/         one prose specification per rule, as in the Elixir prototype
└── tests/corpus/       the conformance corpus (see 05-testing.md)
```

`ste-core` depends on nothing. Rules depend on analysis crates, never on each other — where
two rules share logic (1.4 and 3.1 both check verb forms) the logic goes down into
`ste-lex`, and both rules report it under their own id.

Keeping `docs/rules/` as prose next to the code is worth carrying over from the Elixir
prototype. The standard's rules are short but their explanatory text is long and full of
edge cases; a rule module without a written specification beside it becomes a pile of
regexes nobody dares change.

## Core types

```rust
/// Byte offsets into the document source. u32 is enough for any real document
/// and halves the size of every finding and token.
#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Span { pub start: u32, pub end: u32 }

pub struct Finding {
    pub rule: RuleId,
    pub span: Span,
    pub severity: Severity,       // Error | Warning | Info
    pub confidence: Confidence,   // Certain | Probable — see 03-ambiguity.md
    pub message: String,
    pub evidence: Vec<Span>,      // e.g. the auxiliary AND the participle for 3.4
    pub fixes: Vec<Fix>,          // gated by rule 9.1
}

pub struct Fix {
    pub span: Span,
    pub replacement: String,
    pub applicability: Applicability,  // Safe | NeedsReview
}
```

`Confidence` is not decoration. Rule 1.2 on an ambiguous homograph can be sure the word is
wrong or merely suspect it, and a CI gate wants `--min-confidence certain` while an author in
an editor wants to see everything. Inventing a single boolean here would force the engine to
either hide real violations or fail builds on guesses.

`evidence` carries the *other* spans that justify the finding. For 3.4, pointing only at the
main verb leaves the writer wondering; pointing at `has` and `removed` together explains
itself.

## The rule trait

```rust
pub trait Rule: Send + Sync {
    fn id(&self) -> RuleId;
    fn statement(&self) -> &'static str;   // the standard's own words
    fn tier(&self) -> Tier;                // Decidable | GlossaryGated | Advisory
    fn requires(&self) -> Layers;          // bitflags — drives layer scheduling
    fn scope(&self) -> Scope;              // Sentence | Block | Document | Corpus
    fn text_types(&self) -> TextTypes;     // which blocks this rule applies to

    fn check(&self, cx: &Cx<'_>, out: &mut Findings);
}
```

`Cx` is a view onto the document restricted to the rule's scope and the layers it asked for.
Asking `cx` for a layer the rule did not declare is a compile-time error via typestate, or
failing that a debug assertion — the point is that `requires()` cannot drift out of sync with
the body, because that drift is how you get a rule that works in the test suite and panics in
production when another rule happened to be disabled.

`scope` drives dispatch. The engine walks each sentence once and offers it to every
sentence-scoped rule, so the text is traversed a constant number of times regardless of how
many rules are enabled. Corpus-scoped rules (1.11, 9.4, 2.2) do not see documents at all;
they get a merged index built by a map-reduce over per-document summaries, which is what keeps
the corpus tier from needing every document resident at once.

## Rust choices worth stating

**Dictionary loading: runtime, zero-copy.** The Elixir prototype bakes the dictionary into
module attributes at compile time. The Rust equivalent would be `phf` in `build.rs`, and it
is the wrong call here for two reasons: the dictionary is ASD copyright and should not be
linked into a distributed binary (see [04-data-pipeline.md](04-data-pipeline.md)), and project
glossaries change without a recompile. Use an `rkyv` or `zerocopy` archive `mmap`ed at
startup — lookups stay a hash probe with no deserialization. Keep `phf` for the genuinely
static tiny sets: unit symbols, contractions, Latin abbreviations, the spelling map.

**Interned words.** Intern every distinct word form to a `u32` at L3. L5 and L6 then compare
integers, and the 191 homograph lookups per sentence stop mattering.

**Per-document arena.** All analysis is throwaway. Bump-allocate L1–L7 into a `bumpalo` arena
that is reset between documents; no per-token `String`, no reference counting. Findings own
their `message` because they outlive the arena.

**Parallelism at the document boundary.** `rayon` over documents; each document's analysis is
single-threaded and allocation-free after warmup. Corpus rules are a reduce. Determinism is a
hard requirement — findings sort by `(span.start, rule_id, span.end)` before output, so two
runs on the same input are byte-identical. Without that, snapshot tests and CI gates are both
unusable.

**No ML in the core.** The disambiguation in [03-ambiguity.md](03-ambiguity.md) is a weighted
lattice over a closed lexicon with hand-written constraints. That is a deliberate boundary: it
keeps the tool auditable, keeps findings explainable to a writer who wants to argue, keeps the
binary small enough for WASM, and avoids a model artifact that needs versioning alongside the
standard. If a statistical tagger is ever added it goes behind the same lattice interface as
one more weight source.

## Configuration

An `ste.toml` at the project root:

```toml
[glossary]
technical_nouns = ["glossary/nouns.csv"]   # term, category, preferred, aliases
technical_verbs = ["glossary/verbs.csv"]
include_standard_examples = false          # the 615+163 examples from 1.5/1.12 are
                                           # illustrative, not a vocabulary — off by default

[text_types]
descriptive = ["intro", "description"]     # map input structure to text type
procedural  = ["proc", "step"]
safety      = ["warning", "caution", "note"]

[limits]
procedural_sentence_words = 20             # rule 5.1
descriptive_sentence_words = 25            # rule 6.3
paragraph_sentences = 6                    # rule 6.6
multi_word_noun_words = 3                  # rule 2.1

[rules]
default_advisory = "off"
"3.6" = "warning"                          # per-rule severity override
"1.10" = { severity = "info", deny = ["deny/jargon.txt"] }
```

One note on `include_standard_examples`. The Elixir prototype defaults its glossary to the
example terms the standard lists for each category, and that default is a trap worth
inverting in the Rust version: the standard says explicitly that those lists are examples and
not exhaustive, so treating them as *the* vocabulary makes rule 1.1 pass words that a given
project has no business using and fail words it uses constantly. Ship them as a labelled
seed for glossary bootstrap, not as a default lexicon.
