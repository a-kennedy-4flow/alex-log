//! Windows. Drives come from the logical drive mask.

use super::{Gone, Volume};
use std::cmp::Reverse;
use std::fs::Metadata;
use std::os::windows::fs::MetadataExt;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, GetDiskFreeSpaceExW, GetDiskFreeSpaceW,
    GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW, OPEN_EXISTING,
};
use windows_sys::Win32::System::IO::DeviceIoControl;
use windows_sys::Win32::System::Ioctl::{
    DEVICE_SEEK_PENALTY_DESCRIPTOR, IOCTL_STORAGE_QUERY_PROPERTY, PropertyStandardQuery,
    STORAGE_PROPERTY_QUERY, StorageDeviceSeekPenaltyProperty,
};
use windows_sys::Win32::System::WindowsProgramming::{
    DRIVE_CDROM, DRIVE_FIXED, DRIVE_RAMDISK, DRIVE_REMOTE, DRIVE_REMOVABLE,
};
use windows_sys::Win32::UI::Shell::{
    FO_DELETE, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_WANTNUKEWARNING,
    SHFILEOPSTRUCTW, SHFileOperationW,
};

/// Longest volume label Windows will return plus the terminator.
const NAME_MAX: usize = 261;

pub fn volumes() -> Vec<Volume> {
    let mask = unsafe { GetLogicalDrives() };
    let mut out = Vec::new();
    for slot in 0..26u32 {
        if mask & (1 << slot) == 0 {
            continue;
        }
        let letter = (b'A' + slot as u8) as char;
        let root = wide(&format!("{letter}:\\"));
        let kind = match unsafe { GetDriveTypeW(root.as_ptr()) } {
            DRIVE_FIXED => "fixed",
            DRIVE_REMOVABLE => "removable",
            DRIVE_REMOTE => "network",
            DRIVE_CDROM => "optical",
            DRIVE_RAMDISK => "ram",
            _ => continue,
        };

        let mut total = 0u64;
        let mut free = 0u64;
        let ok = unsafe {
            GetDiskFreeSpaceExW(root.as_ptr(), std::ptr::null_mut(), &mut total, &mut free)
        };
        if ok == 0 || total == 0 {
            continue;
        }

        let mut label = [0u16; NAME_MAX];
        let mut format = [0u16; NAME_MAX];
        let named = unsafe {
            GetVolumeInformationW(
                root.as_ptr(),
                label.as_mut_ptr(),
                NAME_MAX as u32,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                format.as_mut_ptr(),
                NAME_MAX as u32,
            )
        };
        let (label, format) = if named == 0 {
            (String::new(), String::new())
        } else {
            (text(&label), text(&format))
        };

        out.push(Volume {
            source: label,
            path: PathBuf::from(format!("{letter}:\\")),
            kind: if format.is_empty() {
                kind.to_string()
            } else {
                format!("{format} {kind}")
            },
            total,
            used: total.saturating_sub(free),
        });
    }
    out.sort_by_key(|v| Reverse(v.total));
    out
}

/// A volume mounted inside a folder is a reparse point. The walk turns away
/// from every reparse point already so no second guard is needed here.
pub fn volume_id(_md: &Metadata) -> u64 {
    0
}

/// The length the file reports. Windows can only give the occupied figure by
/// opening each file in turn and that cost is not worth paying on a whole
/// drive.
pub fn used_bytes(md: &Metadata) -> u64 {
    md.file_size()
}

