//! Every fact in the summary comes from asking git.
//!
//! Nothing in here is allowed to fail a commit. A call that does not work hands
//! back None and the caller drops that part of the summary.

use std::process::{Command, Stdio};

/// Runs git and hands back stdout with trailing newlines removed. None means
/// git could not run or answered non-zero.
pub fn output(args: &[&str]) -> Option<String> {
    let mut text = raw(args)?;
    while text.ends_with('\n') || text.ends_with('\r') {
        text.pop();
    }
    Some(text)
}

/// Stdout exactly as git wrote it. Diff walking needs the lines untouched.
///
/// Invalid UTF-8 is replaced rather than rejected. A diff that cannot be
/// decoded should still produce a summary.
pub fn raw(args: &[&str]) -> Option<String> {
    let out = Command::new("git").args(args).stderr(Stdio::null()).output().ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// True when git answers zero. For the questions that reply with an exit status
/// instead of any output.
pub fn success(args: &[&str]) -> bool {
    Command::new("git")
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}
