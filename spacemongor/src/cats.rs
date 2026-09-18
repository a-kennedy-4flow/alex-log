//! File type groups and the colour each one wears.

use eframe::egui::Color32;

/// A group of file types that shares one colour.
///
/// `Folder` is not a file type. It marks a subtree drawn as a single box because
/// the depth limit stopped the nesting there. `Pending` marks the difference
/// between what the operating system reports as occupied and what the walk has
/// added up.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum Cat {
    Code,
    Video,
    Archive,
    Image,
    Document,
    Audio,
    Data,
    System,
    Other,
    Folder,
    Pending,
}

/// The groups shown in the legend. `Folder` and `Pending` are explained by the
/// status line instead.
pub const LEGEND: [Cat; 9] = [
    Cat::Code,
    Cat::Video,
    Cat::Archive,
    Cat::Image,
    Cat::Document,
    Cat::Audio,
    Cat::Data,
    Cat::System,
    Cat::Other,
];

impl Cat {
    pub fn label(self) -> &'static str {
        match self {
            Cat::Code => "Code",
            Cat::Video => "Video",
            Cat::Archive => "Archive",
            Cat::Image => "Image",
            Cat::Document => "Document",
            Cat::Audio => "Audio",
            Cat::Data => "Data",
            Cat::System => "System",
            Cat::Other => "Other",
            Cat::Folder => "Folder",
            Cat::Pending => "Unaccounted",
        }
    }

    /// A number standing for this group that never changes.
    ///
    /// Used where a set of groups has to be boiled down to one number. Written
    /// out rather than taken from the order of the list so adding a group later
    /// cannot quietly change what an old answer meant.
    pub fn key(self) -> u64 {
        match self {
            Cat::Code => 1,
            Cat::Video => 2,
            Cat::Archive => 3,
            Cat::Image => 4,
            Cat::Document => 5,
            Cat::Audio => 6,
            Cat::Data => 7,
            Cat::System => 8,
            Cat::Other => 9,
            Cat::Folder => 10,
            Cat::Pending => 11,
        }
    }

    /// Steps taken from the validated dark categorical palette. See
    /// `docs/decisions.md` for the separation figures and the trade they carry.
    pub fn colour(self) -> Color32 {
        match self {
            Cat::Code => Color32::from_rgb(0x39, 0x87, 0xe5),
            Cat::Video => Color32::from_rgb(0xd9, 0x59, 0x26),
            Cat::Archive => Color32::from_rgb(0x19, 0x9e, 0x70),
            Cat::Image => Color32::from_rgb(0xc9, 0x85, 0x00),
            Cat::Document => Color32::from_rgb(0xd5, 0x51, 0x81),
            Cat::Audio => Color32::from_rgb(0x00, 0x83, 0x00),
            Cat::Data => Color32::from_rgb(0x90, 0x85, 0xe9),
            Cat::System => Color32::from_rgb(0xe6, 0x67, 0x67),
            Cat::Other => Color32::from_rgb(0x6f, 0x6f, 0x6c),
            Cat::Folder => Color32::from_rgb(0x3f, 0x4a, 0x55),
            Cat::Pending => Color32::from_rgb(0x26, 0x26, 0x25),
        }
    }
}

/// Reads the group from the name alone. No file is ever opened.
pub fn of(name: &str) -> Cat {
    let Some(dot) = name.rfind('.') else {
        return Cat::Other;
    };
    let ext = name[dot + 1..].to_ascii_lowercase();
    match ext.as_str() {
        "rs" | "c" | "h" | "cc" | "cpp" | "hpp" | "py" | "js" | "mjs" | "ts" | "tsx" | "jsx"
        | "java" | "kt" | "go" | "rb" | "sh" | "bash" | "zsh" | "php" | "pl" | "lua" | "swift"
        | "cs" | "scala" | "hs" | "ml" | "vue" | "html" | "htm" | "css" | "scss" | "json"
        | "xml" | "yaml" | "yml" | "toml" | "ini" | "cfg" | "conf" | "sql" | "patch" | "diff" => {
            Cat::Code
        }
        "mp4" | "mkv" | "avi" | "mov" | "wmv" | "flv" | "webm" | "m4v" | "mpg" | "mpeg" | "vob"
        | "ogv" | "3gp" => Cat::Video,
        "zip" | "tar" | "gz" | "tgz" | "bz2" | "xz" | "zst" | "7z" | "rar" | "iso" | "img"
        | "deb" | "rpm" | "pkg" | "dmg" | "cab" | "lz4" | "snap" => Cat::Archive,
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "svg" | "webp" | "tif" | "tiff" | "heic"
        | "heif" | "ico" | "psd" | "xcf" | "raw" | "cr2" | "nef" | "arw" | "dng" => Cat::Image,
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "xlsm" | "ppt" | "pptx" | "odt" | "ods"
        | "odp" | "txt" | "md" | "rst" | "rtf" | "epub" | "mobi" | "csv" | "tex" => Cat::Document,
        "mp3" | "flac" | "wav" | "ogg" | "oga" | "m4a" | "aac" | "wma" | "opus" | "aiff"
        | "mid" | "midi" => Cat::Audio,
        "db" | "sqlite" | "sqlite3" | "mdb" | "log" | "dat" | "bin" | "bak" | "dump" | "idx"
        | "parquet" | "avro" | "pack" | "cache" | "pyc" | "class" | "o" | "rlib" | "rmeta" => {
            Cat::Data
        }
        "so" | "dll" | "dylib" | "exe" | "ko" | "a" | "lib" | "sys" | "efi" | "elf" | "msi"
        | "ttf" | "otf" | "woff" | "woff2" => Cat::System,
        _ => Cat::Other,
    }
}

#[cfg(test)]
mod tests {
    use super::{Cat, of};

    #[test]
    fn reads_the_group_from_the_extension() {
        assert_eq!(of("main.rs"), Cat::Code);
        assert_eq!(of("holiday.MP4"), Cat::Video);
        assert_eq!(of("backup.tar.gz"), Cat::Archive);
        assert_eq!(of("libc.so"), Cat::System);
        assert_eq!(of("README"), Cat::Other);
        assert_eq!(of(".bashrc"), Cat::Other);
    }

    #[test]
    fn every_group_has_a_number_of_its_own() {
        let mut seen = std::collections::HashSet::new();
        for cat in [
            Cat::Code,
            Cat::Video,
            Cat::Archive,
            Cat::Image,
            Cat::Document,
            Cat::Audio,
            Cat::Data,
            Cat::System,
            Cat::Other,
            Cat::Folder,
            Cat::Pending,
        ] {
            assert!(seen.insert(cat.key()), "{cat:?} shares its number");
        }
    }

    #[test]
    fn every_legend_colour_is_distinct() {
        for (i, a) in super::LEGEND.iter().enumerate() {
            for b in &super::LEGEND[i + 1..] {
                assert_ne!(a.colour(), b.colour(), "{a:?} and {b:?} share a colour");
            }
        }
    }
}
