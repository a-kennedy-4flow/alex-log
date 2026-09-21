//! Sorts a path into one of three buckets so the summary can hold real work
//! apart from tests and from machine written files.
//!
//! The patterns are broad rather than tuned to any one language. Because the
//! split only has to be roughly right to be worth reading a) a wrong guess
//! costs nothing b) every repo gets the same answer with no configuration and
//! c) there is nothing here to keep in step with a repo that moves on.

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Bucket {
    Main,
    Test,
    Generated,
}

/// Generated wins over test. A generated test file is still noise.
pub fn bucket(path: &str) -> Bucket {
    if is_generated(path) {
        Bucket::Generated
    } else if is_test(path) {
        Bucket::Test
    } else {
        Bucket::Main
    }
}

/// The last component. Only the directory rules look any wider than this.
fn base(path: &str) -> &str {
    match path.rfind('/') {
        Some(cut) => &path[cut + 1..],
        None => path,
    }
}

/// True when some component other than the last equals `name`. Being followed
/// by a slash is what makes a component a directory.
fn has_dir(path: &str, name: &str) -> bool {
    let mut parts: Vec<&str> = path.split('/').collect();
    parts.pop();
    parts.contains(&name)
}

fn is_generated(path: &str) -> bool {
    if ["generated", "__generated__", "gen"].iter().any(|dir| has_dir(path, dir)) {
        return true;
    }
    let name = base(path);
    for tail in [".pb.go", "_pb2.py", ".g.dart", ".g.ts"] {
        if name.ends_with(tail) {
            return true;
        }
    }
    // The word has to sit in front of a lowercase extension. Only the final dot
    // can carry that extension because a run of lowercase letters holds no dot.
    let Some(dot) = name.rfind('.') else {
        return false;
    };
    let (stem, ext) = (&name[..dot], &name[dot + 1..]);
    !ext.is_empty()
        && ext.bytes().all(|byte| byte.is_ascii_lowercase())
        && (stem.contains("Generated") || stem.contains("generated"))
}

fn is_test(path: &str) -> bool {
    if ["test", "tests", "__tests__", "spec", "e2e"].iter().any(|dir| has_dir(path, dir)) {
        return true;
    }
    let name = base(path);
    for word in ["spec", "test"] {
        for ext in ["js", "jsx", "ts", "tsx"] {
            if name.ends_with(&format!(".{word}.{ext}")) {
                return true;
            }
        }
    }
    for tail in ["Test.java", "Tests.java", "IT.java", "_test.go", "_spec.rb"] {
        if name.ends_with(tail) {
            return true;
        }
    }
    // A python test needs at least one character between the prefix and the
    // extension so a bare "test_.py" is not one.
    name.starts_with("test_") && name.ends_with(".py") && name.len() > "test_.py".len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn directories_win_wherever_they_sit() {
        assert_eq!(bucket("test/a.rs"), Bucket::Test);
        assert_eq!(bucket("b/deep/tests/a.rs"), Bucket::Test);
        assert_eq!(bucket("generated/a.rs"), Bucket::Generated);
        assert_eq!(bucket("src/gen/a.rs"), Bucket::Generated);
        // Named as a file rather than a directory it is ordinary work.
        assert_eq!(bucket("src/test.rs"), Bucket::Main);
    }

    #[test]
    fn filename_rules() {
        assert_eq!(bucket("src/thing.spec.ts"), Bucket::Test);
        assert_eq!(bucket("src/FooTest.java"), Bucket::Test);
        assert_eq!(bucket("src/FooIT.java"), Bucket::Test);
        assert_eq!(bucket("pkg/bar_test.go"), Bucket::Test);
        assert_eq!(bucket("pkg/test_baz.py"), Bucket::Test);
        assert_eq!(bucket("lib/qux_spec.rb"), Bucket::Test);
        assert_eq!(bucket("pkg/svc.pb.go"), Bucket::Generated);
        assert_eq!(bucket("pkg/msg_pb2.py"), Bucket::Generated);
        assert_eq!(bucket("lib/model.g.dart"), Bucket::Generated);
        assert_eq!(bucket("lib/fooGenerated.ts"), Bucket::Generated);
        assert_eq!(bucket("src/app.rs"), Bucket::Main);
    }

    #[test]
    fn near_misses_stay_ordinary() {
        assert_eq!(bucket("pkg/test_.py"), Bucket::Main);
        assert_eq!(bucket("src/Generated"), Bucket::Main);
        assert_eq!(bucket("src/fooGenerated.TS"), Bucket::Main);
        assert_eq!(bucket("src/notes.spec.md"), Bucket::Main);
    }

    #[test]
    fn a_diff_prefix_changes_nothing() {
        assert_eq!(bucket("b/test/a.rs"), Bucket::Test);
        assert_eq!(bucket("a/pkg/svc.pb.go"), Bucket::Generated);
        assert_eq!(bucket("b/test_x.py"), Bucket::Test);
    }
}
