//! Puts the summary into the message file.

/// Inserts the block above git's own comment run so it reads without scrolling
/// past the file list. A message carrying no comments gets the block appended
/// instead.
///
/// The subject is only ever written over a blank first line. A template that
/// brought its own subject keeps it.
pub fn insert(original: &str, stats: &str, subject: Option<&str>) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut inserted = false;

    for (position, line) in original.lines().enumerate() {
        if position == 0
            && let Some(seed) = subject
            && line.chars().all(|c| c == ' ' || c == '\t')
        {
            out.push(seed.to_string());
            out.push(String::new());
            continue;
        }
        if !inserted && line.starts_with('#') {
            out.push(stats.to_string());
            out.push("#".to_string());
            inserted = true;
        }
        out.push(line.to_string());
    }

    if !inserted {
        out.push(String::new());
        out.push(stats.to_string());
        out.push("#".to_string());
    }

    let mut text = out.join("\n");
    text.push('\n');
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn block_lands_above_the_comments() {
        let original = "\n# Please enter\n";
        let got = insert(original, "# Commit stats:", None);
        assert_eq!(got, "\n# Commit stats:\n#\n# Please enter\n");
    }

    #[test]
    fn subject_replaces_a_blank_first_line() {
        let got = insert("\n# Please enter\n", "# S", Some("PLRS-1 "));
        assert_eq!(got, "PLRS-1 \n\n# S\n#\n# Please enter\n");
    }

    #[test]
    fn a_written_subject_survives() {
        let got = insert("already said\n# Please enter\n", "# S", Some("PLRS-1 "));
        assert_eq!(got, "already said\n# S\n#\n# Please enter\n");
    }

    #[test]
    fn a_message_with_no_comments_gets_it_appended() {
        let got = insert("just this\n", "# S", None);
        assert_eq!(got, "just this\n\n# S\n#\n");
    }

    #[test]
    fn a_tab_only_first_line_still_counts_as_blank() {
        let got = insert("\t\n# c\n", "# S", Some("X-1 "));
        assert_eq!(got, "X-1 \n\n# S\n#\n# c\n");
    }
}
