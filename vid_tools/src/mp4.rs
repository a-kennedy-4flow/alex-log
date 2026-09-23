//! Reads the frame size out of an mp4 header.
//!
//! An mp4 is a tree of boxes. A box is a 32 bit size then a four byte type then
//! its payload. The size counts the header too. A size of 1 means the real size
//! is a 64 bit field sitting after the type. A size of 0 means the box runs to
//! the end of its parent. Only the header of each box is read here so the walk
//! costs the same on a file of any length.

use std::fmt;
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::Path;

/// What the first video track of the file says about its frame.
pub struct Video {
    /// Frame size the encoder wrote.
    pub coded: (u32, u32),
    /// Frame size a player puts on screen. A rotation or a non square pixel
    /// moves it away from the coded size.
    pub display: (u32, u32),
    /// Clockwise degrees taken from the track matrix. One of 0 90 180 270.
    pub rotation: u32,
    /// Mean frames per second over the whole track. None when the timing boxes
    /// are missing. It is a mean so a variable rate source reports its average.
    pub fps: Option<f64>,
}

#[derive(Debug)]
pub enum Error {
    Io(io::Error),
    NoMoov,
    NoVideoTrack,
    Short(&'static str),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Io(e) => write!(f, "{e}"),
            Error::NoMoov => write!(f, "no moov box so this is not a readable mp4"),
            Error::NoVideoTrack => write!(f, "the file holds no video track"),
            Error::Short(what) => write!(f, "the {what} box is truncated"),
        }
    }
}

impl From<io::Error> for Error {
    fn from(e: io::Error) -> Self {
        Error::Io(e)
    }
}

struct Atom {
    kind: [u8; 4],
    /// Payload bounds. The header is already excluded.
    start: u64,
    end: u64,
}

impl Atom {
    fn len(&self) -> u64 {
        self.end - self.start
    }
}

/// Lists the boxes between two offsets. A malformed size ends the list rather
/// than failing the read. Because a) a trailing partial box is common in a file
/// still being written and b) the boxes already read are still usable.
fn children(f: &mut File, start: u64, end: u64) -> io::Result<Vec<Atom>> {
    let mut out = Vec::new();
    let mut pos = start;
    while pos + 8 <= end {
        f.seek(SeekFrom::Start(pos))?;
        let mut head = [0u8; 8];
        f.read_exact(&mut head)?;
        let mut size = u32::from_be_bytes(head[0..4].try_into().unwrap()) as u64;
        let kind: [u8; 4] = head[4..8].try_into().unwrap();
        let mut body = pos + 8;
        if size == 1 {
            let mut big = [0u8; 8];
            f.read_exact(&mut big)?;
            size = u64::from_be_bytes(big);
            body = pos + 16;
        } else if size == 0 {
            size = end - pos;
        }
        if size < body - pos || pos + size > end {
            break;
        }
        out.push(Atom {
            kind,
            start: body,
            end: pos + size,
        });
        pos += size;
    }
    Ok(out)
}

fn find<'a>(list: &'a [Atom], kind: &[u8; 4]) -> Option<&'a Atom> {
    list.iter().find(|a| &a.kind == kind)
}

/// Reads the front of a payload. A box such as stbl carries megabytes of tables
/// after the fields wanted here so the read is capped.
fn head_of(f: &mut File, atom: &Atom, want: usize) -> io::Result<Vec<u8>> {
    let take = want.min(atom.len() as usize);
    let mut buf = vec![0u8; take];
    f.seek(SeekFrom::Start(atom.start))?;
    f.read_exact(&mut buf)?;
    Ok(buf)
}

fn be32(b: &[u8], at: usize) -> u32 {
    u32::from_be_bytes(b[at..at + 4].try_into().unwrap())
}

fn be16(b: &[u8], at: usize) -> u32 {
    u16::from_be_bytes(b[at..at + 2].try_into().unwrap()) as u32
}

