//! The two ladders and the ffmpeg call that does the encode.

use std::path::{Path, PathBuf};
use std::process::Command;

/// The heights offered when they are below the source. The list is the common
/// broadcast and web ladder. Every entry is even so x264 accepts it.
pub const LADDER: [u32; 9] = [2160, 1440, 1080, 900, 720, 576, 480, 360, 240];

/// The frame rates offered when they are below the source. Four rows is the
/// whole ladder. 30 and 24 and 15 and 10 cover video and film and a still
/// picture and the minimum. Anything else is typed at the c prompt.
pub const RATES: [f64; 4] = [30.0, 24.0, 15.0, 10.0];

/// Nothing below this is offered. Below ten frames a second the eye stops
/// reading the result as movement and starts reading it as a slide show.
pub const MIN_RATE: f64 = 10.0;

pub struct Target {
    pub width: u32,
    pub height: u32,
}

impl Target {
    /// Share of the source pixels this target keeps.
    pub fn pixel_share(&self, source: (u32, u32)) -> f64 {
        let from = (source.0 as f64) * (source.1 as f64);
        if from == 0.0 {
            return 0.0;
        }
        (self.width as f64) * (self.height as f64) / from
    }
}

pub struct Rate {
    pub value: f64,
    /// How many source frames each kept frame stands for. Some(n) means the
    /// source rate divides by a whole number so every nth frame is kept and the
    /// spacing stays even. None means the frames have to be dropped unevenly.
    pub every: Option<u32>,
}

/// Width that holds the source shape at the given height. Rounded to the
/// nearest multiple of two to match what ffmpeg does for a width of -2.
pub fn width_for(source: (u32, u32), height: u32) -> u32 {
    if source.1 == 0 {
        return 0;
    }
    let exact = (source.0 as f64) * (height as f64) / (source.1 as f64);
    let even = (exact / 2.0).round() * 2.0;
    (even as u32).max(2)
}

/// Ladder entries below the source height.
pub fn options(source: (u32, u32)) -> Vec<Target> {
    LADDER
        .iter()
        .filter(|h| **h < source.1)
        .map(|h| Target {
            width: width_for(source, *h),
            height: *h,
        })
        .collect()
}

/// A rate divides the source when the source holds a whole number of it. Two
/// rates a thousandth apart are the same rate here because a stored rate such
/// as 29.97 is really 30000/1001 and never lands exactly.
fn divides(source: f64, rate: f64) -> Option<u32> {
    if rate <= 0.0 {
        return None;
    }
    let n = source / rate;
    let whole = n.round();
    if whole >= 2.0 && (n - whole).abs() < 0.001 {
        return Some(whole as u32);
    }
    None
}

/// The rates below the source ordered from the largest down.
pub fn rate_options(source: f64) -> Vec<Rate> {
    RATES
        .iter()
        .filter(|r| **r >= MIN_RATE && **r < source - 0.001)
        .map(|r| Rate {
            value: *r,
            every: divides(source, *r),
        })
        .collect()
}

/// Half the source rate when no offered rate divides it. A source such as 25
/// has no exact row on a four row ladder so the exact one is named instead. It
/// is typed at the c prompt. None when the half is below the minimum.
pub fn exact_half(source: f64) -> Option<f64> {
    let half = source / 2.0;
    if half < MIN_RATE {
        return None;
    }
    if rate_options(source).iter().any(|r| r.every.is_some()) {
        return None;
    }
    Some(half)
}

/// A rate written the way it is spoken. A whole number loses its decimals and
/// 30000/1001 reads as 29.97.
pub fn fmt_rate(value: f64) -> String {
    if (value - value.round()).abs() < 0.005 {
        return format!("{}", value.round() as i64);
    }
    format!("{value:.3}")
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_string()
}

pub struct Job {
    pub input: PathBuf,
    pub output: PathBuf,
    /// None keeps the source height.
    pub height: Option<u32>,
    /// None keeps the source rate.
    pub fps: Option<f64>,
    pub crf: u32,
    pub preset: String,
}

