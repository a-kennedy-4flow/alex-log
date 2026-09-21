//! A global `prepare-commit-msg` hook. Prefills the commit message with a
//! summary of what is staged.
//!
//! The summary goes in as comment lines so that git's own cleanup strips it
//! again when the editor is saved. Nothing here can reject a commit. Every
//! failure path leaves the message alone and exits zero.
//!
//! Replaces the shell and awk version that used to live in
//! `~/.config/git/hooks`. See readme.md for what changed and why.

mod classify;
mod git;
mod message;
mod stats;

use std::os::unix::fs::MetadataExt;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(msg_file) = args.first().cloned() else {
        return;
    };
    let source = args.get(1).cloned().unwrap_or_default();

    // A repo shipping its own hook of this name wins outright. Running both
    // would print the summary twice.
    if let Some(hook) = repo_hook() {
        hand_over(&hook, &args);
    }

    if !will_be_stripped(&source) {
        return;
    }

    let Some(stats) = stats::build() else {
        return;
    };
    let Ok(original) = std::fs::read_to_string(&msg_file) else {
        return;
    };
    let updated = message::insert(&original, &stats, subject_seed().as_deref());
    let _ = std::fs::write(&msg_file, updated);
}

/// Only prefill where git is certain to strip the comments again. Anywhere else
/// the summary lands in the commit for real.
///
/// Because the comments only go when the message is edited a) an empty source
/// and a template both guarantee an editor b) `-m` and `-F` and a merge and an
/// `--amend --no-edit` can all reach the commit with no editor at all and c) a
/// cleanup mode of verbatim or whitespace keeps the comments even when there is
/// an editor. An editor that exits without touching the file still counts as
/// edited so `GIT_EDITOR=:` is safe.
fn will_be_stripped(source: &str) -> bool {
    if !matches!(source, "" | "template") {
        return false;
    }
    let cleanup = git::output(&["config", "commit.cleanup"]).unwrap_or_default();
    !matches!(cleanup.as_str(), "verbatim" | "whitespace")
}

/// The repo's own hook of this name if it has one and can run.
fn repo_hook() -> Option<PathBuf> {
    let common = git::output(&["rev-parse", "--git-common-dir"])?;
    let mut dir = PathBuf::from(common);
    if dir.is_relative() {
        dir = std::env::current_dir().ok()?.join(dir);
    }
    let hook = dir.join("hooks").join("prepare-commit-msg");
    if !is_runnable(&hook) {
        return None;
    }
    // Never hand over to ourselves. A hook that can re-enter itself is the one
    // mistake in here that could take a machine down.
    if is_same_file(&hook, &std::env::current_exe().ok()?) {
        return None;
    }
    Some(hook)
}

/// Replaces this process so the repo's hook owns the exit status.
fn hand_over(hook: &Path, args: &[String]) -> ! {
    let failure = Command::new(hook).args(args).exec();
    // exec only returns when it could not run. Say so and let the commit
    // through rather than blocking it over a broken hook.
    eprintln!("prepare-commit-msg: cannot run {}: {failure}", hook.display());
    std::process::exit(0);
}

fn is_runnable(path: &Path) -> bool {
    std::fs::metadata(path)
        .map(|meta| meta.is_file() && meta.mode() & 0o111 != 0)
        .unwrap_or(false)
}

fn is_same_file(left: &Path, right: &Path) -> bool {
    match (std::fs::metadata(left), std::fs::metadata(right)) {
        (Ok(l), Ok(r)) => l.dev() == r.dev() && l.ino() == r.ino(),
        _ => false,
    }
}

/// Seeds the subject from the branch where the branch carries a ticket. Written
/// for repos whose subjects read "PLRS-123 ..." or "NO-TICKET ...". A branch
/// matching neither shape leaves the subject alone.
fn subject_seed() -> Option<String> {
    let branch = git::output(&["rev-parse", "--abbrev-ref", "HEAD"])?;
    ticket(&branch).map(|found| format!("{found} "))
}

fn ticket(branch: &str) -> Option<&str> {
    if branch.starts_with("NO-TICKET") {
        return Some("NO-TICKET");
    }
    let bytes = branch.as_bytes();
    if bytes.first().is_none_or(|first| !first.is_ascii_uppercase()) {
        return None;
    }
    // A project key runs on in capitals and digits then a hyphen then the
    // number. The hyphen is what ends the key.
    let mut cut = 1;
    while cut < bytes.len() && (bytes[cut].is_ascii_uppercase() || bytes[cut].is_ascii_digit()) {
        cut += 1;
    }
    if bytes.get(cut) != Some(&b'-') {
        return None;
    }
    let digits = cut + 1;
    let mut end = digits;
    while end < bytes.len() && bytes[end].is_ascii_digit() {
        end += 1;
    }
    if end == digits {
        return None;
    }
    Some(&branch[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tickets_are_read_off_the_branch() {
        assert_eq!(ticket("PLRS-1234-my-feature"), Some("PLRS-1234"));
        assert_eq!(ticket("NO-TICKET--user-auth"), Some("NO-TICKET"));
        assert_eq!(ticket("A-1"), Some("A-1"));
        assert_eq!(ticket("RDNC-661-radiance-e2e"), Some("RDNC-661"));
        assert_eq!(ticket("NOTICKET-5"), Some("NOTICKET-5"));
    }

    #[test]
    fn anything_else_leaves_the_subject_alone() {
        assert_eq!(ticket("main"), None);
        assert_eq!(ticket("feature/thing"), None);
        assert_eq!(ticket("PLRS-"), None);
        assert_eq!(ticket("ABC12-x-34"), None);
        assert_eq!(ticket(""), None);
    }

    #[test]
    fn only_a_stripping_commit_gets_a_summary() {
        // The source alone decides. The cleanup mode is read from the repo so
        // it is not covered here.
        assert!(!will_be_stripped("message"));
        assert!(!will_be_stripped("merge"));
        assert!(!will_be_stripped("commit"));
    }
}
