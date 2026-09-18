//! The background walk. Nothing here ever writes to the filesystem.

use crate::tree::{Tree, ViewNode};
use eframe::egui;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Directories the walk names when it cannot open them.
const DENIED_NAMED: usize = 500;

/// How often the walk hands a fresh snapshot to the window.
const TICK: Duration = Duration::from_millis(120);

/// Which directory the window wants drawn and how deep to nest it.
#[derive(Copy, Clone)]
pub struct Want {
    pub root: u32,
    pub depth: u8,
}

/// A snapshot the window can draw without touching the tree.
pub struct Snapshot {
    pub root: Arc<ViewNode>,
    pub parent: Option<u32>,
    pub path: PathBuf,
}

/// Everything the window and the walk share.
pub struct Shared {
    pub cancel: AtomicBool,
    pub done: AtomicBool,
    /// Set by the window when `want` changed so the next snapshot comes at once.
    pub redraw: AtomicBool,
    pub files: AtomicU64,
    pub dirs: AtomicU64,
    pub bytes: AtomicU64,
    /// Directories the walk could not open. Their contents are missing from the
    /// figures.
    pub denied: AtomicU64,
    /// The first of those directories with what the host said about each.
    /// Capped because a broken tree can hold a great many and the point is to
    /// name a few to go and look at.
    pub denied_paths: Mutex<Vec<(PathBuf, String)>>,
    pub current: Mutex<String>,
    pub want: Mutex<Want>,
    pub view: Mutex<Option<Arc<Snapshot>>>,
}

impl Shared {
    fn new(depth: u8) -> Self {
        Shared {
            cancel: AtomicBool::new(false),
            done: AtomicBool::new(false),
            redraw: AtomicBool::new(false),
            files: AtomicU64::new(0),
            dirs: AtomicU64::new(0),
            bytes: AtomicU64::new(0),
            denied: AtomicU64::new(0),
            denied_paths: Mutex::new(Vec::new()),
            current: Mutex::new(String::new()),
            want: Mutex::new(Want { root: 0, depth }),
            view: Mutex::new(None),
        }
    }

    pub fn snapshot(&self) -> Option<Arc<Snapshot>> {
        self.view.lock().unwrap().clone()
    }

    pub fn ask(&self, want: Want) {
        *self.want.lock().unwrap() = want;
        self.redraw.store(true, Relaxed);
    }

    pub fn stop(&self) {
        self.cancel.store(true, Relaxed);
    }
}

/// Starts the walk of `root` on its own thread and returns the shared state.
///
/// The thread stays alive after the walk ends. Because a) opening a directory
/// rebuilds the snapshot from the tree b) the tree never leaves the thread that
/// owns it and c) a dropped thread would take the tree with it.
pub fn start(root: PathBuf, depth: u8, ctx: egui::Context) -> Arc<Shared> {
    let shared = Arc::new(Shared::new(depth));
    let sh = Arc::clone(&shared);
    std::thread::spawn(move || walk(root, sh, ctx));
    shared
}