impl Job {
    /// The filter chain. Frames are dropped before they are scaled. Because a)
    /// a dropped frame never has to be resampled b) the two filters are
    /// otherwise independent and c) the shorter chain is the cheaper one.
    fn filters(&self) -> Option<String> {
        let mut parts: Vec<String> = Vec::new();
        if let Some(r) = self.fps {
            parts.push(format!("fps={}", fmt_rate(r)));
        }
        if let Some(h) = self.height {
            // The width is left at -2 rather than being computed here. Because
            // a) ffmpeg has already applied the rotation and the pixel shape by
            // the time the filter runs b) it then keeps the source shape
            // exactly and c) a width divisible by two is what x264 needs.
            parts.push(format!("scale=-2:{h}:flags=lanczos"));
        }
        if parts.is_empty() {
            return None;
        }
        Some(parts.join(","))
    }

    fn args(&self) -> Vec<String> {
        let mut a: Vec<String> = Vec::new();
        for s in ["-hide_banner", "-loglevel", "error", "-stats", "-y", "-i"] {
            a.push(s.into());
        }
        a.push(self.input.display().to_string());
        if let Some(chain) = self.filters() {
            a.push("-vf".into());
            a.push(chain);
        }
        for s in ["-c:v", "libx264", "-preset"] {
            a.push(s.into());
        }
        a.push(self.preset.clone());
        a.push("-crf".into());
        a.push(self.crf.to_string());
        for s in [
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "copy",
            "-movflags",
            "+faststart",
        ] {
            a.push(s.into());
        }
        a.push(self.output.display().to_string());
        a
    }

    /// The call as a reader can retype it.
    pub fn command_line(&self) -> String {
        let mut out = String::from("ffmpeg");
        for a in self.args() {
            out.push(' ');
            if a.contains(' ') {
                out.push_str(&format!("'{a}'"));
            } else {
                out.push_str(&a);
            }
        }
        out
    }

    /// Runs the encode with the ffmpeg progress line left on the terminal.
    pub fn run(&self) -> Result<(), String> {
        let status = Command::new("ffmpeg")
            .args(self.args())
            .status()
            .map_err(|e| format!("ffmpeg would not start. {e}"))?;
        if status.success() {
            return Ok(());
        }
        Err(match status.code() {
            Some(c) => format!("ffmpeg exited {c}"),
            None => "ffmpeg was killed by a signal".to_string(),
        })
    }
}

