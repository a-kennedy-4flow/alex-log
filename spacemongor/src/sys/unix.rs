//! Linux. Mounted filesystems come from `/proc/mounts`.

use super::{Gone, Volume};
use std::cmp::Reverse;
use std::collections::HashSet;
use std::ffi::CString;
use std::fs::Metadata;
use std::io::Write;
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::MetadataExt;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// Kernel filesystems that hold no user data. Listing them would only add noise.
const PSEUDO: &[&str] = &[
    "autofs",
    "binfmt_misc",
    "bpf",
    "cgroup",
    "cgroup2",
    "configfs",
    "debugfs",
    "devpts",
    "devtmpfs",
    "efivarfs",
    "fuse.gvfsd-fuse",
    "fuse.portal",
    "fusectl",
    "hugetlbfs",
    "mqueue",
    "nsfs",
    "overlay",
    "proc",
    "pstore",
    "ramfs",
    "rpc_pipefs",
    "securityfs",
    "selinuxfs",
    "squashfs",
    "sysfs",
    "tracefs",
];

/// Reads `/proc/mounts` and keeps the entries that hold real data.
///
/// A bind mount repeats a filesystem under a second path. Only the first path
/// for a given device is kept so the same data is never offered twice.
pub fn volumes() -> Vec<Volume> {
    let Ok(text) = std::fs::read_to_string("/proc/mounts") else {
        return Vec::new();
    };
    let mut seen: HashSet<u64> = HashSet::new();
    let mut out = Vec::new();
    for line in text.lines() {
        let mut f = line.split(' ');
        let (Some(source), Some(path), Some(fstype)) = (f.next(), f.next(), f.next()) else {
            continue;
        };
        if PSEUDO.contains(&fstype) {
            continue;
        }
        if fstype == "tmpfs" && !unescape(path).starts_with("/mnt") {
            continue;
        }
        let path = PathBuf::from(unescape(path));
        let Ok(md) = std::fs::metadata(&path) else {
            continue;
        };
        if !seen.insert(md.dev()) {
            continue;
        }
        let Some((total, used)) = usage(&path) else {
            continue;
        };
        if total == 0 {
            continue;
        }
        out.push(Volume {
            source: unescape(source),
            path,
            kind: fstype.to_string(),
            total,
            used,
        });
    }
    out.sort_by_key(|v| Reverse(v.total));
    out
}

pub fn volume_id(md: &Metadata) -> u64 {
    md.dev()
}

/// Blocks occupied rather than the length the file reports. A sparse file costs
/// what it costs.
pub fn used_bytes(md: &Metadata) -> u64 {
    md.blocks() * 512
}

pub fn hard_link_key(md: &Metadata) -> Option<(u64, u64)> {
    (md.nlink() > 1).then(|| (md.dev(), md.ino()))
}

/// Total and occupied bytes the kernel reports for the filesystem at `path`.
///
/// Free space is taken from `f_bfree` rather than `f_bavail` because a) the walk
/// counts every file it can read including those in the space reserved for root
/// and b) `f_bavail` hides that reserve so the two figures would never agree.
fn usage(path: &Path) -> Option<(u64, u64)> {
    let c = CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut s: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(c.as_ptr(), &mut s) } != 0 {
        return None;
    }
    let unit = if s.f_frsize > 0 {
        s.f_frsize
    } else {
        s.f_bsize
    } as u64;
    let total = (s.f_blocks as u64).checked_mul(unit)?;
    let free = (s.f_bfree as u64).saturating_mul(unit);
    Some((total, total.saturating_sub(free)))
}

