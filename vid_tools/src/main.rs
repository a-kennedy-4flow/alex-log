//! vidscale. Reports the resolution and the frame rate of an mp4 then offers
//! the lower rungs of both ladders then encodes the file at what is picked.

mod mp4;
mod scale;

use std::io::{IsTerminal, Write};
use std::path::PathBuf;
use std::process::ExitCode;

const USAGE: &str = "\
vidscale. Reads the resolution and the frame rate of an mp4 then reduces either.

usage: vidscale <file.mp4> [options]

options:
  --height <n>     Skip the menus and encode at this height.
  --fps <n>        Skip the menus and encode at this frame rate. 10 is the minimum.
  --output <path>  Where to write. Defaults to <name>-<height>p-<n>fps.mp4 beside the source.
  --crf <n>        x264 quality. 18 is near lossless and 28 is small. Default 23.
  --preset <name>  x264 speed. ultrafast to veryslow. Default medium.
  --list           Print the resolution and the frame rate and the choices then stop.
  --dry-run        Print the ffmpeg call then stop.
  --yes            Overwrite the output when it already exists.
  --help           This text.

The menus only appear when neither --height nor --fps is given.
";

/// What the user did with one menu.
enum Choice<T> {
    Take(T),
    Keep,
    Quit,
}

struct Args {
    input: PathBuf,
    height: Option<u32>,
    fps: Option<f64>,
    output: Option<PathBuf>,
    crf: u32,
    preset: String,
    list: bool,
    dry_run: bool,
    yes: bool,
}

/// None means the usage was asked for and nothing else should happen.
fn parse(argv: Vec<String>) -> Result<Option<Args>, String> {
    let mut input: Option<PathBuf> = None;
    let mut height = None;
    let mut fps = None;
    let mut output = None;
    let mut crf = 23;
    let mut preset = String::from("medium");
    let mut list = false;
    let mut dry_run = false;
    let mut yes = false;

    let mut it = argv.into_iter();
    while let Some(a) = it.next() {
        let mut value = |name: &str| -> Result<String, String> {
            it.next().ok_or(format!("{name} needs a value"))
        };
        match a.as_str() {
            "--help" | "-h" => return Ok(None),
            "--height" => {
                let v = value("--height")?;
                height = Some(v.parse().map_err(|_| format!("{v} is not a height"))?);
            }
            "--fps" => {
                let v = value("--fps")?;
                let r: f64 = v.parse().map_err(|_| format!("{v} is not a frame rate"))?;
                if !r.is_finite() {
                    return Err(format!("{v} is not a frame rate"));
                }
                fps = Some(r);
            }
            "--output" | "-o" => output = Some(PathBuf::from(value("--output")?)),
            "--crf" => {
                let v = value("--crf")?;
                crf = v.parse().map_err(|_| format!("{v} is not a crf"))?;
            }
            "--preset" => preset = value("--preset")?,
            "--list" => list = true,
            "--dry-run" => dry_run = true,
            "--yes" | "-y" => yes = true,
            other if other.starts_with('-') => return Err(format!("unknown option {other}")),
            other => {
                if input.is_some() {
                    return Err(format!("only one input is taken so {other} is extra"));
                }
                input = Some(PathBuf::from(other));
            }
        }
    }

    let input = input.ok_or("no input file given")?;
    if !(1..=51).contains(&crf) {
        return Err(format!("crf {crf} is outside 1 to 51"));
    }
    Ok(Some(Args {
        input,
        height,
        fps,
        output,
        crf,
        preset,
        list,
        dry_run,
        yes,
    }))
}

fn human(bytes: u64) -> String {
    let b = bytes as f64;
    if b >= 1e9 {
        return format!("{:.2} GB", b / 1e9);
    }
    if b >= 1e6 {
        return format!("{:.1} MB", b / 1e6);
    }
    format!("{:.1} kB", b / 1e3)
}

fn ask(prompt: &str) -> Result<String, String> {
    print!("{prompt}");
    std::io::stdout().flush().map_err(|e| e.to_string())?;
    let mut line = String::new();
    let read = std::io::stdin()
        .read_line(&mut line)
        .map_err(|e| e.to_string())?;
    if read == 0 {
        return Ok(String::new());
    }
    Ok(line.trim().to_string())
}

