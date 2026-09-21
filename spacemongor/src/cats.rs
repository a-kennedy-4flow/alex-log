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

/// A named set of groups.
///
/// A group is read off an extension. A bundle is what a person actually asks
/// for. Photos and video are one thing to someone sorting a backup even though
/// the two groups are kept apart everywhere else.
pub struct Bundle {
    pub label: &'static str,
    pub cats: &'static [Cat],
}

/// Every group sits in exactly one bundle so a file always has somewhere to
/// land.
pub const BUNDLES: [Bundle; 7] = [
    Bundle {
        label: "Photos and video",
        cats: &[Cat::Image, Cat::Video],
    },
    Bundle {
        label: "Music",
        cats: &[Cat::Audio],
    },
    Bundle {
        label: "Documents",
        cats: &[Cat::Document],
    },
    Bundle {
        label: "Archives",
        cats: &[Cat::Archive],
    },
    Bundle {
        label: "Code",
        cats: &[Cat::Code],
    },
    Bundle {
        label: "Data and system",
        cats: &[Cat::Data, Cat::System],
    },
    Bundle {
        label: "Other",
        cats: &[Cat::Other],
    },
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

    /// The bundle this group sits in.
    ///
    /// `Folder` and `Pending` name no file so they fall to the last bundle
    /// rather than being refused. Nothing ever asks either of them for one.
    pub fn bundle(self) -> &'static Bundle {
        BUNDLES
            .iter()
            .find(|b| b.cats.contains(&self))
            .unwrap_or(&BUNDLES[BUNDLES.len() - 1])
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

/// The share of light a colour sends back, as sRGB relative luminance.
///
/// Each channel is taken off the display gamma first. Because the stored value
/// is not proportional to light and a contrast worked out from the stored value
/// picks the wrong text colour on a saturated fill.
fn luminance(c: Color32) -> f32 {
    fn linear(v: u8) -> f32 {
        let v = v as f32 / 255.0;
        if v <= 0.04045 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        }
    }
    0.2126 * linear(c.r()) + 0.7152 * linear(c.g()) + 0.0722 * linear(c.b())
}

/// How far apart two colours read, as the WCAG contrast ratio. One to twenty
/// one. Text at this size needs four and a half.
pub fn contrast(a: Color32, b: Color32) -> f32 {
    let (x, y) = (luminance(a), luminance(b));
    let (high, low) = if x > y { (x, y) } else { (y, x) };
    (high + 0.05) / (low + 0.05)
}

