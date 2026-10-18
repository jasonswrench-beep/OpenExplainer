// SPDX-License-Identifier: Apache-2.0
//! Picture arithmetic that needs no screen, so it can be tested anywhere.

/// A rectangle in screen pixels. `right` and `bottom` are the first pixel outside it, as Windows does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Rect {
    pub fn width(&self) -> i32 {
        (self.right - self.left).max(0)
    }

    pub fn height(&self) -> i32 {
        (self.bottom - self.top).max(0)
    }

    pub fn is_empty(&self) -> bool {
        self.width() == 0 || self.height() == 0
    }

    pub fn contains_rect(&self, inner: &Rect) -> bool {
        inner.left >= self.left && inner.top >= self.top && inner.right <= self.right && inner.bottom <= self.bottom
    }
}

/// Windows 10 and 11 draw invisible resize borders round most windows, so a window's full rectangle is a
/// little bigger than what a person sees. This is the part to keep: the visible rectangle, measured from
/// the corner of the full one. Anything outside the full rectangle is ignored.
pub fn visible_part(full: Rect, visible: Rect) -> Rect {
    let left = visible.left.max(full.left) - full.left;
    let top = visible.top.max(full.top) - full.top;
    let right = visible.right.min(full.right) - full.left;
    let bottom = visible.bottom.min(full.bottom) - full.top;
    if right <= left || bottom <= top {
        Rect { left: 0, top: 0, right: full.width(), bottom: full.height() }
    } else {
        Rect { left, top, right, bottom }
    }
}

/// Cuts a rectangle out of a 4-bytes-per-pixel picture. `None` if the cut-out does not fit inside it.
pub fn crop_bgra(src: &[u8], src_width: u32, src_height: u32, part: Rect) -> Option<Vec<u8>> {
    if part.is_empty() || part.left < 0 || part.top < 0 || part.right > src_width as i32 || part.bottom > src_height as i32 {
        return None;
    }
    if src.len() != src_width as usize * src_height as usize * 4 {
        return None;
    }
    let (w, h) = (part.width() as usize, part.height() as usize);
    let mut out = Vec::with_capacity(w * h * 4);
    for row in 0..h {
        let start = ((part.top as usize + row) * src_width as usize + part.left as usize) * 4;
        out.extend_from_slice(&src[start..start + w * 4]);
    }
    Some(out)
}

/// Windows hands pictures back as blue, green, red and a spare byte. PNG files want red, green, blue.
pub fn bgra_to_rgb(bgra: &[u8]) -> Vec<u8> {
    let mut rgb = Vec::with_capacity(bgra.len() / 4 * 3);
    for pixel in bgra.chunks_exact(4) {
        rgb.extend_from_slice(&[pixel[2], pixel[1], pixel[0]]);
    }
    rgb
}

/// A program that will not draw itself on request usually hands back pure black. A real window is never
/// pure black from edge to edge, so this is how the helper knows to try the screen copy instead.
pub fn looks_blank(bgra: &[u8]) -> bool {
    bgra.chunks_exact(4).all(|p| p[0] == 0 && p[1] == 0 && p[2] == 0)
}

/// Points spread over a rectangle, for checking whether the window is really in front. The points keep
/// `margin` pixels away from the edges so rounded corners and shadows do not count against the window.
pub fn grid_points(area: Rect, columns: i32, rows: i32, margin: i32) -> Vec<(i32, i32)> {
    let inner_w = area.width() - margin * 2;
    let inner_h = area.height() - margin * 2;
    if inner_w <= 0 || inner_h <= 0 || columns < 1 || rows < 1 {
        return Vec::new();
    }
    let mut points = Vec::new();
    for r in 0..rows {
        for c in 0..columns {
            let x = area.left + margin + if columns == 1 { inner_w / 2 } else { c * (inner_w - 1) / (columns - 1) };
            let y = area.top + margin + if rows == 1 { inner_h / 2 } else { r * (inner_h - 1) / (rows - 1) };
            points.push((x, y));
        }
    }
    points
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(left: i32, top: i32, right: i32, bottom: i32) -> Rect {
        Rect { left, top, right, bottom }
    }

    #[test]
    fn the_invisible_borders_are_trimmed() {
        // A window whose full rectangle has 7 invisible pixels left, right and bottom, as Windows 11 does.
        let full = rect(93, 100, 1007, 807);
        let visible = rect(100, 100, 1000, 800);
        assert_eq!(visible_part(full, visible), rect(7, 0, 907, 700));
    }

    #[test]
    fn a_visible_rectangle_outside_the_full_one_falls_back_to_the_whole_window() {
        let full = rect(0, 0, 100, 50);
        assert_eq!(visible_part(full, rect(500, 500, 600, 600)), rect(0, 0, 100, 50));
    }

    #[test]
    fn crop_takes_the_right_pixels() {
        // 3 wide, 2 tall: pixel values 0..5 in the first byte of each pixel.
        let mut src = Vec::new();
        for i in 0..6u8 {
            src.extend_from_slice(&[i, 0, 0, 255]);
        }
        let cut = crop_bgra(&src, 3, 2, rect(1, 0, 3, 2)).unwrap();
        let firsts: Vec<u8> = cut.chunks_exact(4).map(|p| p[0]).collect();
        assert_eq!(firsts, vec![1, 2, 4, 5]);
    }

    #[test]
    fn crop_refuses_a_rectangle_that_does_not_fit() {
        let src = vec![0u8; 3 * 2 * 4];
        assert!(crop_bgra(&src, 3, 2, rect(0, 0, 4, 2)).is_none());
        assert!(crop_bgra(&src, 3, 2, rect(-1, 0, 2, 2)).is_none());
        assert!(crop_bgra(&src, 3, 2, rect(1, 1, 1, 2)).is_none());
        assert!(crop_bgra(&src[..10], 3, 2, rect(0, 0, 1, 1)).is_none());
    }

    #[test]
    fn colours_are_turned_round() {
        assert_eq!(bgra_to_rgb(&[10, 20, 30, 255, 1, 2, 3, 0]), vec![30, 20, 10, 3, 2, 1]);
    }

    #[test]
    fn pure_black_is_blank_and_anything_else_is_not() {
        assert!(looks_blank(&[0, 0, 0, 255, 0, 0, 0, 0]));
        assert!(!looks_blank(&[0, 0, 0, 255, 0, 0, 1, 255]));
        assert!(!looks_blank(&[255, 255, 255, 255]), "a plain white window is a real picture");
    }

    #[test]
    fn grid_points_stay_inside_and_keep_off_the_edges() {
        let area = rect(100, 200, 300, 400);
        let points = grid_points(area, 5, 5, 4);
        assert_eq!(points.len(), 25);
        for (x, y) in &points {
            assert!(*x >= 104 && *x <= 295 && *y >= 204 && *y <= 395, "{x},{y}");
        }
        assert_eq!(points.first(), Some(&(104, 204)));
        assert_eq!(points.last(), Some(&(295, 395)));
    }

    #[test]
    fn grid_points_of_a_tiny_rectangle_are_empty() {
        assert!(grid_points(rect(0, 0, 6, 6), 5, 5, 4).is_empty());
    }

    #[test]
    fn contains_rect_checks_all_four_sides() {
        let outer = rect(0, 0, 100, 100);
        assert!(outer.contains_rect(&rect(0, 0, 100, 100)));
        assert!(!outer.contains_rect(&rect(-1, 0, 50, 50)));
        assert!(!outer.contains_rect(&rect(0, 0, 101, 50)));
    }
}