/// Reads an answer for a menu of n rows. An empty line quits.
fn pick(rows: usize) -> Result<Choice<usize>, String> {
    loop {
        match ask("> ")?.as_str() {
            "" | "q" => return Ok(Choice::Quit),
            "k" => return Ok(Choice::Keep),
            "c" => return Ok(Choice::Take(usize::MAX)),
            other => match other.parse::<usize>() {
                Ok(n) if n >= 1 && n <= rows => return Ok(Choice::Take(n - 1)),
                _ => println!("pick 1 to {rows} or c or k or q"),
            },
        }
    }
}

/// Puts the resolution menu up and returns the chosen height.
fn choose_height(source: (u32, u32), choices: &[scale::Target]) -> Result<Choice<u32>, String> {
    println!("\nchoose a resolution");
    for (i, t) in choices.iter().enumerate() {
        println!(
            "  {:>2}) {:>5}p  {:>4} x {:<4}  {:>3}% of the pixels",
            i + 1,
            t.height,
            t.width,
            t.height,
            (t.pixel_share(source) * 100.0).round() as u32
        );
    }
    println!("   c) another height");
    println!("   k) keep {} x {}", source.0, source.1);
    println!("   q) quit");

    match pick(choices.len())? {
        Choice::Quit => Ok(Choice::Quit),
        Choice::Keep => Ok(Choice::Keep),
        Choice::Take(usize::MAX) => {
            let raw = ask("height in pixels: ")?;
            let want: u32 = raw.parse().map_err(|_| format!("{raw} is not a height"))?;
            Ok(Choice::Take(check_height(want, source)?))
        }
        Choice::Take(i) => Ok(Choice::Take(choices[i].height)),
    }
}

/// Puts the frame rate menu up and returns the chosen rate. The note under the
/// list is the point of the menu. A rate is only worth taking when it divides
/// the source.
fn choose_rate(source: f64, choices: &[scale::Rate]) -> Result<Choice<f64>, String> {
    let shown = scale::fmt_rate(source);
    println!("\nchoose a frame rate");
    for (i, r) in choices.iter().enumerate() {
        let note = match r.every {
            Some(n) => format!("keeps 1 frame in {n}"),
            None => format!("does not divide {shown} so the motion stutters"),
        };
        println!(
            "  {:>2}) {:>6} fps  {}",
            i + 1,
            scale::fmt_rate(r.value),
            note
        );
    }
    println!("   c) another rate");
    println!("   k) keep {shown} fps");
    println!("   q) quit");
    println!(
        "a rate that divides {shown} exactly keeps one frame in every n so the frames\n\
         that are left stay evenly spaced. a rate that does not divide it has to drop\n\
         frames unevenly and the motion stutters. take an exact one where there is one.\n\
         {} is the minimum offered because below that the eye stops reading the result\n\
         as movement. halving the rate takes about a third off the size rather than half\n\
         so the resolution is the better cut when the size is all that matters.",
        scale::fmt_rate(scale::MIN_RATE)
    );
    if let Some(half) = scale::exact_half(source) {
        println!(
            "no row divides {shown} exactly. c takes {} which is the exact half.",
            scale::fmt_rate(half)
        );
    }

    match pick(choices.len())? {
        Choice::Quit => Ok(Choice::Quit),
        Choice::Keep => Ok(Choice::Keep),
        Choice::Take(usize::MAX) => {
            let raw = ask("frames a second: ")?;
            let want: f64 = raw
                .parse()
                .map_err(|_| format!("{raw} is not a frame rate"))?;
            Ok(Choice::Take(check_rate(want, Some(source))?))
        }
        Choice::Take(i) => Ok(Choice::Take(choices[i].value)),
    }
}

/// A height only works when it is under the source and divisible by two.
fn check_height(want: u32, source: (u32, u32)) -> Result<u32, String> {
    if want < 16 {
        return Err(format!("{want} is too small to encode"));
    }
    if want >= source.1 {
        return Err(format!(
            "{want} is not below the source height of {}",
            source.1
        ));
    }
    if want % 2 == 1 {
        return Err(format!("{want} is odd and x264 needs an even height"));
    }
    Ok(want)
}