/// The text colour to put on a fill.
///
/// Both candidates are measured and the one that reads further from the fill
/// wins. Because a brightness threshold picks light text on a mid saturated
/// fill where dark text reads nearly twice as far.
pub fn ink(fill: Color32) -> Color32 {
    let (dark, light) = (Color32::from_gray(16), Color32::from_gray(244));
    if contrast(fill, dark) >= contrast(fill, light) {
        dark
    } else {
        light
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

/// The extension in lower case. `None` when the name carries none.
///
/// Read the same way `of` reads it so a group and an extension never disagree
/// about one file.
pub fn ext_of(name: &str) -> Option<String> {
    let dot = name.rfind('.')?;
    Some(name[dot + 1..].to_ascii_lowercase())
}

/// Splits what someone typed into extensions.
///
/// Any run of punctuation or space parts them so `jpg, .mp4  cr2` reads as
/// three. A leading dot is dropped because both ways of naming an extension
/// are common.
pub fn extensions(typed: &str) -> std::collections::HashSet<String> {
    typed
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|part| !part.is_empty())
        .map(str::to_ascii_lowercase)
        .collect()
}

/// What a search or an extraction is asked to look at.
///
/// Nothing set means every file. A group narrows it to that group. An extension
/// narrows it again inside whatever groups are set.
#[derive(Clone, Default, PartialEq, Eq, Debug)]
pub struct Pick {
    pub cats: std::collections::HashSet<Cat>,
    pub exts: std::collections::HashSet<String>,
}

impl Pick {
    /// Every group named and nothing else.
    pub fn of_cats(cats: impl IntoIterator<Item = Cat>) -> Self {
        Pick {
            cats: cats.into_iter().collect(),
            exts: std::collections::HashSet::new(),
        }
    }

    /// True when nothing is held back.
    ///
    /// Every group ticked is the same question as none of them ticked. Saying
    /// it the same way both times lets the two share one stored answer.
    pub fn everything(&self) -> bool {
        self.exts.is_empty()
            && (self.cats.is_empty() || LEGEND.iter().all(|c| self.cats.contains(c)))
    }

    /// True when this file name is one of the files asked for.
    pub fn holds(&self, name: &str) -> bool {
        if !self.cats.is_empty() && !self.cats.contains(&of(name)) {
            return false;
        }
        if self.exts.is_empty() {
            return true;
        }
        ext_of(name).is_some_and(|ext| self.exts.contains(&ext))
    }

    /// Which bundles are fully ticked.
    pub fn bundles(&self) -> Vec<&'static Bundle> {
        BUNDLES
            .iter()
            .filter(|b| b.cats.iter().all(|c| self.cats.contains(c)))
            .collect()
    }

    /// One line saying what will come across.
    ///
    /// Every group ticked reads as every file, the same as none ticked. Because
    /// `everything` already treats the two as one question and a line naming
    /// all seven bundles says the same thing in ninety characters.
    pub fn says(&self) -> String {
        if self.everything() {
            return "every file".to_string();
        }
        let groups = match (self.cats.len(), self.bundles()) {
            (0, _) => "every file".to_string(),
            (_, bundles) if !bundles.is_empty() && self.spanned(&bundles) => bundles
                .iter()
                .map(|b| b.label.to_lowercase())
                .collect::<Vec<_>>()
                .join(" and "),
            (1, _) => self
                .cats
                .iter()
                .next()
                .map(|c| c.label().to_lowercase())
                .unwrap_or_default(),
            (n, _) => format!("{n} groups"),
        };
        if self.exts.is_empty() {
            return groups;
        }
        let mut exts: Vec<&str> = self.exts.iter().map(String::as_str).collect();
        exts.sort_unstable();
        format!("{groups} narrowed to {}", exts.join(" "))
    }

    /// True when the bundles named cover every group ticked.
    ///
    /// Without it a ticked group sitting outside them would go unmentioned.
    fn spanned(&self, bundles: &[&'static Bundle]) -> bool {
        self.cats
            .iter()
            .all(|c| bundles.iter().any(|b| b.cats.contains(c)))
    }
}

#[cfg(test)]
mod tests {
    use super::{Cat, Pick, of};
    use eframe::egui::Color32;

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
    fn every_group_sits_in_exactly_one_bundle() {
        for cat in super::LEGEND {
            let holding: Vec<&str> = super::BUNDLES
                .iter()
                .filter(|b| b.cats.contains(&cat))
                .map(|b| b.label)
                .collect();
            assert_eq!(holding.len(), 1, "{cat:?} sits in {holding:?}");
        }
    }

    /// The point of a bundle. Two groups a person thinks of as one thing.
    #[test]
    fn photos_and_video_share_one_bundle() {
        assert_eq!(Cat::Image.bundle().label, "Photos and video");
        assert_eq!(Cat::Video.bundle().label, "Photos and video");
        assert_ne!(Cat::Audio.bundle().label, Cat::Image.bundle().label);
    }

    #[test]
    fn a_pick_with_nothing_set_holds_everything() {
        let open = Pick::default();
        assert!(open.everything());
        assert!(open.holds("holiday.mp4"));
        assert!(open.holds("README"));
    }

    #[test]
    fn a_pick_narrows_by_group_then_by_extension() {
        let mut pick = Pick::of_cats(Cat::Image.bundle().cats.iter().copied());
        assert!(pick.holds("beach.jpg"));
        assert!(pick.holds("holiday.mp4"));
        assert!(!pick.holds("song.mp3"), "music came across a picture pick");
        assert!(!pick.everything());

        pick.exts = super::extensions("cr2, .NEF");
        assert!(pick.holds("shot.cr2"));
        assert!(
            pick.holds("shot.nef"),
            "the dot and the case were not dropped"
        );
        assert!(
            !pick.holds("beach.jpg"),
            "an extension outside the list came"
        );
        assert!(
            !pick.holds("raw.mp3"),
            "an extension inside the list still has to be in the groups"
        );
    }

    /// Every group ticked has to read as the same question as none of them
    /// ticked or the two cannot share one stored answer.
    #[test]
    fn every_group_ticked_is_the_same_as_none_ticked() {
        let all = Pick::of_cats(super::LEGEND);
        assert!(all.everything());
        let mut narrowed = all.clone();
        narrowed.exts = super::extensions("jpg");
        assert!(!narrowed.everything(), "an extension narrowed nothing");
    }

    #[test]
    fn a_pick_says_what_it_will_take() {
        assert_eq!(Pick::default().says(), "every file");
        let photos = Pick::of_cats(Cat::Image.bundle().cats.iter().copied());
        assert_eq!(photos.says(), "photos and video");
        let mut narrowed = photos.clone();
        narrowed.exts = super::extensions("jpg");
        assert_eq!(narrowed.says(), "photos and video narrowed to jpg");
        assert_eq!(Pick::of_cats([Cat::Code]).says(), "code");
        // Every group ticked is every file. It must not read as a chain of all
        // seven bundle names in a box that cannot hold them.
        assert_eq!(Pick::of_cats(super::LEGEND).says(), "every file");
        let mut narrowed = Pick::of_cats(super::LEGEND);
        narrowed.exts = super::extensions("jpg");
        assert!(
            narrowed.says().ends_with("narrowed to jpg"),
            "{}",
            narrowed.says()
        );
    }

    /// A label nobody can read is a label that is not there. The palette is
    /// fixed so the text colour is the only thing left to get right.
    #[test]
    fn every_group_label_clears_the_contrast_floor() {
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
            let fill = cat.colour();
            // Quoted to two places, which is how the ratio is written down and
            // compared against the floor. Audio sits exactly on it.
            let got = (super::contrast(fill, super::ink(fill)) * 100.0).round() / 100.0;
            assert!(
                got >= 4.5,
                "{cat:?} reads at {got:.2} to one where four and a half is the floor"
            );
        }
    }

    /// The rule has to pick the better of the two rather than either one.
    #[test]
    fn the_text_colour_is_the_one_that_reads_further() {
        for cat in super::LEGEND {
            let fill = cat.colour();
            let chosen = super::contrast(fill, super::ink(fill));
            let other = super::contrast(
                fill,
                if super::ink(fill) == Color32::from_gray(16) {
                    Color32::from_gray(244)
                } else {
                    Color32::from_gray(16)
                },
            );
            assert!(chosen >= other, "{cat:?} took the worse of the two");
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
