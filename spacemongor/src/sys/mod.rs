//! Everything that differs between operating systems.
//!
//! The rest of the program calls only what is declared here.

use std::fs::Metadata;
use std::path::{Path, PathBuf};

#[cfg(unix)]
mod unix;
#[cfg(unix)]
use unix as host;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
use windows as host;

/// A filesystem offered in the picker.
pub struct Volume {
    /// The device on Linux. The drive label on Windows.
    pub source: String,
    /// Where the walk starts.
    pub path: PathBuf,
    /// The filesystem format such as `ext4` or `NTFS`.
    pub kind: String,
    pub total: u64,
    /// Bytes already occupied. The walk aims to account for this figure.
    pub used: u64,
}

impl Volume {
    pub fn label(&self) -> String {
        if self.source.is_empty() {
            format!("{}  ({})", self.path.display(), self.kind)
        } else {
            format!(
                "{}  ({} on {})",
                self.path.display(),
                self.source,
                self.kind
            )
        }
    }
}

/// Every filesystem holding real data.
pub fn volumes() -> Vec<Volume> {
    host::volumes()
}

/// Names the filesystem an entry sits on. The walk refuses to leave the one it
/// started on. Windows reports zero for everything because a volume mounted in
/// a folder is a reparse point and the symlink guard already turns it away.
pub fn volume_id(md: &Metadata) -> u64 {
    host::volume_id(md)
}

/// Bytes the entry occupies.
pub fn used_bytes(md: &Metadata) -> u64 {
    host::used_bytes(md)
}

/// Names the file behind the name. `None` when the file carries one name only
/// so the walk can count it without asking twice.
pub fn hard_link_key(md: &Metadata) -> Option<(u64, u64)> {
    host::hard_link_key(md)
}

/// Shows the entry in the file manager of the host with the entry selected.
/// The folder that opens is the one holding it. Runs on its own thread because
/// the file manager can take a moment to answer.
pub fn reveal(path: &Path) {
    let path = path.to_path_buf();
    std::thread::spawn(move || host::reveal(&path));
}

/// Opens the folder itself rather than the folder holding it.
pub fn open_folder(path: &Path) {
    let path = path.to_path_buf();
    std::thread::spawn(move || host::open_folder(&path));
}

/// Bytes a filesystem hands out at a time. `None` where the walk already counts
/// blocks occupied and so has no rounding to explain.
pub fn cluster_size(path: &Path) -> Option<u64> {
    host::cluster_size(path)
}

/// How the drive behind a path behaves when it is read.
#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub enum Drive {
    /// A head has to move to reach each file. Seeking costs more than reading.
    Spinning,
    /// No head. Many reads at once are served better than one at a time.
    Solid,
    /// The machine would not say.
    Unknown,
}

impl Drive {
    pub fn label(self) -> &'static str {
        match self {
            Drive::Spinning => "spinning disk",
            Drive::Solid => "solid state",
            Drive::Unknown => "drive of unknown type",
        }
    }

    /// Threads to read with.
    ///
    /// One for a spinning disk. Because a) a second reader pulls the head away
    /// from the first b) a seek costs more than the transfer it interrupts and
    /// c) the kernel can only reorder what it already holds.
    pub fn readers(self) -> usize {
        // An override so the count can be swept when measuring and pinned by
        // anyone whose drive does not behave like its kind suggests.
        if let Ok(set) = std::env::var("SPACEMONGOR_READERS")
            && let Ok(n) = set.parse::<usize>()
            && n > 0
        {
            return n;
        }
        let cpus = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(1);
        match self {
            Drive::Spinning => 1,
            // Reading waits on the drive rather than the processor so more
            // threads than cores still pays. Measured on one NVMe the opening
            // block phase took 9.6 s at one reader and 2.5 s at sixteen. Past
            // sixteen each doubling bought under a tenth.
            Drive::Solid => (cpus * 2).clamp(4, 16),
            Drive::Unknown => cpus.min(4),
        }
    }

    /// Bytes to take from each side at a time when two files are compared.
    ///
    /// A spinning disk reads two files by moving the head between them. Taking
    /// a large piece of each makes that happen far less often.
    pub fn compare_chunk(self) -> usize {
        match self {
            Drive::Spinning => 8 * 1024 * 1024,
            _ => 64 * 1024,
        }
    }

    /// True when reading files in the order the filesystem laid them down is
    /// worth the sort.
    pub fn wants_layout_order(self) -> bool {
        self == Drive::Spinning
    }
}

