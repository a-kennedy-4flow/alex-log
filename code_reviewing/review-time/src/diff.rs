//! Unified diff parsing.
//!
//! Only what affects reading effort is kept. That is the path and the content of both sides of the change.

#[derive(Debug, Default, Clone)]
pub struct FileChange {
    pub path: String,
    pub added: Vec<String>,
    pub removed: Vec<String>,
    pub binary: bool,
    pub new_file: bool,
}

pub fn parse(input: &str) -> Vec<FileChange> {
    let mut files: Vec<FileChange> = Vec::new();
    let mut current: Option<FileChange> = None;

    for line in input.lines() {
        if let Some(rest) = line.strip_prefix("diff --git ") {
            if let Some(done) = current.take() {
                files.push(done);
            }
            current = Some(FileChange {
                path: path_from_header(rest),
                ..FileChange::default()
            });
            continue;
        }

        let Some(file) = current.as_mut() else {
            continue;
        };

        if line.starts_with("Binary files") || line.starts_with("GIT binary patch") {
            file.binary = true;
        } else if line.starts_with("new file mode") {
            file.new_file = true;
        } else if let Some(path) = line.strip_prefix("+++ ") {
            if path != "/dev/null" {
                file.path = strip_side_marker(path);
            }
        } else if line.starts_with("--- ") || line.starts_with("@@") || line.starts_with("index ") {
            continue;
        } else if let Some(content) = line.strip_prefix('+') {
            file.added.push(content.to_string());
        } else if let Some(content) = line.strip_prefix('-') {
            file.removed.push(content.to_string());
        }
    }

    if let Some(done) = current.take() {
        files.push(done);
    }
    files
}

/// The b side of `a/path b/path` is the state under review.
fn path_from_header(rest: &str) -> String {
    match rest.rfind(" b/") {
        Some(at) => rest[at + 3..].to_string(),
        None => rest.to_string(),
    }
}

fn strip_side_marker(path: &str) -> String {
    let path = path.split('\t').next().unwrap_or(path);
    path.strip_prefix("b/").unwrap_or(path).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "diff --git a/src/main.rs b/src/main.rs\n\
index 83db48f..bf2695e 100644\n\
--- a/src/main.rs\n\
+++ b/src/main.rs\n\
@@ -1,4 +1,5 @@\n\
 fn main() {\n\
-    println!(\"old\");\n\
+    println!(\"new\");\n\
+    let total = 2;\n\
 }\n\
diff --git a/logo.png b/logo.png\n\
new file mode 100644\n\
Binary files /dev/null and b/logo.png differ\n";

    #[test]
    fn splits_files_and_counts_both_sides() {
        let files = parse(SAMPLE);
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].path, "src/main.rs");
        assert_eq!(files[0].added.len(), 2);
        assert_eq!(files[0].removed.len(), 1);
        assert!(!files[0].binary);
    }

    #[test]
    fn binary_and_new_files_are_marked() {
        let files = parse(SAMPLE);
        assert_eq!(files[1].path, "logo.png");
        assert!(files[1].binary);
        assert!(files[1].new_file);
    }

    #[test]
    fn headers_are_never_content() {
        let files = parse(SAMPLE);
        assert!(files[0].added.iter().all(|l| !l.starts_with("++")));
    }

    #[test]
    fn a_deletion_keeps_its_old_path() {
        let gone = "diff --git a/old.rs b/old.rs\ndeleted file mode 100644\n--- a/old.rs\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-fn gone() {}\n-\n";
        let files = parse(gone);
        assert_eq!(files[0].path, "old.rs");
        assert_eq!(files[0].removed.len(), 2);
        assert!(files[0].added.is_empty());
    }
}
