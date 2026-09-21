//! Builds the summary block.
//!
//! Every row is informational. Nothing here ever rejects a commit.

use crate::classify::{self, Bucket};
use crate::git;

/// Git's own name for the empty tree. Standing in for HEAD means the very first
/// commit reports its whole contents instead of nothing.
const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

#[derive(Default, Clone, Copy)]
pub struct Pair {
    pub added: u64,
    pub removed: u64,
}

impl Pair {
    fn size(&self) -> u64 {
        self.added + self.removed
    }
}

#[derive(Default)]
struct Tally {
    main: Pair,
    test: Pair,
    generated: Pair,
}

impl Tally {
    fn slot(&mut self, bucket: Bucket) -> &mut Pair {
        match bucket {
            Bucket::Main => &mut self.main,
            Bucket::Test => &mut self.test,
            Bucket::Generated => &mut self.generated,
        }
    }

    fn total(&self) -> Pair {
        Pair {
            added: self.main.added + self.test.added + self.generated.added,
            removed: self.main.removed + self.test.removed + self.generated.removed,
        }
    }
}

/// The whole block as comment lines. None means there is nothing staged worth
/// describing.
pub fn build() -> Option<String> {
    let base = git::output(&["rev-parse", "-q", "--verify", "HEAD"])
        .filter(|head| !head.is_empty())
        .unwrap_or_else(|| EMPTY_TREE.to_string());

    // An empty stage has nothing to say.
    if git::success(&["diff", "--cached", "--quiet", &base]) {
        return None;
    }

    let mut rows = vec!["Commit stats:".to_string(), files_row(&base)];
    rows.extend(line_rows(&base));
    rows.extend(char_rows(&base));
    rows.extend(branch_row());

    Some(rows.iter().map(|row| comment(row)).collect::<Vec<_>>().join("\n"))
}

/// The block lives inside git's own comment run so git strips it again when the
/// editor is saved.
fn comment(row: &str) -> String {
    if row.is_empty() { "#".to_string() } else { format!("# {row}") }
}

/// One indented count row. The width holds every label used here so the numbers
/// line up in a column.
fn row(label: &str, depth: usize, pair: Pair) -> String {
    let text = format!("{}{}", "  ".repeat(depth), label);
    format!("  {:<22}{:>7}   (+{} / -{})", text, pair.size(), pair.added, pair.removed)
}

fn files_row(base: &str) -> String {
    let status = git::raw(&["diff", "--cached", "--name-status", "-M", base]).unwrap_or_default();
    let mut counts = [0u64; 128];
    for line in status.lines() {
        // Only the letter matters. A rename arrives as R100 and a copy as C085.
        match line.as_bytes().first() {
            Some(&letter) if usize::from(letter) < counts.len() => counts[usize::from(letter)] += 1,
            _ => {}
        }
    }
    let count = |letter: char| counts[letter as usize];

    // Copies and type changes are rare enough to share one label.
    let other = count('C') + count('T');
    let total = count('A') + count('M') + count('D') + count('R') + other;
    let parts: Vec<String> = [
        (count('A'), "added"),
        (count('M'), "modified"),
        (count('D'), "deleted"),
        (count('R'), "renamed"),
        (other, "other"),
    ]
    .iter()
    .filter(|(n, _)| *n > 0)
    .map(|(n, label)| format!("{n} {label}"))
    .collect();

    format!("  {:<22}{:>7}   ({})", "files", total, parts.join(", "))
}

/// Line counts come from numstat which is authoritative.
fn line_rows(base: &str) -> Vec<String> {
    let numstat = git::raw(&["diff", "--cached", "--numstat", base]).unwrap_or_default();
    let mut tally = Tally::default();
    let mut binary = 0u64;

    for line in numstat.lines() {
        let mut fields = line.split('\t');
        let (Some(added), Some(removed), Some(path)) = (fields.next(), fields.next(), fields.next())
        else {
            continue;
        };
        // A binary file reports a dash for both counts.
        if added == "-" {
            binary += 1;
            continue;
        }
        let slot = tally.slot(classify::bucket(path));
        slot.added += added.parse::<u64>().unwrap_or(0);
        slot.removed += removed.parse::<u64>().unwrap_or(0);
    }

    let total = tally.total();
    let mut rows = vec![row("lines changed", 0, total)];

    // Worth a row only when reformatting is hiding inside the change.
    if let Some(substantive) = numstat_sum(&["-w", "--ignore-blank-lines", "--numstat", base]) {
        if substantive.added != total.added || substantive.removed != total.removed {
            rows.push(row("ignoring whitespace", 1, substantive));
        }
    }

    rows.push(row("test", 1, tally.test));
    rows.push(row("non-test", 1, tally.main));
    if tally.generated.size() > 0 {
        rows.push(row("generated", 1, tally.generated));
    }
    if binary > 0 {
        rows.push(format!("  {binary} binary file(s) excluded from line counts"));
    }
    rows
}

