//! What a file is and how its language wants to be read.
//!
//! The heuristics here are deliberately crude. Because a) a diff gives no build and no type information b) a wrong guess only shifts the weight of one line and c) the estimate is reported as a range the cost of being crude is small.

/// What kind of reading a file asks for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Code,
    Prose,
    Data,
}

/// The rules one language wants applied to its lines.
///
/// `density` is tokens per line against a baseline of 10. Measured on 2026-09-23 over
/// polaris-backend at 9.44 for java and polaris-frontend at 10.20 for typescript and
/// 10.24 for vue and alex-log at 10.16 for rust. The languages sit within 5% of each
/// other so the field exists for the ones that will not.
#[derive(Debug)]
pub struct Language {
    pub name: &'static str,
    pub kind: Kind,
    pub comments: &'static [&'static str],
    pub declarations: &'static [&'static str],
    pub idioms: &'static [&'static str],
    pub generics_are_capitals: bool,
    pub indentation_forced: bool,
    pub density: f64,
}

/// Short names every programmer reads without effort.
const COMMON_IDIOMS: &[&str] = &["i", "j", "k", "n", "x", "y", "z", "id", "ok", "db", "io", "fs", "os", "ui", "px", "dx", "dy", "up", "on", "to", "at", "by", "re", "fd"];

const RUST: Language = Language {
    name: "rust",
    kind: Kind::Code,
    comments: &["//", "/*", "*", "*/"],
    declarations: &["let", "const", "static", "fn", "struct", "enum", "trait", "type", "mod", "union"],
    idioms: COMMON_IDIOMS,
    generics_are_capitals: true,
    indentation_forced: false,
    density: 1.00,
};

const JVM: Language = Language {
    name: "jvm",
    kind: Kind::Code,
    comments: &["//", "/*", "*", "*/"],
    declarations: &["class", "interface", "enum", "record", "var", "val", "fun", "void", "new"],
    idioms: COMMON_IDIOMS,
    generics_are_capitals: true,
    indentation_forced: false,
    density: 0.95,
};

const SCRIPT: Language = Language {
    name: "script",
    kind: Kind::Code,
    comments: &["//", "/*", "*", "*/", "<!--"],
    declarations: &["let", "const", "var", "function", "class", "interface", "type", "enum"],
    idioms: COMMON_IDIOMS,
    generics_are_capitals: true,
    indentation_forced: false,
    density: 1.00,
};

const PYTHON: Language = Language {
    name: "python",
    kind: Kind::Code,
    comments: &["#"],
    declarations: &["def", "class", "lambda", "global", "nonlocal"],
    idioms: COMMON_IDIOMS,
    generics_are_capitals: false,
    indentation_forced: true,
    density: 1.00,
};

const SHELL: Language = Language {
    name: "shell",
    kind: Kind::Code,
    comments: &["#"],
    declarations: &["export", "local", "readonly", "declare", "function"],
    idioms: COMMON_IDIOMS,
    generics_are_capitals: false,
    indentation_forced: false,
    density: 1.00,
};

const CONFIG: Language = Language {
    name: "config",
    kind: Kind::Code,
    comments: &["#"],
    declarations: &[],
    idioms: COMMON_IDIOMS,
    generics_are_capitals: false,
    indentation_forced: true,
    density: 1.00,
};

const SQL: Language = Language {
    name: "sql",
    kind: Kind::Code,
    comments: &["--", "/*", "*"],
    declarations: &["table", "view", "index", "column", "constraint"],
    idioms: COMMON_IDIOMS,
    generics_are_capitals: false,
    indentation_forced: false,
    density: 1.00,
};

const PROSE: Language = Language {
    name: "prose",
    kind: Kind::Prose,
    comments: &[],
    declarations: &[],
    idioms: COMMON_IDIOMS,
    generics_are_capitals: false,
    indentation_forced: true,
    density: 1.00,
};

const DATA: Language = Language {
    name: "data",
    kind: Kind::Data,
    comments: &["//", "#"],
    declarations: &[],
    idioms: COMMON_IDIOMS,
    generics_are_capitals: false,
    indentation_forced: true,
    density: 1.00,
};

const OTHER: Language = Language {
    name: "other",
    kind: Kind::Code,
    comments: &["//", "#", "/*", "*"],
    declarations: &["let", "const", "var", "def", "fn", "class", "function"],
    idioms: COMMON_IDIOMS,
    generics_are_capitals: false,
    indentation_forced: false,
    density: 1.00,
};

pub fn language(path: &str) -> &'static Language {
    match extension(path) {
        "rs" => &RUST,
        "java" | "kt" | "kts" | "scala" | "groovy" | "gradle" => &JVM,
        "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "vue" | "svelte" | "c" | "h" | "cpp" | "hpp" | "cs" | "go" | "swift" | "php" | "dart" => &SCRIPT,
        "py" | "pyi" => &PYTHON,
        "sh" | "bash" | "zsh" | "fish" => &SHELL,
        "yml" | "yaml" | "toml" | "ini" | "cfg" | "conf" | "properties" => &CONFIG,
        "sql" => &SQL,
        "md" | "markdown" | "txt" | "rst" | "adoc" | "org" | "tex" => &PROSE,
        "json" | "csv" | "tsv" | "xml" | "po" | "ndjson" | "geojson" | "lock" => &DATA,
        _ => &OTHER,
    }
}