/// `/proc/mounts` escapes the characters that would otherwise split a field.
fn unescape(s: &str) -> String {
    if !s.contains('\\') {
        return s.to_string();
    }
    let b = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'\\'
            && i + 3 < b.len()
            && let Ok(v) = u8::from_str_radix(&s[i + 1..i + 4], 8)
        {
            out.push(v);
            i += 4;
            continue;
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Asks the file manager to show the entry with it selected. Not every desktop
/// answers that call so the folder holding it is opened when none does.
pub fn reveal(path: &Path) {
    let shown = Command::new("dbus-send")
        .args([
            "--session",
            "--reply-timeout=2000",
            "--print-reply",
            "--dest=org.freedesktop.FileManager1",
            "/org/freedesktop/FileManager1",
            "org.freedesktop.FileManager1.ShowItems",
        ])
        .arg(format!("array:string:{}", file_uri(path)))
        .arg("string:")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    if matches!(shown, Ok(code) if code.success()) {
        return;
    }
    open_folder(path.parent().unwrap_or(path));
}

pub fn open_folder(path: &Path) {
    let _ = Command::new("xdg-open")
        .arg(path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}

/// A path written as a URI. Every byte outside the unreserved set is escaped
/// because a space or a hash in a path would otherwise cut the URI short.
fn file_uri(path: &Path) -> String {
    let mut out = String::from("file://");
    for byte in path.as_os_str().as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => {
                out.push(*byte as char);
            }
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

/// Reads the rotational flag the kernel publishes for the block device behind
/// `path`.
///
/// A partition carries no `queue` of its own so the whole disk above it is
/// asked. A device mapper volume answers for whatever sits underneath it.
pub fn drive(path: &Path) -> super::Drive {
    let Ok(md) = std::fs::metadata(path) else {
        return super::Drive::Unknown;
    };
    let device = md.dev();
    // The major and minor are packed into `st_dev` in a way that is not worth
    // unpacking by hand. libc already knows how.
    let name = format!("{}:{}", libc::major(device), libc::minor(device));
    let here = PathBuf::from("/sys/dev/block").join(&name);
    for at in [
        here.join("queue/rotational"),
        here.join("../queue/rotational"),
    ] {
        if let Ok(text) = std::fs::read_to_string(&at) {
            return match text.trim() {
                "1" => super::Drive::Spinning,
                "0" => super::Drive::Solid,
                _ => super::Drive::Unknown,
            };
        }
    }
    super::Drive::Unknown
}

/// Moves an entry into the trash the desktop understands.
///
/// The freedesktop rules are followed rather than guessed at. The record of
/// where it came from is written first and only then is the entry moved.
/// Because a) a record with no entry is litter and b) an entry with no record
/// can never be put back.
pub fn trash(path: &Path) -> Result<PathBuf, String> {
    let here = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|e| e.to_string())?
            .join(path)
    };
    let md = std::fs::symlink_metadata(&here).map_err(|e| e.to_string())?;
    let device = md.dev();

    // The trash has to sit on the same filesystem as the entry. A rename cannot
    // cross one and a copy would defeat the point of the recycle bin.
    let bin = match home_bin() {
        Some(home) if same_device(&home, device) => home,
        _ => mount_bin(&here, device)?,
    };
    // The record names the entry relative to the mount when the trash is not
    // the one in the home folder.
    let recorded = match mount_of(&here, device) {
        Some(top) if bin.starts_with(&top) && !bin.starts_with(home_bin().unwrap_or_default()) => {
            here.strip_prefix(&top).unwrap_or(&here).to_path_buf()
        }
        _ => here.clone(),
    };
    put(&here, &bin, &recorded)
}

/// Puts one entry into one trash. Held apart from choosing the trash so it can
/// be tried against a trash of its own.
fn put(here: &Path, bin: &Path, recorded: &Path) -> Result<PathBuf, String> {
    let files = bin.join("files");
    let info = bin.join("info");
    std::fs::create_dir_all(&files).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&info).map_err(|e| e.to_string())?;

    let leaf = here
        .file_name()
        .ok_or_else(|| "that has no name".to_string())?
        .to_string_lossy()
        .into_owned();

    for attempt in 0..1000 {
        let name = if attempt == 0 {
            leaf.clone()
        } else {
            format!("{leaf}_{attempt}")
        };
        let record = info.join(format!("{name}.trashinfo"));
        // `create_new` is what makes the name ours. Two programs trashing one
        // name at once cannot both win it.
        let made = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&record);
        let Ok(mut made) = made else {
            continue;
        };
        let when = stamp();
        if write!(
            made,
            "[Trash Info]\nPath={}\nDeletionDate={when}\n",
            escape(recorded)
        )
        .is_err()
        {
            let _ = std::fs::remove_file(&record);
            return Err("the record could not be written".to_string());
        }
        drop(made);

        let landed = files.join(&name);
        match std::fs::rename(here, &landed) {
            Ok(()) => return Ok(landed),
            Err(e) => {
                let _ = std::fs::remove_file(&record);
                return Err(e.to_string());
            }
        }
    }
    Err("no free name in the trash".to_string())
}

