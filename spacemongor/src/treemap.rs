//! Squarified treemap layout.
//!
//! Every box takes area in proportion to its value. The algorithm fills the
//! rectangle in rows and starts a new row as soon as adding one more box would
//! make the row squarer nowhere and thinner everywhere.

use eframe::egui::{Rect, pos2, vec2};

/// Returns one rectangle per value in the order the values were given.
pub fn squarify(values: &[u64], area: Rect) -> Vec<Rect> {
    let mut out = vec![Rect::NOTHING; values.len()];
    let total: f64 = values.iter().map(|v| *v as f64).sum();
    if total <= 0.0 || area.width() <= 0.0 || area.height() <= 0.0 {
        return out;
    }

    // The row test only holds when the largest box comes first.
    let mut order: Vec<usize> = (0..values.len()).collect();
    order.sort_unstable_by_key(|&i| std::cmp::Reverse(values[i]));

    let scale = (area.width() as f64 * area.height() as f64) / total;
    let (mut x, mut y) = (area.left() as f64, area.top() as f64);
    let (mut w, mut h) = (area.width() as f64, area.height() as f64);

    let mut i = 0;
    while i < order.len() {
        let short = w.min(h);
        if short <= 0.0 {
            break;
        }
        let first = values[order[i]] as f64 * scale;
        if first <= 0.0 {
            break;
        }
        let mut sum = first;
        let mut best = worst(first, first, sum, short);
        let mut j = i + 1;
        while j < order.len() {
            let next = values[order[j]] as f64 * scale;
            if next <= 0.0 {
                break;
            }
            let score = worst(first, next, sum + next, short);
            if score > best {
                break;
            }
            best = score;
            sum += next;
            j += 1;
        }

        let thick = sum / short;
        let mut offset = 0.0;
        for &k in &order[i..j] {
            let length = short * (values[k] as f64 * scale) / sum;
            out[k] = if w <= h {
                Rect::from_min_size(
                    pos2((x + offset) as f32, y as f32),
                    vec2(length as f32, thick as f32),
                )
            } else {
                Rect::from_min_size(
                    pos2(x as f32, (y + offset) as f32),
                    vec2(thick as f32, length as f32),
                )
            };
            offset += length;
        }
        if w <= h {
            y += thick;
            h -= thick;
        } else {
            x += thick;
            w -= thick;
        }
        i = j;
    }
    out
}

/// Aspect ratio of the worst box in a row of total area `sum` laid along `short`.
fn worst(max: f64, min: f64, sum: f64, short: f64) -> f64 {
    let sum2 = sum * sum;
    let short2 = short * short;
    (short2 * max / sum2).max(sum2 / (short2 * min))
}

#[cfg(test)]
mod tests {
    use super::squarify;
    use eframe::egui::{Rect, pos2};

    fn area() -> Rect {
        Rect::from_min_max(pos2(0.0, 0.0), pos2(400.0, 300.0))
    }

    #[test]
    fn each_box_takes_its_share_of_the_area() {
        let values = [50u64, 30, 12, 5, 3];
        let rects = squarify(&values, area());
        let total: u64 = values.iter().sum();
        for (v, r) in values.iter().zip(&rects) {
            let want = area().area() * (*v as f32 / total as f32);
            assert!(
                (r.area() - want).abs() < want * 0.01,
                "{v} got {} wanted {want}",
                r.area()
            );
        }
    }

    #[test]
    fn every_box_stays_inside_the_area() {
        let rects = squarify(&[7u64, 7, 7, 1, 1, 1, 1], area());
        for r in &rects {
            assert!(area().expand(0.01).contains_rect(*r), "{r:?} escaped");
        }
    }

    #[test]
    fn boxes_do_not_overlap() {
        let rects = squarify(&[9u64, 8, 5, 4, 4, 2, 1], area());
        for (i, a) in rects.iter().enumerate() {
            for b in &rects[i + 1..] {
                let hit = a.intersect(*b);
                assert!(hit.width() < 0.01 || hit.height() < 0.01, "{a:?} met {b:?}");
            }
        }
    }

    #[test]
    fn rectangles_come_back_in_the_order_the_values_were_given() {
        let rects = squarify(&[1u64, 100, 10], area());
        assert!(rects[1].area() > rects[2].area());
        assert!(rects[2].area() > rects[0].area());
    }

    #[test]
    fn nothing_is_drawn_for_an_empty_total() {
        assert!(
            squarify(&[0u64, 0], area())
                .iter()
                .all(|r| !r.is_positive())
        );
        assert!(squarify(&[], area()).is_empty());
    }
}