/// Windows fills the link count in only for metadata taken from an open file.
/// Walking a drive never opens one so a hard linked file is counted under each
/// of its names.
pub fn hard_link_key(_md: &Metadata) -> Option<(u64, u64)> {
    None
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn text(buf: &[u16]) -> String {
    let end = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

/// Opens the folder holding the entry in Explorer with the entry selected.
///
/// The argument goes over raw. Because a) Rust wraps an argument holding a
/// space in quotes b) that puts `/select,` inside the quotes where Explorer
/// cannot see it and c) Explorer wants the quotes around the path alone.
pub fn reveal(path: &Path) {
    let _ = Command::new("explorer")
        .raw_arg(format!("/select,\"{}\"", path.display()))
        .spawn();
}

pub fn open_folder(path: &Path) {
    let _ = Command::new("explorer")
        .raw_arg(format!("\"{}\"", path.display()))
        .spawn();
}

/// Asks the volume whether reaching a file costs a seek.
///
/// The volume is opened for no access at all. That is enough for this question
/// and it needs no administrator.
pub fn drive(path: &Path) -> super::Drive {
    let shown = path.display().to_string();
    let Some(letter) = shown.chars().next() else {
        return super::Drive::Unknown;
    };
    let name = wide(&format!("\\\\.\\{letter}:"));
    let volume = unsafe {
        CreateFileW(
            name.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null(),
            OPEN_EXISTING,
            0,
            std::ptr::null_mut(),
        )
    };
    if volume == INVALID_HANDLE_VALUE {
        return super::Drive::Unknown;
    }

    let ask = STORAGE_PROPERTY_QUERY {
        PropertyId: StorageDeviceSeekPenaltyProperty,
        QueryType: PropertyStandardQuery,
        AdditionalParameters: [0],
    };
    let mut told: DEVICE_SEEK_PENALTY_DESCRIPTOR = unsafe { std::mem::zeroed() };
    let mut given = 0u32;
    let ok = unsafe {
        DeviceIoControl(
            volume,
            IOCTL_STORAGE_QUERY_PROPERTY,
            std::ptr::from_ref(&ask).cast(),
            size_of::<STORAGE_PROPERTY_QUERY>() as u32,
            std::ptr::from_mut(&mut told).cast(),
            size_of::<DEVICE_SEEK_PENALTY_DESCRIPTOR>() as u32,
            &mut given,
            std::ptr::null_mut(),
        )
    };
    unsafe { CloseHandle(volume) };

    if ok == 0 {
        return super::Drive::Unknown;
    }
    if told.IncursSeekPenalty {
        super::Drive::Spinning
    } else {
        super::Drive::Solid
    }
}

/// Hands the entry to the shell to put in the recycle bin.
///
/// The shell is asked rather than the file being unlinked. Because a) only the
/// shell writes the record that lets it be put back and b) an unlink would take
/// it away for good.
pub fn trash(path: &Path) -> Result<PathBuf, String> {
    // The shell reads a run of names ending in two zeros rather than one.
    let mut from: Vec<u16> = path.display().to_string().encode_utf16().collect();
    from.push(0);
    from.push(0);

    let mut ask: SHFILEOPSTRUCTW = unsafe { std::mem::zeroed() };
    ask.wFunc = FO_DELETE;
    ask.pFrom = from.as_ptr();
    // `FOF_WANTNUKEWARNING` is what stands between a recycle and a destruction.
    //
    // A drive with no recycle bin makes `FOF_ALLOWUNDO` fall back to deleting
    // outright, and `FOF_NOCONFIRMATION` would then swallow the warning about
    // it. Removable drives have no recycle bin by default. Without this flag a
    // clear out on a memory stick would destroy the files and say it had put
    // them somewhere they could be fetched back from.
    ask.fFlags = (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_WANTNUKEWARNING | FOF_NOERRORUI) as u16;

    let answer = unsafe { SHFileOperationW(&mut ask) };
    if answer != 0 {
        return Err(format!("the shell reported {answer}"));
    }
    if ask.fAnyOperationsAborted != 0 {
        return Err("the shell stopped part way".to_string());
    }
    Ok(bin_for(path).unwrap_or_else(|| PathBuf::from("the recycle bin")))
}

/// Everything the recycle bin for `path` is holding.
///
/// Windows writes two files for each entry. `$I` carries where it came from and
/// how big it was and when it went. `$R` carries the entry itself. The pair is
/// read rather than anything being moved.
pub fn recycled(path: &Path) -> Vec<Gone> {
    let Some(bin) = bin_for(path) else {
        return Vec::new();
    };
    // One folder inside for each account that has used it. Only the one for
    // this account can be read and that is the one wanted.
    let Ok(accounts) = std::fs::read_dir(&bin) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for account in accounts.flatten() {
        let Ok(entries) = std::fs::read_dir(account.path()) else {
            continue;
        };
        for entry in entries.flatten() {
            let at = entry.path();
            let leaf = entry.file_name().to_string_lossy().into_owned();
            if !leaf.starts_with("$I") {
                continue;
            }
            let Ok(record) = std::fs::read(&at) else {
                continue;
            };
            let Some(gone) = super::read_record(&record) else {
                continue;
            };
            // The entry itself sits beside the record under `$R`.
            let beside = account.path().join(format!("$R{}", &leaf[2..]));
            out.push(Gone {
                now: beside,
                ..gone
            });
        }
    }
    out.sort_by(|x, y| y.when.cmp(&x.when));
    out
}

/// Where an entry from `path` would go.
///
/// Every drive keeps its own. A file from `G:` goes to `G:\\$Recycle.Bin` and
/// never to the one on `C:`.
pub fn bin_for(path: &Path) -> Option<PathBuf> {
    let shown = path.display().to_string();
    let letter = shown.chars().next()?;
    if !letter.is_ascii_alphabetic() {
        return None;
    }
    Some(PathBuf::from(format!("{letter}:\\$Recycle.Bin")))
}

/// Space this caller may still fill.
pub fn free_space(path: &Path) -> Option<u64> {
    let at = wide(&path.display().to_string());
    let mut free = 0u64;
    let mut total = 0u64;
    let ok =
        unsafe { GetDiskFreeSpaceExW(at.as_ptr(), &mut free, &mut total, std::ptr::null_mut()) };
    (ok != 0).then_some(free)
}

/// Windows keeps this behind the performance counters rather than a file so it
/// is not asked for here.
pub fn io_busy(_path: &Path) -> Option<u64> {
    None
}

/// Windows fills this in only for metadata taken from an open file. The walk
/// never opens one so nothing is ordered by it.
pub fn inode(_md: &Metadata) -> u64 {
    0
}

/// Windows hands space out a cluster at a time. The walk reads the length of a
/// file so the rounding has to be explained separately.
pub fn cluster_size(path: &Path) -> Option<u64> {
    let root = wide(&path.display().to_string());
    let mut per_cluster = 0u32;
    let mut per_sector = 0u32;
    let mut free = 0u32;
    let mut total = 0u32;
    let ok = unsafe {
        GetDiskFreeSpaceW(
            root.as_ptr(),
            &mut per_cluster,
            &mut per_sector,
            &mut free,
            &mut total,
        )
    };
    if ok == 0 {
        return None;
    }
    let size = per_cluster as u64 * per_sector as u64;
    (size > 0).then_some(size)
}