/// Where an entry from `path` would go.
///
/// The one in the home folder when it can be reached and the one at the top of
/// the filesystem otherwise. A rename cannot cross a filesystem so the trash
/// has to sit on the same one as the entry.
pub fn bin_for(path: &Path) -> Option<PathBuf> {
    let real = super::first_real(path)?;
    let device = std::fs::metadata(&real).ok()?.dev();
    match home_bin() {
        Some(home) if same_device(&home, device) => Some(home),
        _ => mount_bin(&real, device).ok(),
    }
}

fn home_bin() -> Option<PathBuf> {
    if cfg!(test) {
        // A test must never put anything in the trash of whoever ran it. One
        // trash for each test so tests running side by side stay apart.
        let who: String = std::thread::current()
            .name()
            .unwrap_or("main")
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect();
        return Some(
            std::env::temp_dir()
                .join(format!("spacemongor-bin-{}-{who}", std::process::id()))
                .join("Trash"),
        );
    }
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share")))
        .map(|base| base.join("Trash"))
}

fn same_device(bin: &Path, device: u64) -> bool {
    // The trash may not be made yet and neither may the folders above it. The
    // nearest one that is really there answers for the whole chain.
    super::first_real(bin)
        .is_some_and(|real| std::fs::metadata(real).is_ok_and(|m| m.dev() == device))
}

/// The highest folder still on the same filesystem. That is where it is
/// mounted.
fn mount_of(path: &Path, device: u64) -> Option<PathBuf> {
    let mut at = path.parent()?.to_path_buf();
    loop {
        let Some(up) = at.parent() else {
            return Some(at);
        };
        match std::fs::metadata(up) {
            Ok(md) if md.dev() == device => at = up.to_path_buf(),
            _ => return Some(at),
        }
    }
}

/// The trash kept at the top of a filesystem for entries that cannot reach the
/// one in the home folder.
fn mount_bin(path: &Path, device: u64) -> Result<PathBuf, String> {
    let top = mount_of(path, device).ok_or_else(|| "no mount above that".to_string())?;
    let uid = unsafe { libc::getuid() };

    // A shared `.Trash` counts only when the desktop laid it down properly.
    let shared = top.join(".Trash");
    if let Ok(md) = std::fs::symlink_metadata(&shared)
        && md.is_dir()
        && md.permissions().mode() & 0o1000 != 0
    {
        return Ok(shared.join(uid.to_string()));
    }
    Ok(top.join(format!(".Trash-{uid}")))
}

fn stamp() -> String {
    // The spec asks for local time. The offset is not worth a dependency so the
    // time is written as the desktop reads it when the offset is zero.
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0) as i64;
    let days = secs.div_euclid(86_400);
    let rest = secs.rem_euclid(86_400);
    let (y, m, d) = super::civil(days);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}",
        rest / 3600,
        (rest % 3600) / 60,
        rest % 60
    )
}