fn extension(path: &str) -> &str {
    let name = match path.rfind('/') {
        Some(cut) => &path[cut + 1..],
        None => path,
    };
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => ext,
        _ => "",
    }
}

const GENERATED_MARKERS: &[&str] = &[
    "node_modules/", "/dist/", "/build/", "/target/", "/vendor/", "/.next/", "/coverage/",
    "storybook-static/", "__snapshots__/", "/__generated__/", "/generated/",
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Cargo.lock", "poetry.lock",
    ".min.js", ".min.css", ".map", ".snap", ".svg", ".lock",
];

/// A file no reviewer reads line by line.
pub fn is_generated(path: &str) -> bool {
    GENERATED_MARKERS.iter().any(|marker| path.contains(marker))
}

/// Bundled output gives itself away by line length whatever its path says.
///
/// The storybook bundles in polaris-frontend run to 20604 characters on one line
/// against a hand written mean of about 35.
const MACHINE_LINE_LENGTH: usize = 200;

pub fn looks_machine_written(added: &[String]) -> bool {
    let counted: Vec<usize> = added.iter().filter(|line| !is_blank(line)).map(|line| line.chars().count()).collect();
    if counted.len() < 3 {
        return false;
    }
    counted.iter().sum::<usize>() / counted.len() > MACHINE_LINE_LENGTH
}