/// What kind of drive holds `path`.
pub fn drive(path: &Path) -> Drive {
    host::drive(path)
}

/// The first folder at or above `path` that is really there.
///
/// A path can name something that has gone, or something not made yet. Walking
/// up gives the nearest place that can actually answer a question.
pub fn first_real(path: &Path) -> Option<PathBuf> {
    let mut at = path.to_path_buf();
    loop {
        if at.is_dir() {
            return Some(at);
        }
        let up = at.parent()?.to_path_buf();
        if up == at {
            return None;
        }
        at = up;
    }
}

/// Sends an entry to the recycle bin of the host.
///
/// Never an outright delete. Because a) this is the only part of the program
/// that takes anything away and b) a person who picks the wrong row must be
/// able to put it back.
///
/// Returns where it went, or what went wrong.
pub fn trash(path: &Path) -> Result<PathBuf, String> {
    host::trash(path)
}

/// One entry sitting in the recycle bin.
pub struct Gone {
    /// Where it was before it went.
    pub was: PathBuf,
    /// Where it sits now.
    pub now: PathBuf,
    pub size: u64,
    /// When it went, as the host recorded it.
    pub when: String,
}

/// Everything the recycle bin for `path` is holding.
///
/// Read from the records the host itself wrote. Nothing is moved and nothing is
/// brought back.
pub fn recycled(path: &Path) -> Vec<Gone> {
    host::recycled(path)
}

/// Reads one Windows `$I` record.
///
/// The first eight bytes say which shape it is. Version one holds the path in a
/// fixed field of 260 characters. Version two says how long the path is first.
///
/// Kept here rather than beside the rest of the Windows work so it can be tried
/// without a Windows machine. It is only bytes.
#[cfg_attr(not(windows), allow(dead_code, reason = "only Windows writes these"))]
pub fn read_record(raw: &[u8]) -> Option<Gone> {
    if raw.len() < 24 {
        return None;
    }
    let version = u64::from_le_bytes(raw[0..8].try_into().ok()?);
    let size = u64::from_le_bytes(raw[8..16].try_into().ok()?);
    let filetime = u64::from_le_bytes(raw[16..24].try_into().ok()?);

    let (from, chars) = match version {
        1 => (24usize, 260usize),
        2 => {
            if raw.len() < 28 {
                return None;
            }
            let len = u32::from_le_bytes(raw[24..28].try_into().ok()?) as usize;
            (28usize, len)
        }
        _ => return None,
    };
    let end = from.checked_add(chars.checked_mul(2)?)?;
    if end > raw.len() {
        return None;
    }
    let wide: Vec<u16> = raw[from..end]
        .chunks_exact(2)
        .map(|b| u16::from_le_bytes([b[0], b[1]]))
        .take_while(|c| *c != 0)
        .collect();

    Some(Gone {
        was: PathBuf::from(String::from_utf16_lossy(&wide)),
        now: PathBuf::new(),
        size,
        // Windows counts hundreds of nanoseconds from 1601. The rest of the
        // program counts seconds from 1970.
        when: when_of((filetime / 10_000_000) as i64 - 11_644_473_600),
    })
}

/// Seconds since 1970 written the way a person reads them.
#[cfg_attr(
    not(windows),
    allow(dead_code, reason = "only Windows counts this way")
)]
pub fn when_of(secs: i64) -> String {
    let days = secs.div_euclid(86_400);
    let rest = secs.rem_euclid(86_400);
    let (y, m, d) = civil(days);
    format!(
        "{y:04}-{m:02}-{d:02} {:02}:{:02}",
        rest / 3600,
        (rest % 3600) / 60
    )
}

