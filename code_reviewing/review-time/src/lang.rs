//! Language dependent judgements about a line of a diff.
//!
//! The heuristics here are deliberately crude. Because a) a diff gives no build and no type information b) a wrong guess only shifts the weight of one line and c) the estimate is reported as a range the cost of being crude is small.

const GENERATED_MARKERS: &[&str] = &[
    "node_modules/", "/dist/", "/build/", "/target/", "/vendor/", "/.next/",
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Cargo.lock", "poetry.lock",
    ".min.js", ".min.css", ".map", ".snap", ".svg", ".lock",
];

/// What kind of reading a file asks for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Code,
    Prose,
    Data,
}

/// Because a) prose is read at a words per minute rate that the reading research gives directly b) a data file is sampled rather than read line by line and c) everything else is code the three kinds carry different costs.
pub fn kind(path: &str) -> Kind {
    match extension(path) {
        "md" | "markdown" | "txt" | "rst" | "adoc" | "org" | "tex" => Kind::Prose,
        "json" | "csv" | "tsv" | "xml" | "po" | "sql" | "ndjson" | "geojson" => Kind::Data,
        _ => Kind::Code,
    }
}

/// Words a reader passes over in prose.
pub fn word_count(line: &str) -> usize {
    line.split_whitespace().filter(|w| w.chars().any(char::is_alphanumeric)).count()
}

/// A file no reviewer reads line by line.
pub fn is_generated(path: &str) -> bool {
    GENERATED_MARKERS.iter().any(|m| path.contains(m))
}

fn extension(path: &str) -> &str {
    match path.rsplit_once('.') {
        Some((_, ext)) => ext,
        None => "",
    }
}

fn comment_markers(path: &str) -> &'static [&'static str] {
    match extension(path) {
        "py" | "sh" | "bash" | "zsh" | "rb" | "yml" | "yaml" | "toml" | "cfg" | "ini" | "pl" | "r" => &["#"],
        "sql" | "hs" | "lua" | "elm" | "ada" => &["--"],
        "html" | "htm" | "xml" | "md" | "vue" => &["<!--", "//", "/*", "*"],
        "lisp" | "clj" | "el" => &[";"],
        _ => &["//", "/*", "*", "*/"],
    }
}

/// True when the line carries prose for the reader rather than behaviour.
pub fn is_comment(line: &str, path: &str) -> bool {
    let trimmed = line.trim_start();
    if trimmed.is_empty() {
        return false;
    }
    comment_markers(path).iter().any(|m| trimmed.starts_with(m))
}

pub fn is_blank(line: &str) -> bool {
    line.trim().is_empty()
}

/// Indentation is mandatory in these languages so its absence cannot be measured.
pub fn indentation_is_forced(path: &str) -> bool {
    matches!(extension(path), "py" | "hs" | "yml" | "yaml" | "nim" | "coffee")
}

pub fn leading_whitespace(line: &str) -> usize {
    line.len() - line.trim_start().len()
}

/// Net change in block depth across one line.
pub fn brace_delta(line: &str) -> i32 {
    let mut depth = 0;
    let mut in_string: Option<char> = None;
    let mut previous = '\0';
    for c in line.chars() {
        match in_string {
            Some(quote) => {
                if c == quote && previous != '\\' {
                    in_string = None;
                }
            }
            None => match c {
                '"' | '\'' | '`' => in_string = Some(c),
                '{' | '(' | '[' => depth += 1,
                '}' | ')' | ']' => depth -= 1,
                _ => {}
            },
        }
        previous = c;
    }
    depth
}

/// Words a reader has to resolve. Keywords are dropped because they carry no naming decision.
pub fn identifiers(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    for c in line.chars() {
        if c.is_alphanumeric() || c == '_' {
            current.push(c);
        } else if !current.is_empty() {
            push_identifier(&mut out, &current);
            current.clear();
        }
    }
    if !current.is_empty() {
        push_identifier(&mut out, &current);
    }
    out
}

fn push_identifier(out: &mut Vec<String>, word: &str) {
    if word.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        return;
    }
    if is_keyword(word) {
        return;
    }
    out.push(word.to_string());
}

const KEYWORDS: &[&str] = &[
    "if", "else", "for", "while", "do", "return", "break", "continue", "match", "case", "switch",
    "let", "var", "const", "fn", "func", "def", "class", "struct", "enum", "impl", "trait", "type",
    "pub", "mut", "use", "mod", "import", "from", "export", "default", "new", "this", "self",
    "try", "catch", "throw", "finally", "async", "await", "yield", "in", "is", "as", "of", "not",
    "and", "or", "true", "false", "null", "none", "nil", "void", "int", "str", "bool", "float",
    "with", "pass", "end", "then", "elif", "lambda", "static", "public", "private", "protected",
];

fn is_keyword(word: &str) -> bool {
    let lowered = word.to_ascii_lowercase();
    KEYWORDS.contains(&lowered.as_str())
}

/// Single letter and two letter names outside the counter idioms.
///
/// Because a) `i` and `j` in a loop head are read without effort b) `id` and `ok` are whole words to a programmer and c) only the remaining short names force the reader to hunt for a definition the idiom list is excluded from the count.
const SHORT_NAME_IDIOMS: &[&str] = &["i", "j", "k", "n", "x", "y", "z", "id", "ok", "db", "io", "fs", "os", "ui", "px", "dx", "dy", "up", "on", "to", "at", "by", "re", "fd"];

pub fn is_opaque_short_name(word: &str) -> bool {
    if word.chars().count() > 2 {
        return false;
    }
    !SHORT_NAME_IDIOMS.contains(&word.to_ascii_lowercase().as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comments_follow_the_extension() {
        assert!(is_comment("  // note", "src/main.rs"));
        assert!(is_comment("# note", "run.py"));
        assert!(!is_comment("# note", "src/main.rs"));
        assert!(!is_comment("let x = 1;", "src/main.rs"));
    }

    #[test]
    fn braces_inside_strings_are_ignored() {
        assert_eq!(brace_delta("fn main() {"), 1);
        assert_eq!(brace_delta("println!(\"}}{{\");"), 0);
        assert_eq!(brace_delta("}"), -1);
    }

    #[test]
    fn keywords_are_not_identifiers() {
        let found = identifiers("let total_count = if ready { 1 } else { 2 };");
        assert!(found.contains(&"total_count".to_string()));
        assert!(found.contains(&"ready".to_string()));
        assert!(!found.contains(&"let".to_string()));
        assert!(!found.contains(&"else".to_string()));
    }

    #[test]
    fn idioms_are_not_opaque() {
        assert!(is_opaque_short_name("q"));
        assert!(is_opaque_short_name("vv"));
        assert!(!is_opaque_short_name("i"));
        assert!(!is_opaque_short_name("id"));
        assert!(!is_opaque_short_name("total"));
    }

    #[test]
    fn kinds_follow_the_extension() {
        assert_eq!(kind("readme.md"), Kind::Prose);
        assert_eq!(kind("data/users.csv"), Kind::Data);
        assert_eq!(kind("src/model.rs"), Kind::Code);
    }

    #[test]
    fn words_exclude_bare_punctuation() {
        assert_eq!(word_count("the rate is 238 wpm --"), 5);
        assert_eq!(word_count("   "), 0);
    }

    #[test]
    fn generated_paths_are_recognised() {
        assert!(is_generated("apps/web/node_modules/left-pad/index.js"));
        assert!(is_generated("Cargo.lock"));
        assert!(!is_generated("src/model.rs"));
    }
}