pub fn is_blank(line: &str) -> bool {
    line.trim().is_empty()
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

/// Words a reader passes over in prose.
pub fn word_count(line: &str) -> usize {
    line.split_whitespace().filter(|word| word.chars().any(char::is_alphanumeric)).count()
}

/// Every identifier on the line in the order it appears. Keywords are dropped because they carry no naming decision.
pub fn identifiers(line: &str) -> Vec<String> {
    tokens(line).into_iter().filter(|token| is_name(token) && !is_keyword(token)).collect()
}

/// Identifiers and the punctuation between them. The punctuation is what marks a declaration.
fn tokens(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    for c in line.chars() {
        if c.is_alphanumeric() || c == '_' {
            current.push(c);
        } else {
            if !current.is_empty() {
                out.push(std::mem::take(&mut current));
            }
            if !c.is_whitespace() {
                out.push(c.to_string());
            }
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

const KEYWORDS: &[&str] = &[
    "if", "else", "for", "while", "do", "return", "break", "continue", "match", "case", "switch",
    "let", "var", "const", "fn", "func", "def", "class", "struct", "enum", "impl", "trait", "type",
    "pub", "mut", "use", "mod", "import", "from", "export", "default", "new", "this", "self",
    "try", "catch", "throw", "finally", "async", "await", "yield", "in", "is", "as", "of", "not",
    "and", "or", "true", "false", "null", "none", "nil", "void", "int", "str", "bool", "float",
    "with", "pass", "end", "then", "elif", "lambda", "static", "public", "private", "protected",
    "record", "interface", "val", "union", "global", "nonlocal", "local", "readonly", "declare",
    "function", "table", "view", "index", "column", "constraint",
];

fn is_keyword(word: &str) -> bool {
    KEYWORDS.contains(&word.to_ascii_lowercase().as_str())
}

impl Language {
    /// True when the line carries prose for the reader rather than behaviour.
    pub fn is_comment(&self, line: &str) -> bool {
        let trimmed = line.trim_start();
        if trimmed.is_empty() {
            return false;
        }
        self.comments.iter().any(|marker| trimmed.starts_with(marker))
    }

    /// Names the line introduces rather than every name it mentions.
    ///
    /// A name counts when it follows a declaring keyword or when the next
    /// character binds it. Because a) a name is chosen once and read many times
    /// b) a loop that mentions `q` ten times is one naming decision and not ten
    /// and c) an imported name was somebody else's choice the count belongs at
    /// the declaration.
    pub fn declared_names(&self, line: &str) -> Vec<String> {
        let tokens = tokens(line);
        let mut out = Vec::new();
        for (at, token) in tokens.iter().enumerate() {
            if !is_name(token) || is_keyword(token) {
                continue;
            }
            let before = at.checked_sub(1).and_then(|before| tokens.get(before)).map(String::as_str);
            let after = tokens.get(at + 1).map(String::as_str);
            let declared = before.is_some_and(|word| self.declares(word))
                || after == Some(":")
                || (after == Some("=") && tokens.get(at + 2).map(String::as_str) != Some("="));
            if declared {
                out.push(token.clone());
            }
        }
        out
    }

    fn declares(&self, word: &str) -> bool {
        self.declarations.iter().any(|keyword| keyword.eq_ignore_ascii_case(word))
    }

    /// One or two characters that name nothing.
    ///
    /// A single capital is a type parameter rather than a bad name so `T` and `K`
    /// and `V` never count against a language that uses them.
    pub fn is_opaque(&self, name: &str) -> bool {
        if name.chars().count() > 2 {
            return false;
        }
        if self.generics_are_capitals && is_type_parameter(name) {
            return false;
        }
        !self.idioms.contains(&name.to_ascii_lowercase().as_str())
    }
}

fn is_name(token: &str) -> bool {
    token.chars().next().is_some_and(|c| c.is_alphabetic() || c == '_')
}

fn is_type_parameter(name: &str) -> bool {
    let mut characters = name.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    if !first.is_ascii_uppercase() {
        return false;
    }
    match characters.next() {
        None => true,
        Some(second) => second.is_ascii_digit() && characters.next().is_none(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comments_follow_the_language() {
        assert!(language("src/main.rs").is_comment("  // note"));
        assert!(language("run.py").is_comment("# note"));
        assert!(!language("src/main.rs").is_comment("# note"));
        assert!(!language("src/main.rs").is_comment("let x = 1;"));
    }

    #[test]
    fn extensions_reach_the_right_profile() {
        assert_eq!(language("src/main.rs").name, "rust");
        assert_eq!(language("Api.java").name, "jvm");
        assert_eq!(language("app/Page.vue").name, "script");
        assert_eq!(language("readme.md").kind, Kind::Prose);
        assert_eq!(language("fixtures/orders.json").kind, Kind::Data);
        assert_eq!(language("Makefile").name, "other");
        assert_eq!(language(".gitignore").name, "other");
    }

    #[test]
    fn braces_inside_strings_are_ignored() {
        assert_eq!(brace_delta("fn main() {"), 1);
        assert_eq!(brace_delta("println!(\"}}{{\");"), 0);
        assert_eq!(brace_delta("}"), -1);
    }

    #[test]
    fn punctuation_is_never_a_name() {
        let found = identifiers("let q = w + e;");
        assert_eq!(found, vec!["q", "w", "e"]);
    }

    #[test]
    fn keywords_are_not_identifiers() {
        let found = identifiers("let total_count = if ready { 1 } else { 2 };");
        assert!(found.contains(&"total_count".to_string()));
        assert!(found.contains(&"ready".to_string()));
        assert!(!found.contains(&"let".to_string()));
    }

    #[test]
    fn only_the_names_a_line_introduces_are_declared() {
        let rust = language("src/main.rs");
        assert_eq!(rust.declared_names("let total = compute(q, w);"), vec!["total"]);
        assert_eq!(rust.declared_names("    report(total, count);"), Vec::<String>::new());
        assert_eq!(rust.declared_names("fn handle(input: &str) -> u32 {"), vec!["handle", "input"]);
    }

    #[test]
    fn a_comparison_is_not_a_declaration() {
        let rust = language("src/main.rs");
        assert_eq!(rust.declared_names("if total == expected {"), Vec::<String>::new());
    }

    #[test]
    fn java_declarations_are_found_through_the_binding() {
        let jvm = language("Api.java");
        assert_eq!(jvm.declared_names("var q = load();"), vec!["q"]);
        assert_eq!(jvm.declared_names("public class OrderService {"), vec!["OrderService"]);
    }

    #[test]
    fn type_parameters_are_not_bad_names() {
        let rust = language("src/main.rs");
        assert!(!rust.is_opaque("T"));
        assert!(!rust.is_opaque("K"));
        assert!(!rust.is_opaque("T1"));
        assert!(rust.is_opaque("q"));
        assert!(rust.is_opaque("vv"));
        assert!(!rust.is_opaque("i"));
        assert!(!rust.is_opaque("total"));
    }

    #[test]
    fn a_lowercase_language_still_counts_single_letters() {
        let python = language("run.py");
        assert!(python.is_opaque("T"));
    }

    #[test]
    fn generated_paths_are_recognised() {
        assert!(is_generated("apps/web/node_modules/left-pad/index.js"));
        assert!(is_generated("packages/vanguard/storybook-static/sb-manager/runtime.js"));
        assert!(is_generated("Cargo.lock"));
        assert!(!is_generated("src/model.rs"));
    }

    #[test]
    fn bundled_output_is_caught_by_line_length() {
        let bundle = vec!["x".repeat(900), "y".repeat(700), "z".repeat(1200)];
        assert!(looks_machine_written(&bundle));
        let written: Vec<String> = vec!["    let total = compute(input);".to_string(); 6];
        assert!(!looks_machine_written(&written));
    }

    #[test]
    fn words_exclude_bare_punctuation() {
        assert_eq!(word_count("the rate is 238 wpm --"), 5);
        assert_eq!(word_count("   "), 0);
    }
}
