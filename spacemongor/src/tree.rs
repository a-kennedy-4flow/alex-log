//! The tree the scanner fills in and the pruned snapshot the window draws.

use crate::cats::{self, Cat};
use std::cmp::Reverse;
use std::path::PathBuf;

/// Marks the node that has no parent.
const NO_PARENT: u32 = u32::MAX;

/// Boxes drawn at one level before the rest are lumped together.
const MAX_BOXES: usize = 160;

/// Smallest share of the outer box a box may hold before it is lumped together.
/// A smaller box would cover under a pixel on any usable window.
///
/// The share is measured against the outer box rather than against the parent.
/// Because a) area on screen follows the share of the outer box and nothing
/// else b) a share of the parent compounds with every level so the count grows
/// without limit as the nesting deepens and c) measured this way one level can
/// never hold more than `1 / MIN_SHARE` boxes whatever the nesting.
///
/// At this value the smallest box drawn covers about thirty pixels on a window
/// of the usual size. That is the smallest a pointer can land on. Ten levels of
/// nesting can therefore hold `10 / MIN_SHARE` boxes at the very worst. A real
/// disk sits far below that. `/usr` at ten levels holds five and a half
/// thousand.
const MIN_SHARE: f64 = 0.00005;

pub struct FileRec {
    pub name: Box<str>,
    pub size: u64,
    pub cat: Cat,
}

pub struct DirRec {
    pub name: Box<str>,
    pub parent: u32,
    /// Bytes held by this directory and everything below it.
    pub size: u64,
    pub subdirs: Vec<u32>,
    pub files: Vec<FileRec>,
}

/// Directories are held in one vector and referred to by index. Because a) an
/// index is four bytes against the sixteen a pointer pair would cost b) the
/// window can name a directory across a thread boundary without holding the
/// tree and c) walking to the parent never borrows twice.
pub struct Tree {
    pub dirs: Vec<DirRec>,
}

impl Tree {
    pub fn new(root_name: &str) -> Self {
        Tree {
            dirs: vec![DirRec {
                name: root_name.into(),
                parent: NO_PARENT,
                size: 0,
                subdirs: Vec::new(),
                files: Vec::new(),
            }],
        }
    }

    pub fn add_dir(&mut self, parent: u32, name: &str) -> u32 {
        let idx = self.dirs.len() as u32;
        self.dirs.push(DirRec {
            name: name.into(),
            parent,
            size: 0,
            subdirs: Vec::new(),
            files: Vec::new(),
        });
        self.dirs[parent as usize].subdirs.push(idx);
        idx
    }

    pub fn add_file(&mut self, dir: u32, name: &str, size: u64) {
        let cat = cats::of(name);
        self.dirs[dir as usize].files.push(FileRec {
            name: name.into(),
            size,
            cat,
        });
        self.charge(dir, size);
    }

    /// Adds `size` to the directory and to every directory above it.
    pub fn charge(&mut self, dir: u32, size: u64) {
        let mut at = dir;
        while at != NO_PARENT {
            let d = &mut self.dirs[at as usize];
            d.size += size;
            at = d.parent;
        }
    }

    pub fn parent_of(&self, dir: u32) -> Option<u32> {
        let p = self.dirs[dir as usize].parent;
        (p != NO_PARENT).then_some(p)
    }

    pub fn path_of(&self, dir: u32) -> PathBuf {
        let mut parts = Vec::new();
        let mut at = dir;
        while at != NO_PARENT {
            let d = &self.dirs[at as usize];
            parts.push(d.name.as_ref());
            at = d.parent;
        }
        parts.reverse();
        let mut p = PathBuf::from(parts[0]);
        for part in &parts[1..] {
            p.push(part);
        }
        p
    }

    /// Builds the snapshot drawn for `root`. Nesting stops after `depth` levels.
    pub fn view(&self, root: u32, depth: u8) -> ViewNode {
        let d = &self.dirs[root as usize];
        let cut = (d.size as f64 * MIN_SHARE) as u64;
        ViewNode {
            name: d.name.to_string(),
            size: d.size,
            cat: Cat::Folder,
            dir: Some(root),
            extra: 0,
            children: self.children(root, depth, cut),
        }
    }

    fn children(&self, dir: u32, depth: u8, cut: u64) -> Vec<ViewNode> {
        if depth == 0 {
            return Vec::new();
        }
        let d = &self.dirs[dir as usize];
        let mut items: Vec<(u64, Option<u32>, usize)> = Vec::new();
        for &sub in &d.subdirs {
            let s = self.dirs[sub as usize].size;
            if s > 0 {
                items.push((s, Some(sub), 0));
            }
        }
        for (i, f) in d.files.iter().enumerate() {
            if f.size > 0 {
                items.push((f.size, None, i));
            }
        }
        items.sort_unstable_by_key(|it| Reverse(it.0));

        let keep = items
            .iter()
            .take(MAX_BOXES)
            .take_while(|(s, ..)| *s >= cut)
            .count();

        let mut out: Vec<ViewNode> = Vec::with_capacity(keep + 1);
        for &(size, sub, fi) in &items[..keep] {
            out.push(match sub {
                Some(sub) => ViewNode {
                    name: self.dirs[sub as usize].name.to_string(),
                    size,
                    cat: Cat::Folder,
                    dir: Some(sub),
                    extra: 0,
                    children: self.children(sub, depth - 1, cut),
                },
                None => ViewNode {
                    name: d.files[fi].name.to_string(),
                    size,
                    cat: d.files[fi].cat,
                    dir: None,
                    extra: 0,
                    children: Vec::new(),
                },
            });
        }
        let rest = &items[keep..];
        if !rest.is_empty() {
            out.push(ViewNode {
                name: format!("{} smaller items", rest.len()),
                size: rest.iter().map(|(s, ..)| s).sum(),
                cat: Cat::Other,
                dir: None,
                extra: rest.len() as u32,
                children: Vec::new(),
            });
        }
        out
    }
}