/// A 16.16 fixed point field rounded to whole pixels.
fn fixed(b: &[u8], at: usize) -> u32 {
    (be32(b, at) as f64 / 65536.0).round() as u32
}

/// Rotation from the first two cells of the 3x3 track matrix. The cells are
/// named a and b in the specification and both are 16.16 signed. The angle is
/// the negated arctangent of b over a so the number matches the one ffprobe
/// prints for the same file. Anything off a quarter turn is snapped to the
/// nearest quarter because a player only turns by quarters.
fn rotation_of(buf: &[u8], at: usize) -> u32 {
    let a = be32(buf, at) as i32 as f64;
    let b = be32(buf, at + 4) as i32 as f64;
    let deg = -b.atan2(a).to_degrees().round() as i32;
    let quarter = ((deg + 45).div_euclid(90) * 90).rem_euclid(360);
    quarter as u32
}

/// Mean frame rate of a track. The media header carries the unit of time and
/// the time to sample table carries a run length encoding of the gaps between
/// frames. The rate is the sample count over the time those samples span.
fn frame_rate(f: &mut File, media: &[Atom], tables: &[Atom]) -> io::Result<Option<f64>> {
    let Some(mdhd) = find(media, b"mdhd") else {
        return Ok(None);
    };
    let head = head_of(f, mdhd, 32)?;
    let at = if head.first() == Some(&1) { 20 } else { 12 };
    if head.len() < at + 4 {
        return Ok(None);
    }
    let timescale = be32(&head, at);

    let Some(stts) = find(tables, b"stts") else {
        return Ok(None);
    };
    // A constant rate track holds one entry. A variable rate track holds one
    // per run. The read is capped because the box is otherwise unbounded.
    let table = head_of(f, stts, 8 << 20)?;
    if table.len() < 8 {
        return Ok(None);
    }
    let entries = (be32(&table, 4) as usize).min((table.len() - 8) / 8);
    let mut samples: u64 = 0;
    let mut span: u64 = 0;
    for i in 0..entries {
        let count = be32(&table, 8 + i * 8) as u64;
        let delta = be32(&table, 12 + i * 8) as u64;
        samples += count;
        span += count * delta;
    }
    if span == 0 || timescale == 0 {
        return Ok(None);
    }
    Ok(Some(samples as f64 * timescale as f64 / span as f64))
}