/// Character counts are read off the hunk bodies rather than the file contents.
/// The hunk headers say how many lines each hunk covers so a body line that
/// itself begins with "---" is never mistaken for a file header.
fn char_rows(base: &str) -> Vec<String> {
    let diff = git::raw(&[
        "diff",
        "--cached",
        "--unified=0",
        "--no-ext-diff",
        "--no-textconv",
        base,
    ])
    .unwrap_or_default();

    let mut tally = Tally::default();
    let mut bucket = Bucket::Main;
    let mut old_path = String::new();
    let mut remaining: u64 = 0;

    for line in diff.lines() {
        if remaining == 0 && let Some(path) = line.strip_prefix("--- ") {
            old_path = path.to_string();
            continue;
        }
        if remaining == 0 && let Some(path) = line.strip_prefix("+++ ") {
            // A deletion names no new path so the old one says what it was.
            bucket = classify::bucket(if path == "/dev/null" { &old_path } else { path });
            continue;
        }
        if line.starts_with("@@ ") {
            remaining = hunk_span(line);
            continue;
        }
        if remaining == 0 {
            continue;
        }
        let Some(marker) = line.chars().next() else {
            remaining -= 1;
            continue;
        };
        // The missing newline marker is commentary and covers no line of its own.
        if marker == '\\' {
            continue;
        }
        let size = (line.chars().count() - 1) as u64;
        match marker {
            '+' => tally.slot(bucket).added += size,
            '-' => tally.slot(bucket).removed += size,
            _ => {}
        }
        remaining -= 1;
    }

    let mut rows = vec![
        row("characters", 0, tally.total()),
        row("test", 1, tally.test),
        row("non-test", 1, tally.main),
    ];
    if tally.generated.size() > 0 {
        rows.push(row("generated", 1, tally.generated));
    }
    rows
}

/// `@@ -1,2 +3,4 @@` covers two lines of the old file and four of the new. A
/// range with no comma covers exactly one.
fn hunk_span(line: &str) -> u64 {
    let mut ranges = line.split_whitespace().skip(1);
    let old = ranges.next().unwrap_or("");
    let new = ranges.next().unwrap_or("");
    span_of(old) + span_of(new)
}

fn span_of(range: &str) -> u64 {
    match range.split_once(',') {
        Some((_, count)) => count.parse().unwrap_or(0),
        None => 1,
    }
}

/// Where this commit sits on the branch. Absent on a trunk and absent on a
/// branch that has not left the trunk yet.
fn branch_row() -> Option<String> {
    let branch = git::output(&["rev-parse", "--abbrev-ref", "HEAD"])?;
    let head = git::output(&["rev-parse", "-q", "--verify", "HEAD"]).unwrap_or_default();

    for trunk in ["main", "master", "origin/main", "origin/master"] {
        if !git::success(&["rev-parse", "-q", "--verify", trunk]) {
            continue;
        }
        let Some(fork) = git::output(&["merge-base", trunk, "HEAD"]) else {
            continue;
        };
        // Sitting on the fork point means there is no branch to describe. The
        // first trunk that exists is the only one considered either way.
        if fork == head {
            return None;
        }
        let behind = git::output(&["rev-list", "--count", &format!("{fork}..HEAD")])?
            .parse::<u64>()
            .ok()?;
        let against = numstat_sum(&["--numstat", &fork])?;
        return Some(format!(
            "  {:<22}commit {} on {}; vs {} +{} / -{}",
            "branch",
            behind + 1,
            branch,
            trunk,
            against.added,
            against.removed
        ));
    }
    None
}

/// Totals a numstat with no bucketing. The rows carrying a dash are binary and
/// have no line counts to add.
fn numstat_sum(extra: &[&str]) -> Option<Pair> {
    let mut args = vec!["diff", "--cached"];
    args.extend_from_slice(extra);
    let text = git::raw(&args)?;

    let mut pair = Pair::default();
    for line in text.lines() {
        let mut fields = line.split('\t');
        let (Some(added), Some(removed)) = (fields.next(), fields.next()) else {
            continue;
        };
        let (Ok(added), Ok(removed)) = (added.parse::<u64>(), removed.parse::<u64>()) else {
            continue;
        };
        pair.added += added;
        pair.removed += removed;
    }
    Some(pair)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hunk_spans() {
        assert_eq!(hunk_span("@@ -1,2 +3,4 @@"), 6);
        assert_eq!(hunk_span("@@ -1 +1 @@"), 2);
        assert_eq!(hunk_span("@@ -0,0 +1,5 @@"), 5);
        // Trailing function context is ignored.
        assert_eq!(hunk_span("@@ -10,3 +10,3 @@ fn main() {"), 6);
    }

    #[test]
    fn rows_line_up() {
        let pair = Pair { added: 9, removed: 0 };
        assert_eq!(row("test", 1, pair), "    test                      9   (+9 / -0)");
        assert_eq!(row("lines changed", 0, pair), "  lines changed               9   (+9 / -0)");
    }
}