/// Everything the trash for `path` is holding, read from the records the
/// desktop wrote when each entry went in.
pub fn recycled(path: &Path) -> Vec<Gone> {
    let Some(bin) = bin_for(path) else {
        return Vec::new();
    };
    let Ok(records) = std::fs::read_dir(bin.join("info")) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for record in records.flatten() {
        let at = record.path();
        if at.extension().is_none_or(|e| e != "trashinfo") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&at) else {
            continue;
        };
        let mut was = String::new();
        let mut when = String::new();
        for line in text.lines() {
            if let Some(rest) = line.strip_prefix("Path=") {
                was = unescape_url(rest);
            } else if let Some(rest) = line.strip_prefix("DeletionDate=") {
                when = rest.replace('T', " ");
            }
        }
        if was.is_empty() {
            continue;
        }
        let name = at.file_stem().unwrap_or_default();
        let now = bin.join("files").join(name);
        let size = std::fs::symlink_metadata(&now)
            .map(|m| m.len())
            .unwrap_or(0);
        out.push(Gone {
            was: PathBuf::from(was),
            now,
            size,
            when,
        });
    }
    out.sort_by(|x, y| y.when.cmp(&x.when));
    out
}

/// Turns the escaping back the other way so the original name can be read.
fn unescape_url(text: &str) -> String {
    let raw = text.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(raw.len());
    let mut i = 0;
    while i < raw.len() {
        if raw[i] == b'%'
            && i + 2 < raw.len()
            && let Ok(byte) = u8::from_str_radix(&text[i + 1..i + 3], 16)
        {
            out.push(byte);
            i += 3;
            continue;
        }
        out.push(raw[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// The record holds a URL so the characters a URL cannot carry are escaped.
fn escape(path: &Path) -> String {
    let mut out = String::new();
    for byte in path.as_os_str().as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => {
                out.push(*byte as char);
            }
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

/// Space a normal user may still fill. The reserve kept for root is not offered
/// because a copy run as a normal user cannot reach it.
pub fn free_space(path: &Path) -> Option<u64> {
    let c = CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut s: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(c.as_ptr(), &mut s) } != 0 {
        return None;
    }
    let unit = if s.f_frsize > 0 {
        s.f_frsize
    } else {
        s.f_bsize
    } as u64;
    Some((s.f_bavail as u64).saturating_mul(unit))
}

/// Field ten of the kernel's block device counters. It is the figure `iostat`
/// turns into a percentage.
pub fn io_busy(path: &Path) -> Option<u64> {
    let md = std::fs::metadata(path).ok()?;
    let name = format!("{}:{}", libc::major(md.dev()), libc::minor(md.dev()));
    let text =
        std::fs::read_to_string(PathBuf::from("/sys/dev/block").join(name).join("stat")).ok()?;
    text.split_whitespace().nth(9)?.parse().ok()
}

pub fn inode(md: &Metadata) -> u64 {
    md.ino()
}

/// Linux counts blocks occupied so nothing is rounded away.
pub fn cluster_size(_path: &Path) -> Option<u64> {
    None
}

#[cfg(test)]
mod tests {
    use super::file_uri;
    use std::path::Path;

    fn ground(tag: &str) -> std::path::PathBuf {
        let root =
            std::env::temp_dir().join(format!("spacemongor-trash-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("bin")).unwrap();
        std::fs::create_dir_all(root.join("disk")).unwrap();
        root
    }

    #[test]
    fn an_entry_goes_to_the_trash_and_a_record_says_where_it_came_from() {
        let root = ground("one");
        let bin = root.join("bin");
        let gone = root.join("disk/holiday.mp4");
        std::fs::write(&gone, vec![b'v'; 400]).unwrap();

        let landed = super::put(&gone, &bin, &gone).expect("it goes to the trash");

        assert!(!gone.exists(), "it was left where it was");
        assert!(landed.exists(), "it did not arrive");
        assert_eq!(std::fs::read(&landed).unwrap(), vec![b'v'; 400]);
        assert_eq!(landed, bin.join("files/holiday.mp4"));

        let record = std::fs::read_to_string(bin.join("info/holiday.mp4.trashinfo")).unwrap();
        assert!(record.starts_with("[Trash Info]\n"), "{record}");
        assert!(
            record.contains(&format!("Path={}", super::escape(&gone))),
            "{record}"
        );
        assert!(record.contains("DeletionDate=20"), "{record}");

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn two_entries_of_one_name_both_land() {
        let root = ground("clash");
        let bin = root.join("bin");
        std::fs::create_dir_all(root.join("disk/a")).unwrap();
        std::fs::create_dir_all(root.join("disk/b")).unwrap();
        let first = root.join("disk/a/song.mp3");
        let second = root.join("disk/b/song.mp3");
        std::fs::write(&first, b"one").unwrap();
        std::fs::write(&second, b"two").unwrap();

        let one = super::put(&first, &bin, &first).unwrap();
        let other = super::put(&second, &bin, &second).unwrap();

        assert_ne!(one, other, "the second landed on the first");
        assert_eq!(std::fs::read(&one).unwrap(), b"one");
        assert_eq!(std::fs::read(&other).unwrap(), b"two");
        assert!(bin.join("info/song.mp3.trashinfo").exists());
        assert!(bin.join("info/song.mp3_1.trashinfo").exists());

        std::fs::remove_dir_all(&root).unwrap();
    }

    /// A record with no entry beside it is litter. Nothing is left behind when
    /// the move cannot happen.
    #[test]
    fn nothing_is_left_behind_when_the_entry_is_not_there() {
        let root = ground("missing");
        let bin = root.join("bin");
        let never = root.join("disk/never.txt");

        assert!(super::put(&never, &bin, &never).is_err());
        assert!(
            !bin.join("info/never.txt.trashinfo").exists(),
            "a record was left with nothing behind it"
        );

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn where_it_would_go_can_be_asked_without_sending_anything() {
        let root = ground("where");
        let file = root.join("disk/a.mp3");
        std::fs::write(&file, b"x").unwrap();

        let bin = super::bin_for(&file).expect("somewhere was named");
        assert!(
            bin.ends_with("Trash") || bin.to_string_lossy().contains(".Trash"),
            "{bin:?}"
        );
        assert!(file.exists(), "asking where sent it there");

        // A path that is not there still answers from the nearest folder above.
        let gone = root.join("disk/never/at/all.mp3");
        assert!(super::bin_for(&gone).is_some());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_name_a_url_cannot_carry_is_escaped() {
        assert_eq!(
            super::escape(std::path::Path::new("/disk/My Files/a#1 (100%).mp3")),
            "/disk/My%20Files/a%231%20%28100%25%29.mp3"
        );
    }

    #[test]
    fn the_date_reads_the_way_the_desktop_expects() {
        let when = super::stamp();
        assert_eq!(when.len(), 19, "{when}");
        assert_eq!(&when[4..5], "-");
        assert_eq!(&when[10..11], "T");
        assert_eq!(&when[13..14], ":");
        assert_eq!(super::super::civil(0), (1970, 1, 1));
        assert_eq!(super::super::civil(19_723), (2024, 1, 1));
    }

    #[test]
    fn the_drive_behind_a_path_is_named() {
        use super::super::Drive;
        // The answer depends on the machine. What must hold is that a real path
        // gets a real answer and a path that is not there does not.
        let here = super::drive(Path::new("/"));
        assert!(
            matches!(here, Drive::Spinning | Drive::Solid),
            "the kernel publishes this for a mounted filesystem, got {here:?}"
        );
        assert_eq!(
            super::drive(Path::new("/definitely/not/here")),
            Drive::Unknown
        );
    }

    #[test]
    fn a_path_becomes_a_uri_the_file_manager_can_read() {
        assert_eq!(
            file_uri(Path::new("/home/alex/notes.txt")),
            "file:///home/alex/notes.txt"
        );
        assert_eq!(
            file_uri(Path::new("/home/alex/My Files/a#1 (100%).txt")),
            "file:///home/alex/My%20Files/a%231%20%28100%25%29.txt"
        );
    }
}