fn walk(root: PathBuf, sh: Arc<Shared>, ctx: egui::Context) {
    let Ok(md) = std::fs::metadata(&root) else {
        sh.done.store(true, Relaxed);
        ctx.request_repaint();
        return;
    };
    let device = crate::sys::volume_id(&md);

    let mut tree = Tree::new(&root.to_string_lossy());
    let mut hard: HashSet<(u64, u64)> = HashSet::new();
    let mut stack: Vec<(u32, PathBuf)> = vec![(0, root)];
    let mut tick = Instant::now();

    while let Some((idx, path)) = stack.pop() {
        if sh.cancel.load(Relaxed) {
            return;
        }
        match std::fs::read_dir(&path) {
            Err(why) => {
                sh.denied.fetch_add(1, Relaxed);
                let mut named = sh.denied_paths.lock().unwrap();
                if named.len() < DENIED_NAMED {
                    named.push((path.clone(), plainly(&why)));
                }
            }
            Ok(entries) => {
                for entry in entries.flatten() {
                    let Ok(md) = entry.metadata() else {
                        sh.denied.fetch_add(1, Relaxed);
                        continue;
                    };
                    let name = entry.file_name().to_string_lossy().into_owned();
                    let size = crate::sys::used_bytes(&md);
                    // A symlink reports `is_dir` false here so the walk never
                    // follows it. That is what keeps a loop from hanging.
                    if md.is_dir() {
                        if crate::sys::volume_id(&md) != device {
                            continue;
                        }
                        let child = tree.add_dir(idx, &name);
                        tree.charge(child, size);
                        stack.push((child, path.join(&name)));
                        sh.dirs.fetch_add(1, Relaxed);
                    } else {
                        if let Some(key) = crate::sys::hard_link_key(&md)
                            && !hard.insert(key)
                        {
                            continue;
                        }
                        tree.add_file(idx, &name, size);
                        sh.files.fetch_add(1, Relaxed);
                    }
                    sh.bytes.fetch_add(size, Relaxed);
                }
            }
        }
        if tick.elapsed() >= TICK || sh.redraw.swap(false, Relaxed) {
            *sh.current.lock().unwrap() = path.display().to_string();
            publish(&tree, &sh, &ctx);
            tick = Instant::now();
        }
    }

    sh.current.lock().unwrap().clear();
    sh.done.store(true, Relaxed);
    publish(&tree, &sh, &ctx);

    while !sh.cancel.load(Relaxed) {
        if sh.redraw.swap(false, Relaxed) {
            publish(&tree, &sh, &ctx);
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

/// What the host said, in words rather than a number.
///
/// The reason a folder cannot be opened is the whole of what the reader needs.
/// A count of folders with no reason beside it only raises the question again.
pub fn plainly(why: &std::io::Error) -> String {
    use std::io::ErrorKind;
    match why.kind() {
        ErrorKind::PermissionDenied => "the host refused",
        ErrorKind::NotFound => "it is no longer there",
        ErrorKind::InvalidInput | ErrorKind::InvalidData => "the name cannot be used on this host",
        _ => match why.raw_os_error() {
            // Windows says this when a handle is held with no sharing.
            Some(32) => "another program is holding it",
            Some(code) => return format!("the host said {code}"),
            None => "the host gave no reason",
        },
    }
    .to_string()
}

fn publish(tree: &Tree, sh: &Shared, ctx: &egui::Context) {
    let want = *sh.want.lock().unwrap();
    let root = if (want.root as usize) < tree.dirs.len() {
        want.root
    } else {
        0
    };
    let snap = Snapshot {
        root: Arc::new(tree.view(root, want.depth)),
        parent: tree.parent_of(root),
        path: tree.path_of(root),
    };
    *sh.view.lock().unwrap() = Some(Arc::new(snap));
    ctx.request_repaint();
}

#[cfg(test)]
mod tests {
    use super::plainly;

    #[test]
    fn the_host_is_quoted_in_words() {
        use std::io::{Error, ErrorKind};
        assert_eq!(
            plainly(&Error::new(ErrorKind::PermissionDenied, "x")),
            "the host refused"
        );
        assert_eq!(
            plainly(&Error::new(ErrorKind::NotFound, "x")),
            "it is no longer there"
        );
        // Windows says thirty two when a handle is held with no sharing.
        assert_eq!(
            plainly(&Error::from_raw_os_error(32)),
            "another program is holding it"
        );
        // Anything else still says something rather than nothing.
        assert!(plainly(&Error::from_raw_os_error(1_234)).contains("1234"));
    }

    use super::start;
    use eframe::egui;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::Ordering::Relaxed;
    use std::time::{Duration, Instant};

    /// Builds a tree holding a pair of hard links. On Linux it also holds a
    /// symlink loop. Windows refuses to create one without extra privilege.
    fn fixture(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("spacemongor-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("docs/deep")).unwrap();
        fs::write(root.join("docs/notes.md"), vec![b'x'; 4096]).unwrap();
        fs::write(root.join("docs/deep/clip.mp4"), vec![b'y'; 8192]).unwrap();
        fs::write(root.join("twin-a.bin"), vec![b'z'; 4096]).unwrap();
        fs::hard_link(root.join("twin-a.bin"), root.join("twin-b.bin")).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            symlink("..", root.join("docs/up")).unwrap();
            symlink(&root, root.join("docs/deep/back")).unwrap();
            symlink("nowhere", root.join("dangling")).unwrap();
        }
        root
    }

    fn finish(root: &std::path::Path) -> std::sync::Arc<super::Shared> {
        let sh = start(root.to_path_buf(), 4, egui::Context::default());
        let deadline = Instant::now() + Duration::from_secs(20);
        while !sh.done.load(Relaxed) {
            assert!(Instant::now() < deadline, "the walk never finished");
            std::thread::sleep(Duration::from_millis(10));
        }
        sh
    }

    #[test]
    #[cfg(unix)]
    fn a_symlink_loop_does_not_trap_the_walk() {
        let root = fixture("loop");
        let sh = finish(&root);
        assert_eq!(sh.dirs.load(Relaxed), 2, "only docs and deep are real");
        sh.stop();
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn a_hard_linked_file_is_counted_once() {
        let root = fixture("hard");
        let sh = finish(&root);
        let snap = sh.snapshot().expect("a snapshot after the walk");
        let twins: Vec<_> = snap
            .root
            .children
            .iter()
            .filter(|c| c.name.starts_with("twin-"))
            .collect();
        assert_eq!(twins.len(), 1, "both links were counted");
        sh.stop();
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn the_snapshot_holds_the_whole_tree() {
        let root = fixture("tree");
        let sh = finish(&root);
        let snap = sh.snapshot().unwrap();
        assert!(snap.parent.is_none(), "the walk root has no parent");
        let docs = snap
            .root
            .children
            .iter()
            .find(|c| c.name == "docs")
            .expect("docs is missing");
        let deep = docs.children.iter().find(|c| c.name == "deep").unwrap();
        assert!(deep.children.iter().any(|c| c.name == "clip.mp4"));
        assert!(snap.root.size >= 16384, "sizes did not roll up");
        assert_eq!(sh.denied.load(Relaxed), 0);
        sh.stop();
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn opening_a_directory_republishes_from_the_same_tree() {
        let root = fixture("open");
        let sh = finish(&root);
        let docs = sh
            .snapshot()
            .unwrap()
            .root
            .children
            .iter()
            .find(|c| c.name == "docs")
            .and_then(|c| c.dir)
            .expect("docs should be enterable");
        sh.ask(super::Want {
            root: docs,
            depth: 2,
        });
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let snap = sh.snapshot().unwrap();
            if snap.root.name == "docs" {
                assert_eq!(snap.parent, Some(0));
                assert!(snap.path.ends_with("docs"));
                break;
            }
            assert!(Instant::now() < deadline, "the snapshot never changed");
            std::thread::sleep(Duration::from_millis(10));
        }
        sh.stop();
        fs::remove_dir_all(&root).unwrap();
    }
}