/// True when an ffmpeg is on the path.
pub fn have_ffmpeg() -> bool {
    Command::new("ffmpeg")
        .args(["-hide_banner", "-version"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Default name for the encode. It lands beside the source and says what was
/// changed.
pub fn default_output(input: &Path, height: Option<u32>, fps: Option<f64>) -> PathBuf {
    let stem = input
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "video".into());
    let mut name = stem;
    if let Some(h) = height {
        name.push_str(&format!("-{h}p"));
    }
    if let Some(r) = fps {
        name.push_str(&format!("-{}fps", fmt_rate(r)));
    }
    name.push_str(".mp4");
    input.with_file_name(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn holds_sixteen_by_nine() {
        assert_eq!(width_for((1920, 1080), 720), 1280);
        assert_eq!(width_for((1920, 1080), 480), 854);
    }

    #[test]
    fn holds_a_portrait_shape() {
        assert_eq!(width_for((1080, 1920), 720), 406);
    }

    #[test]
    fn offers_only_smaller_heights() {
        let got = options((1920, 1080));
        assert_eq!(
            got.iter().map(|t| t.height).collect::<Vec<_>>(),
            vec![900, 720, 576, 480, 360, 240]
        );
    }

    #[test]
    fn offers_nothing_below_the_smallest_rung() {
        assert!(options((320, 240)).is_empty());
    }

    #[test]
    fn quarter_of_the_pixels_at_half_the_height() {
        let t = Target {
            width: 960,
            height: 540,
        };
        assert!((t.pixel_share((1920, 1080)) - 0.25).abs() < 1e-9);
    }

    fn values(rates: &[Rate]) -> Vec<String> {
        rates.iter().map(|r| fmt_rate(r.value)).collect()
    }

    #[test]
    fn offers_four_rates_at_most() {
        assert_eq!(values(&rate_options(60.0)), vec!["30", "24", "15", "10"]);
        assert_eq!(values(&rate_options(30.0)), vec!["24", "15", "10"]);
        assert_eq!(values(&rate_options(24.0)), vec!["15", "10"]);
        assert_eq!(values(&rate_options(12.0)), vec!["10"]);
    }

    #[test]
    fn marks_which_rates_divide_the_source() {
        let got = rate_options(60.0);
        let even: Vec<String> = got
            .iter()
            .filter(|r| r.every.is_some())
            .map(|r| fmt_rate(r.value))
            .collect();
        assert_eq!(even, vec!["30", "15", "10"]);
        assert_eq!(got[0].every, Some(2));
        assert_eq!(got[1].every, None);
    }

    #[test]
    fn marks_nothing_even_for_an_ntsc_source() {
        // 15 looks like the half of 29.97 and is not.
        let got = rate_options(30000.0 / 1001.0);
        assert_eq!(values(&got), vec!["24", "15", "10"]);
        assert!(got.iter().all(|r| r.every.is_none()));
    }

    #[test]
    fn names_the_exact_half_only_when_no_row_divides() {
        assert_eq!(exact_half(60.0), None);
        assert_eq!(exact_half(30.0), None);
        assert_eq!(exact_half(25.0), Some(12.5));
        assert!((exact_half(30000.0 / 1001.0).unwrap() - 14.985).abs() < 0.001);
        // Half of 19 is below the minimum so there is nothing to name.
        assert_eq!(exact_half(19.0), None);
    }

    #[test]
    fn stops_at_the_minimum() {
        assert!(rate_options(60.0).iter().all(|r| r.value >= MIN_RATE));
        assert!(rate_options(12.0).iter().all(|r| r.value >= MIN_RATE));
        assert!(rate_options(10.0).is_empty());
        assert!(rate_options(9.0).is_empty());
    }

    #[test]
    fn never_offers_the_source_rate_back() {
        assert!(rate_options(24.0).iter().all(|r| r.value < 24.0));
    }

    #[test]
    fn writes_a_rate_the_way_it_is_spoken() {
        assert_eq!(fmt_rate(30.0), "30");
        assert_eq!(fmt_rate(30000.0 / 1001.0), "29.97");
        assert_eq!(fmt_rate(14.985), "14.985");
    }

    #[test]
    fn names_the_output_beside_the_source() {
        let at = Path::new("/tmp/clip.mp4");
        assert_eq!(
            default_output(at, Some(720), None),
            Path::new("/tmp/clip-720p.mp4")
        );
        assert_eq!(
            default_output(at, None, Some(24.0)),
            Path::new("/tmp/clip-24fps.mp4")
        );
        assert_eq!(
            default_output(at, Some(720), Some(24.0)),
            Path::new("/tmp/clip-720p-24fps.mp4")
        );
    }

    fn job(height: Option<u32>, fps: Option<f64>) -> Job {
        Job {
            input: "in.mp4".into(),
            output: "out.mp4".into(),
            height,
            fps,
            crf: 23,
            preset: "medium".into(),
        }
    }

    #[test]
    fn drops_the_frames_before_it_scales_them() {
        assert_eq!(
            job(Some(720), Some(24.0)).filters().unwrap(),
            "fps=24,scale=-2:720:flags=lanczos"
        );
    }

    #[test]
    fn leaves_out_the_filter_that_was_not_asked_for() {
        assert_eq!(
            job(Some(720), None).filters().unwrap(),
            "scale=-2:720:flags=lanczos"
        );
        assert_eq!(job(None, Some(15.0)).filters().unwrap(), "fps=15");
        assert!(job(None, None).filters().is_none());
    }

    #[test]
    fn the_command_line_carries_both_changes() {
        let line = job(Some(720), Some(24.0)).command_line();
        assert!(line.contains("-vf fps=24,scale=-2:720:flags=lanczos"));
        assert!(line.contains("-crf 23"));
    }
}