/// A rate only works when it is at or above the minimum and under the source.
/// The source rate is unknown for a file with no timing boxes so that check is
/// skipped there.
fn check_rate(want: f64, source: Option<f64>) -> Result<f64, String> {
    if !want.is_finite() || want < scale::MIN_RATE {
        return Err(format!(
            "{} is below the minimum of {}",
            scale::fmt_rate(want),
            scale::fmt_rate(scale::MIN_RATE)
        ));
    }
    if let Some(s) = source
        && want >= s - 0.001
    {
        return Err(format!(
            "{} is not below the source rate of {}",
            scale::fmt_rate(want),
            scale::fmt_rate(s)
        ));
    }
    Ok(want)
}

/// What the encode is going to do written for a person.
fn describe(source: (u32, u32), height: Option<u32>, fps: Option<f64>) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(h) = height {
        parts.push(format!("{} x {}", scale::width_for(source, h), h));
    }
    if let Some(r) = fps {
        parts.push(format!("{} fps", scale::fmt_rate(r)));
    }
    parts.join(" at ")
}

fn run() -> Result<(), String> {
    let Some(args) = parse(std::env::args().skip(1).collect())? else {
        print!("{USAGE}");
        return Ok(());
    };

    let size = std::fs::metadata(&args.input)
        .map_err(|e| format!("{}. {e}", args.input.display()))?
        .len();
    let video = mp4::probe(&args.input).map_err(|e| format!("{}. {e}", args.input.display()))?;
    let source = video.display;

    println!("{}", args.input.display());
    println!("  resolution  {} x {}", source.0, source.1);
    match video.fps {
        Some(r) => println!("  frame rate  {} fps", scale::fmt_rate(r)),
        None => println!("  frame rate  unknown"),
    }
    if video.rotation != 0 {
        println!("  rotation    {} degrees", video.rotation);
    }
    if video.coded != source {
        println!("  coded frame {} x {}", video.coded.0, video.coded.1);
    }
    println!("  file size   {}", human(size));

    let heights = scale::options(source);
    let rates = video.fps.map(scale::rate_options).unwrap_or_default();

    if args.list {
        for t in &heights {
            println!("{:>5}p  {} x {}", t.height, t.width, t.height);
        }
        for r in &rates {
            let note = match r.every {
                Some(n) => format!("keeps 1 frame in {n}"),
                None => "uneven".to_string(),
            };
            println!("{:>6} fps  {}", scale::fmt_rate(r.value), note);
        }
        return Ok(());
    }

    let asked = args.height.is_some() || args.fps.is_some();
    if !asked && heights.is_empty() && rates.is_empty() {
        println!("\nthere is no lower resolution or frame rate to offer");
        return Ok(());
    }

    let (height, fps) = if asked {
        let height = args.height.map(|h| check_height(h, source)).transpose()?;
        let fps = args.fps.map(|r| check_rate(r, video.fps)).transpose()?;
        (height, fps)
    } else {
        if !std::io::stdin().is_terminal() {
            return Err("stdin is not a terminal so pass --height or --fps".into());
        }
        let height = if heights.is_empty() {
            None
        } else {
            match choose_height(source, &heights)? {
                Choice::Take(h) => Some(h),
                Choice::Keep => None,
                Choice::Quit => return Ok(()),
            }
        };
        let fps = match (video.fps, rates.is_empty()) {
            (Some(src), false) => match choose_rate(src, &rates)? {
                Choice::Take(r) => Some(r),
                Choice::Keep => None,
                Choice::Quit => return Ok(()),
            },
            _ => None,
        };
        (height, fps)
    };

    if height.is_none() && fps.is_none() {
        println!("\nnothing to change");
        return Ok(());
    }

    let output = args
        .output
        .unwrap_or_else(|| scale::default_output(&args.input, height, fps));
    if output == args.input {
        return Err("the output would overwrite the source".into());
    }
    if output.exists() && !args.yes {
        return Err(format!(
            "{} already exists. pass --yes to overwrite",
            output.display()
        ));
    }

    let job = scale::Job {
        input: args.input.clone(),
        output: output.clone(),
        height,
        fps,
        crf: args.crf,
        preset: args.preset,
    };

    if args.dry_run {
        println!("{}", job.command_line());
        return Ok(());
    }
    if !scale::have_ffmpeg() {
        return Err("ffmpeg is not on the path".into());
    }

    println!(
        "\nencoding {} to {}",
        describe(source, height, fps),
        output.display()
    );
    job.run()?;

    let after = std::fs::metadata(&output).map_err(|e| e.to_string())?.len();
    let saved = 100.0 - (after as f64) * 100.0 / (size as f64);
    println!(
        "{} is {} and that is {:.0}% smaller",
        output.display(),
        human(after),
        saved
    );
    Ok(())
}

