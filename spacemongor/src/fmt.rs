//! Byte counts written the way a person reads them.

const UNITS: [&str; 6] = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];

pub fn bytes(n: u64) -> String {
    let mut v = n as f64;
    let mut u = 0;
    while v >= 1024.0 && u < UNITS.len() - 1 {
        v /= 1024.0;
        u += 1;
    }
    if u == 0 {
        format!("{n} B")
    } else if v < 10.0 {
        format!("{v:.2} {}", UNITS[u])
    } else {
        format!("{v:.1} {}", UNITS[u])
    }
}

/// A count with its thousands held apart so a long number can be read at a
/// glance.
pub fn count(n: u64) -> String {
    let digits = n.to_string();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::{bytes, count};

    #[test]
    fn scales_to_the_right_unit() {
        assert_eq!(bytes(0), "0 B");
        assert_eq!(bytes(1023), "1023 B");
        assert_eq!(bytes(1024), "1.00 KiB");
        assert_eq!(bytes(1024 * 1024 * 3 / 2), "1.50 MiB");
        assert_eq!(bytes(1024 * 1024 * 1024 * 20), "20.0 GiB");
    }

    #[test]
    fn a_long_count_is_held_apart() {
        assert_eq!(count(0), "0");
        assert_eq!(count(999), "999");
        assert_eq!(count(1_000), "1,000");
        assert_eq!(count(240_271), "240,271");
        assert_eq!(count(1_234_567), "1,234,567");
    }
}
