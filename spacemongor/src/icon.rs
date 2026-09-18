//! The window icon drawn from nothing.
//!
//! A tunnel is a set of frames inside one another receding to a point. Drawing
//! it rather than shipping a picture keeps the binary to one file and lets the
//! icon be made at whatever size the host asks for.

use eframe::egui::IconData;

/// Frames between the outside and the far end.
const RINGS: usize = 9;

/// The blue ramp from the far end outwards. The far end is the lightest step
/// because that is where the light comes from.
const RAMP: [[u8; 3]; RINGS] = [
    [0xcd, 0xe2, 0xfb],
    [0x9e, 0xc5, 0xf4],
    [0x6d, 0xa7, 0xec],
    [0x39, 0x87, 0xe5],
    [0x2a, 0x78, 0xd6],
    [0x25, 0x6a, 0xbf],
    [0x1c, 0x5c, 0xab],
    [0x18, 0x4f, 0x95],
    [0x10, 0x42, 0x81],
];

/// The line between one frame and the next.
const EDGE: [u8; 3] = [0x0b, 0x2a, 0x55];

pub fn tunnel(size: u32) -> IconData {
    let mut rgba = Vec::with_capacity((size * size * 4) as usize);
    let half = size as f32 / 2.0;
    for y in 0..size {
        for x in 0..size {
            // Distance to the centre measured along whichever axis is further.
            // That makes the frames square rather than round.
            let across = ((x as f32 + 0.5) - half).abs() / half;
            let down = ((y as f32 + 0.5) - half).abs() / half;
            let out = across.max(down).min(0.999);

            let ring = (out * RINGS as f32) as usize;
            let within = out * RINGS as f32 - ring as f32;
            // The frames read as frames only if the line between them shows.
            // Ring zero is the middle and `RAMP` starts at the far end so the
            // two line up without turning either around.
            let colour = if within > 0.88 { EDGE } else { RAMP[ring] };
            rgba.extend_from_slice(&[colour[0], colour[1], colour[2], 0xff]);
        }
    }
    IconData {
        rgba,
        width: size,
        height: size,
    }
}

#[cfg(test)]
mod tests {
    use super::tunnel;

    fn pixel(icon: &eframe::egui::IconData, x: u32, y: u32) -> [u8; 4] {
        let at = ((y * icon.width + x) * 4) as usize;
        [
            icon.rgba[at],
            icon.rgba[at + 1],
            icon.rgba[at + 2],
            icon.rgba[at + 3],
        ]
    }

    fn brightness(p: [u8; 4]) -> u32 {
        p[0] as u32 + p[1] as u32 + p[2] as u32
    }

    /// Writes the icon out so it can be looked at. Not a check.
    #[test]
    #[ignore = "writes a file to look at"]
    fn draw_it_out() {
        let icon = tunnel(256);
        let at = std::env::var("ICON_OUT").unwrap_or_else(|_| "/tmp/icon.rgba".into());
        std::fs::write(&at, &icon.rgba).unwrap();
        println!("{} {}x{}", at, icon.width, icon.height);
    }

    #[test]
    fn the_icon_is_the_size_it_was_asked_for() {
        let icon = tunnel(64);
        assert_eq!(icon.width, 64);
        assert_eq!(icon.height, 64);
        assert_eq!(icon.rgba.len(), 64 * 64 * 4);
        assert!(icon.rgba.chunks(4).all(|p| p[3] == 0xff), "all of it shows");
    }

    #[test]
    fn the_far_end_is_the_lightest_part() {
        let icon = tunnel(128);
        let middle = brightness(pixel(&icon, 64, 64));
        let corner = brightness(pixel(&icon, 1, 1));
        let side = brightness(pixel(&icon, 64, 4));
        assert!(middle > corner, "{middle} against {corner}");
        assert!(middle > side, "{middle} against {side}");
    }

    #[test]
    fn it_is_square_rather_than_round() {
        let icon = tunnel(128);
        // A point straight up from the centre and one diagonally out at the
        // same distance along the further axis sit in the same frame.
        assert_eq!(pixel(&icon, 64, 20), pixel(&icon, 40, 20));
    }
}