/// Restores the default handling of a broken pipe. Rust masks the signal at
/// startup so a print into a closed pipe panics instead. `vidscale --list x |
/// head` is the case that hits it. The libc crate is not taken as a dependency
/// for one call so the symbol is declared here.
#[cfg(unix)]
fn die_quietly_on_a_closed_pipe() {
    const SIGPIPE: i32 = 13;
    const SIG_DFL: usize = 0;
    unsafe extern "C" {
        fn signal(sig: i32, handler: usize) -> usize;
    }
    unsafe {
        signal(SIGPIPE, SIG_DFL);
    }
}

#[cfg(not(unix))]
fn die_quietly_on_a_closed_pipe() {}

fn main() -> ExitCode {
    die_quietly_on_a_closed_pipe();
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("vidscale: {e}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Result<Option<Args>, String> {
        parse(list.iter().map(|s| s.to_string()).collect())
    }

    #[test]
    fn takes_the_file_and_the_defaults() {
        let a = args(&["clip.mp4"]).unwrap().unwrap();
        assert_eq!(a.input, PathBuf::from("clip.mp4"));
        assert_eq!(a.crf, 23);
        assert_eq!(a.preset, "medium");
        assert!(a.height.is_none());
        assert!(a.fps.is_none());
    }

    #[test]
    fn takes_every_option() {
        let a = args(&[
            "--height", "720", "clip.mp4", "--crf", "20", "-o", "out.mp4", "-y", "--fps", "24",
        ])
        .unwrap()
        .unwrap();
        assert_eq!(a.height, Some(720));
        assert_eq!(a.fps, Some(24.0));
        assert_eq!(a.crf, 20);
        assert_eq!(a.output, Some(PathBuf::from("out.mp4")));
        assert!(a.yes);
    }

    #[test]
    fn refuses_a_second_input() {
        assert!(args(&["a.mp4", "b.mp4"]).is_err());
    }

    #[test]
    fn refuses_an_unknown_option() {
        assert!(args(&["--turbo", "a.mp4"]).is_err());
    }

    #[test]
    fn refuses_a_crf_off_the_scale() {
        assert!(args(&["a.mp4", "--crf", "99"]).is_err());
    }

    #[test]
    fn refuses_a_rate_that_is_not_a_number() {
        assert!(args(&["a.mp4", "--fps", "soon"]).is_err());
        assert!(args(&["a.mp4", "--fps", "inf"]).is_err());
    }

    #[test]
    fn help_stops_the_run() {
        assert!(args(&["--help"]).unwrap().is_none());
    }

    #[test]
    fn a_height_has_to_be_even_and_smaller() {
        assert!(check_height(720, (1920, 1080)).is_ok());
        assert!(check_height(1080, (1920, 1080)).is_err());
        assert!(check_height(721, (1920, 1080)).is_err());
        assert!(check_height(8, (1920, 1080)).is_err());
    }

    #[test]
    fn a_rate_has_to_reach_the_minimum_and_stay_under_the_source() {
        assert!(check_rate(24.0, Some(30.0)).is_ok());
        assert!(check_rate(10.0, Some(30.0)).is_ok());
        assert!(check_rate(9.9, Some(30.0)).is_err());
        assert!(check_rate(30.0, Some(30.0)).is_err());
        assert!(check_rate(60.0, Some(30.0)).is_err());
    }

    #[test]
    fn an_unknown_source_rate_only_drops_the_upper_check() {
        assert!(check_rate(60.0, None).is_ok());
        assert!(check_rate(5.0, None).is_err());
    }

    #[test]
    fn sizes_read_as_people_write_them() {
        assert_eq!(human(1_500), "1.5 kB");
        assert_eq!(human(12_400_000), "12.4 MB");
        assert_eq!(human(2_500_000_000), "2.50 GB");
    }

    #[test]
    fn says_what_the_encode_will_do() {
        let at = (1920, 1080);
        assert_eq!(describe(at, Some(720), Some(24.0)), "1280 x 720 at 24 fps");
        assert_eq!(describe(at, Some(720), None), "1280 x 720");
        assert_eq!(describe(at, None, Some(15.0)), "15 fps");
    }
}