/// Days since 1970 turned into a date. The usual civil calendar arithmetic.
pub fn civil(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Where an entry from `path` would go if it were sent to the recycle bin.
/// Asked without sending anything.
pub fn bin_for(path: &Path) -> Option<PathBuf> {
    host::bin_for(path)
}

/// Bytes free where `path` sits. What a copy has to fit into.
pub fn free_space(path: &Path) -> Option<u64> {
    host::free_space(path)
}

/// Milliseconds the drive behind `path` has had work in flight since it came
/// up. Two readings a moment apart say how busy it is. `None` where the host
/// does not publish it.
pub fn io_busy(path: &Path) -> Option<u64> {
    host::io_busy(path)
}

/// The number the filesystem knows a file by. Zero where the host does not say
/// so nothing is ordered by it.
pub fn inode(md: &Metadata) -> u64 {
    host::inode(md)
}

#[cfg(test)]
mod tests {
    use super::Drive;

    #[test]
    fn a_spinning_disk_is_read_by_one_thread() {
        assert_eq!(Drive::Spinning.readers(), 1);
        assert!(Drive::Solid.readers() >= 1);
        assert!(Drive::Unknown.readers() >= 1);
        assert!(
            Drive::Solid.readers() >= Drive::Unknown.readers(),
            "a drive we know about is read at least as hard as one we do not"
        );
    }

    #[test]
    fn a_spinning_disk_compares_in_large_pieces() {
        assert!(Drive::Spinning.compare_chunk() > Drive::Solid.compare_chunk() * 16);
        assert!(Drive::Spinning.wants_layout_order());
        assert!(!Drive::Solid.wants_layout_order());
        assert!(!Drive::Unknown.wants_layout_order());
    }
}

#[cfg(test)]
mod records {
    use super::{read_record, when_of};

    /// Builds the shape Windows writes so the reader can be tried here.
    fn record(version: u64, size: u64, filetime: u64, path: &str) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(&version.to_le_bytes());
        out.extend_from_slice(&size.to_le_bytes());
        out.extend_from_slice(&filetime.to_le_bytes());
        let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        match version {
            1 => {
                let mut fixed = wide.clone();
                fixed.resize(260, 0);
                for c in fixed {
                    out.extend_from_slice(&c.to_le_bytes());
                }
            }
            _ => {
                out.extend_from_slice(&(wide.len() as u32).to_le_bytes());
                for c in &wide {
                    out.extend_from_slice(&c.to_le_bytes());
                }
            }
        }
        out
    }

    /// 2026-09-15 15:00 as Windows counts it.
    const WHEN: u64 = (1_789_484_400 + 11_644_473_600) * 10_000_000;

    #[test]
    fn the_newer_shape_is_read() {
        let raw = record(2, 4_096, WHEN, "G:\\Backups\\INTENSO\\song.mp3");
        let gone = read_record(&raw).expect("it reads");
        assert_eq!(
            gone.was,
            std::path::PathBuf::from("G:\\Backups\\INTENSO\\song.mp3")
        );
        assert_eq!(gone.size, 4_096);
        assert_eq!(gone.when, "2026-09-15 15:00");
    }

    #[test]
    fn the_older_shape_is_read_from_its_fixed_field() {
        let raw = record(1, 99, WHEN, "C:\\Users\\Alex\\note.txt");
        assert_eq!(raw.len(), 24 + 260 * 2, "the field is a fixed width");
        let gone = read_record(&raw).expect("it reads");
        assert_eq!(
            gone.was,
            std::path::PathBuf::from("C:\\Users\\Alex\\note.txt"),
            "it read past the end of the name"
        );
        assert_eq!(gone.size, 99);
    }

    /// A record that is cut short or of a shape nobody knows is refused rather
    /// than read as rubbish.
    #[test]
    fn a_record_that_makes_no_sense_is_refused() {
        assert!(read_record(&[]).is_none());
        assert!(
            read_record(&[0u8; 20]).is_none(),
            "too short to hold a header"
        );
        assert!(
            read_record(&record(7, 1, WHEN, "x")).is_none(),
            "unknown shape"
        );

        // A length saying more than the record holds must not be believed.
        let mut lying = record(2, 1, WHEN, "short.txt");
        lying[24..28].copy_from_slice(&9_999u32.to_le_bytes());
        assert!(read_record(&lying).is_none());
    }

    #[test]
    fn the_time_reads_the_way_a_person_does() {
        assert_eq!(when_of(0), "1970-01-01 00:00");
        assert_eq!(when_of(1_789_484_400), "2026-09-15 15:00");
    }
}

#[cfg(test)]
mod walking {
    use super::first_real;
    use std::path::{Path, PathBuf};

    #[test]
    fn it_walks_up_until_something_is_really_there() {
        let root = std::env::temp_dir().join(format!("spacemongor-up-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("music")).unwrap();

        assert_eq!(first_real(&root.join("music")), Some(root.join("music")));
        assert_eq!(
            first_real(&root.join("music/gone/deeper")),
            Some(root.join("music")),
            "it did not stop at the first real folder"
        );
        assert_eq!(first_real(&root), Some(root.clone()));

        // Nothing at all still lands somewhere real rather than nowhere.
        assert_eq!(
            first_real(Path::new("/not/here/at/all")),
            Some(PathBuf::from("/"))
        );

        std::fs::remove_dir_all(&root).unwrap();
    }
}