/// Frame size and rotation and rate of the first video track of an mp4.
pub fn probe(path: &Path) -> Result<Video, Error> {
    let mut f = File::open(path)?;
    let end = f.metadata()?.len();
    let top = children(&mut f, 0, end)?;
    let moov = find(&top, b"moov").ok_or(Error::NoMoov)?;
    let moov = children(&mut f, moov.start, moov.end)?;

    for trak in moov.iter().filter(|a| &a.kind == b"trak") {
        let parts = children(&mut f, trak.start, trak.end)?;
        let Some(mdia) = find(&parts, b"mdia") else {
            continue;
        };
        let media = children(&mut f, mdia.start, mdia.end)?;
        let Some(hdlr) = find(&media, b"hdlr") else {
            continue;
        };
        let bytes = head_of(&mut f, hdlr, 12)?;
        if bytes.len() < 12 || &bytes[8..12] != b"vide" {
            continue;
        }

        let minf = find(&media, b"minf").ok_or(Error::NoVideoTrack)?;
        let inside = children(&mut f, minf.start, minf.end)?;
        let stbl = find(&inside, b"stbl").ok_or(Error::NoVideoTrack)?;
        let tables = children(&mut f, stbl.start, stbl.end)?;
        let fps = frame_rate(&mut f, &media, &tables)?;
        let stsd = find(&tables, b"stsd").ok_or(Error::NoVideoTrack)?;
        let bytes = head_of(&mut f, stsd, 44)?;
        if bytes.len() < 44 {
            return Err(Error::Short("stsd"));
        }
        // 8 bytes of version and entry count then the sample entry. Width and
        // height sit 32 bytes into that entry.
        let coded = (be16(&bytes, 40), be16(&bytes, 42));

        let mut display = coded;
        let mut rotation = 0;
        if let Some(tkhd) = find(&parts, b"tkhd") {
            let bytes = head_of(&mut f, tkhd, 96)?;
            let at = if bytes.first() == Some(&1) { 52 } else { 40 };
            if bytes.len() < at + 44 {
                return Err(Error::Short("tkhd"));
            }
            rotation = rotation_of(&bytes, at);
            let shown = (fixed(&bytes, at + 36), fixed(&bytes, at + 40));
            // The track size is authoritative for what a player draws. It is
            // zero on some muxers so the coded size stands in for it.
            if shown.0 > 0 && shown.1 > 0 {
                display = shown;
            }
        }
        if rotation == 90 || rotation == 270 {
            display = (display.1, display.0);
        }
        return Ok(Video {
            coded,
            display,
            rotation,
            fps,
        });
    }
    Err(Error::NoVideoTrack)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn atom(kind: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        let mut out = ((payload.len() + 8) as u32).to_be_bytes().to_vec();
        out.extend_from_slice(kind);
        out.extend_from_slice(payload);
        out
    }

    /// Version 0 tkhd. Forty bytes of fields then the matrix then the size.
    fn tkhd(matrix: [u32; 9], w: u32, h: u32) -> Vec<u8> {
        let mut p = vec![0u8; 40];
        for cell in matrix {
            p.extend_from_slice(&cell.to_be_bytes());
        }
        p.extend_from_slice(&(w << 16).to_be_bytes());
        p.extend_from_slice(&(h << 16).to_be_bytes());
        p
    }

    /// One avc1 sample entry. Width and height sit 32 bytes into the entry.
    fn stsd(w: u32, h: u32) -> Vec<u8> {
        let mut p = vec![0u8; 40];
        p[4..8].copy_from_slice(&1u32.to_be_bytes());
        p[8..12].copy_from_slice(&86u32.to_be_bytes());
        p[12..16].copy_from_slice(b"avc1");
        p.extend_from_slice(&(w as u16).to_be_bytes());
        p.extend_from_slice(&(h as u16).to_be_bytes());
        p.extend_from_slice(&[0u8; 50]);
        p
    }

    /// Version 0 mdhd. The unit of time sits twelve bytes in.
    fn mdhd(timescale: u32) -> Vec<u8> {
        let mut p = vec![0u8; 12];
        p.extend_from_slice(&timescale.to_be_bytes());
        p.extend_from_slice(&[0u8; 8]);
        p
    }

    /// One run of samples that share a gap.
    fn stts(count: u32, delta: u32) -> Vec<u8> {
        let mut p = vec![0u8; 4];
        p.extend_from_slice(&1u32.to_be_bytes());
        p.extend_from_slice(&count.to_be_bytes());
        p.extend_from_slice(&delta.to_be_bytes());
        p
    }

    /// Timing is the unit of time then the sample count then the gap. None
    /// leaves both timing boxes out so the rate cannot be worked out.
    fn trak(
        handler: &[u8; 4],
        tkhd_body: Vec<u8>,
        stsd_body: Vec<u8>,
        timing: Option<(u32, u32, u32)>,
    ) -> Vec<u8> {
        let mut hdlr = vec![0u8; 8];
        hdlr.extend_from_slice(handler);
        hdlr.extend_from_slice(&[0u8; 12]);
        let mut tables = atom(b"stsd", &stsd_body);
        let mut mdia = atom(b"hdlr", &hdlr);
        if let Some((timescale, count, delta)) = timing {
            tables.extend_from_slice(&atom(b"stts", &stts(count, delta)));
            mdia = atom(b"mdhd", &mdhd(timescale));
            mdia.extend_from_slice(&atom(b"hdlr", &hdlr));
        }
        let minf = atom(b"minf", &atom(b"stbl", &tables));
        mdia.extend_from_slice(&minf);
        let mut body = atom(b"tkhd", &tkhd_body);
        body.extend_from_slice(&atom(b"mdia", &mdia));
        atom(b"trak", &body)
    }

    const FLAT: [u32; 9] = [0x0001_0000, 0, 0, 0, 0x0001_0000, 0, 0, 0, 0x4000_0000];
    /// What ffmpeg writes for a quarter turn. ffprobe calls this one 90.
    const TURNED: [u32; 9] = [0, 0xFFFF_0000, 0, 0x0001_0000, 0, 0, 0, 0, 0x4000_0000];
    const TURNED_BACK: [u32; 9] = [0, 0x0001_0000, 0, 0xFFFF_0000, 0, 0, 0, 0, 0x4000_0000];

    fn write(name: &str, moov_body: &[u8]) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("vidscale-{name}-{}.mp4", std::process::id()));
        let mut f = File::create(&path).unwrap();
        f.write_all(&atom(b"ftyp", b"isom\0\0\x02\0isomiso2"))
            .unwrap();
        f.write_all(&atom(b"moov", moov_body)).unwrap();
        path
    }

    #[test]
    fn reads_an_upright_track() {
        let body = trak(b"vide", tkhd(FLAT, 1920, 1080), stsd(1920, 1080), None);
        let path = write("upright", &body);
        let v = probe(&path).unwrap();
        assert_eq!(v.coded, (1920, 1080));
        assert_eq!(v.display, (1920, 1080));
        assert_eq!(v.rotation, 0);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn swaps_a_quarter_turn() {
        let body = trak(b"vide", tkhd(TURNED, 1920, 1080), stsd(1920, 1080), None);
        let path = write("turned", &body);
        let v = probe(&path).unwrap();
        assert_eq!(v.coded, (1920, 1080));
        assert_eq!(v.display, (1080, 1920));
        assert_eq!(v.rotation, 90);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn swaps_three_quarters_too() {
        let body = trak(
            b"vide",
            tkhd(TURNED_BACK, 1920, 1080),
            stsd(1920, 1080),
            None,
        );
        let path = write("turned-back", &body);
        let v = probe(&path).unwrap();
        assert_eq!(v.display, (1080, 1920));
        assert_eq!(v.rotation, 270);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn works_out_a_whole_frame_rate() {
        // 300 samples of 1001 ticks each at 30000 ticks a second.
        let body = trak(
            b"vide",
            tkhd(FLAT, 1920, 1080),
            stsd(1920, 1080),
            Some((30000, 300, 1001)),
        );
        let path = write("ntsc", &body);
        let v = probe(&path).unwrap();
        assert!((v.fps.unwrap() - 29.97).abs() < 0.01);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn leaves_the_rate_unknown_without_the_timing_boxes() {
        let body = trak(b"vide", tkhd(FLAT, 640, 480), stsd(640, 480), None);
        let path = write("untimed", &body);
        assert!(probe(&path).unwrap().fps.is_none());
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn keeps_a_wide_track_size() {
        // Anamorphic. The pixels are not square so the track size is wider than
        // the coded frame.
        let body = trak(b"vide", tkhd(FLAT, 1024, 576), stsd(720, 576), None);
        let path = write("anamorphic", &body);
        let v = probe(&path).unwrap();
        assert_eq!(v.coded, (720, 576));
        assert_eq!(v.display, (1024, 576));
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn skips_the_audio_track() {
        let mut body = trak(b"soun", tkhd(FLAT, 0, 0), stsd(0, 0), None);
        body.extend_from_slice(&trak(b"vide", tkhd(FLAT, 640, 480), stsd(640, 480), None));
        let path = write("audio-first", &body);
        let v = probe(&path).unwrap();
        assert_eq!(v.display, (640, 480));
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn rejects_a_file_with_no_moov() {
        let path = write("nomoov", b"");
        std::fs::write(&path, atom(b"ftyp", b"isom")).unwrap();
        assert!(matches!(probe(&path), Err(Error::NoMoov)));
        std::fs::remove_file(path).unwrap();
    }
}