/// One box on screen. Pruned so a snapshot stays small enough to hand to the
/// window many times a second.
pub struct ViewNode {
    pub name: String,
    pub size: u64,
    pub cat: Cat,
    /// Set when the box is a directory the viewer can open.
    pub dir: Option<u32>,
    /// Count of items lumped into this box. Zero for a real file.
    pub extra: u32,
    pub children: Vec<ViewNode>,
}

#[cfg(test)]
mod tests {
    use super::{MAX_BOXES, MIN_SHARE, Tree, ViewNode};
    use crate::cats::Cat;

    fn sample() -> Tree {
        let mut t = Tree::new("/disk");
        let docs = t.add_dir(0, "docs");
        let deep = t.add_dir(docs, "deep");
        t.add_file(0, "top.bin", 100);
        t.add_file(docs, "notes.md", 200);
        t.add_file(deep, "clip.mp4", 400);
        t
    }

    #[test]
    fn a_file_charges_every_directory_above_it() {
        let t = sample();
        assert_eq!(t.dirs[0].size, 700);
        assert_eq!(t.dirs[1].size, 600);
        assert_eq!(t.dirs[2].size, 400);
    }

    #[test]
    fn a_directory_knows_its_own_path() {
        let t = sample();
        assert_eq!(t.path_of(2).to_str().unwrap(), "/disk/docs/deep");
        assert_eq!(t.parent_of(2), Some(1));
        assert_eq!(t.parent_of(0), None);
    }

    #[test]
    fn nesting_stops_at_the_depth_limit() {
        let t = sample();
        let flat = t.view(0, 1);
        let docs = flat.children.iter().find(|c| c.name == "docs").unwrap();
        assert!(docs.children.is_empty());
        assert_eq!(docs.size, 600);
        assert_eq!(docs.cat, Cat::Folder);

        let deeper = t.view(0, 3);
        let docs = deeper.children.iter().find(|c| c.name == "docs").unwrap();
        assert_eq!(docs.children.len(), 2);
    }

    #[test]
    fn a_file_keeps_its_group_in_the_snapshot() {
        let t = sample();
        let clip = &t.view(2, 1).children[0];
        assert_eq!(clip.cat, Cat::Video);
        assert_eq!(clip.dir, None);
    }

    #[test]
    fn small_items_are_lumped_into_one_box() {
        let mut t = Tree::new("/disk");
        t.add_file(0, "huge.bin", 10_000_000);
        for i in 0..MAX_BOXES + 40 {
            t.add_file(0, &format!("tiny{i}.txt"), 8);
        }
        let v = t.view(0, 1);
        assert!(v.children.len() <= MAX_BOXES + 1);
        let lump = v.children.last().unwrap();
        assert!(lump.extra > 0, "expected a lumped box");
        assert_eq!(v.children.iter().map(|c| c.size).sum::<u64>(), v.size);
    }

    /// The threshold follows the outer box. A run of items that is large next to
    /// its own folder but tiny next to the whole view is still lumped.
    #[test]
    fn the_threshold_does_not_compound_with_the_nesting() {
        let mut t = Tree::new("/disk");
        t.add_file(0, "big.bin", 10_000_000);
        let mid = t.add_dir(0, "mid");
        for i in 0..10 {
            t.add_file(mid, &format!("part{i}.dat"), 100);
        }

        // The folder holds a thousandth of the view and clears the threshold.
        // Each part holds a ten thousandth and does not. Measured against the
        // folder instead every part would be a tenth of it and every one would
        // be drawn.
        let v = t.view(0, 3);
        let folder = v.children.iter().find(|c| c.name == "mid").unwrap();
        assert_eq!(folder.size, 1_000);
        assert_eq!(folder.children.len(), 1, "its parts do not clear it");
        assert_eq!(folder.children[0].extra, 10);
        assert_eq!(folder.children[0].size, 1_000);
    }

    /// Nesting ten deep must stay bounded. Under a threshold measured against
    /// the parent this count grew with every level.
    #[test]
    fn a_deep_view_holds_a_bounded_number_of_boxes() {
        fn count(n: &ViewNode) -> usize {
            1 + n.children.iter().map(count).sum::<usize>()
        }

        let mut t = Tree::new("/disk");
        let mut level = vec![0u32];
        for _ in 0..10 {
            let mut next = Vec::new();
            for parent in level {
                for i in 0..6 {
                    let d = t.add_dir(parent, &format!("d{i}"));
                    t.add_file(d, "leaf.bin", 1_000);
                    next.push(d);
                }
            }
            level = next;
            if level.len() > 2_000 {
                break;
            }
        }

        let nodes = count(&t.view(0, 10));
        assert!(
            nodes <= 10 * (1.0 / MIN_SHARE) as usize,
            "a ten deep view held {nodes} boxes"
        );
    }

    #[test]
    fn an_empty_item_is_never_drawn() {
        let mut t = Tree::new("/disk");
        t.add_file(0, "real.bin", 64);
        t.add_file(0, "empty.txt", 0);
        assert_eq!(t.view(0, 1).children.len(), 1);
    }
}
