// SPDX-License-Identifier: Apache-2.0
//! Picture arithmetic that needs no screen, so it can be tested anywhere.

use crate::protocol::{code, CaptureError, ScreenInfo};

/// A picture bigger than this is almost certainly a mistake, and would use gigabytes to hold.
pub const MOST_PIXELS: i64 = 120_000_000;

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

/// The part two rectangles share. Empty (zero width and height) if they only touch or do not meet.
pub fn intersect(a: Rect, b: Rect) -> Rect {
    let left = a.left.max(b.left);
    let top = a.top.max(b.top);
    let right = a.right.min(b.right).max(left);
    let bottom = a.bottom.min(b.bottom).max(top);
    Rect { left, top, right, bottom }
}

/// Is every pixel of `region` on some screen? Screens need not touch and may overlap, so a region that spans the
/// small gap Windows leaves between two screens set at different heights is NOT covered.
pub fn covered_by(region: Rect, screens: &[Rect]) -> bool {
    if region.is_empty() {
        return false;
    }
    // Cut the region into cells along every screen edge that crosses it, then check that each cell is on a screen.
    let mut xs = vec![region.left, region.right];
    let mut ys = vec![region.top, region.bottom];
    for s in screens {
        for x in [s.left, s.right] {
            if x > region.left && x < region.right {
                xs.push(x);
            }
        }
        for y in [s.top, s.bottom] {
            if y > region.top && y < region.bottom {
                ys.push(y);
            }
        }
    }
    xs.sort_unstable();
    xs.dedup();
    ys.sort_unstable();
    ys.dedup();
    xs.windows(2).all(|x| {
        ys.windows(2).all(|y| {
            let cell = Rect { left: x[0], top: y[0], right: x[1], bottom: y[1] };
            screens.iter().any(|s| s.contains_rect(&cell))
        })
    })
}

/// Gives the screens their numbers, from 1: the main screen is always 1, and the rest go left to right, then top to bottom.
pub fn number_screens(mut screens: Vec<ScreenInfo>) -> Vec<ScreenInfo> {
    screens.sort_by_key(|s| (!s.primary, s.x, s.y));
    for (i, s) in screens.iter_mut().enumerate() {
        s.number = i as u32 + 1;
    }
    screens
}

/// Checks the four numbers of a region request. They are real screen pixels, so `x` and `y` may be negative on a
/// screen that sits left of or above the main one.
pub fn check_region(x: i32, y: i32, width: i32, height: i32) -> Result<Rect, CaptureError> {
    if width < 1 || height < 1 {
        return Err(CaptureError::new(
            code::BAD_REQUEST,
            "A region needs a width and a height of at least 1 pixel.",
        ));
    }
    let (Some(right), Some(bottom)) = (x.checked_add(width), y.checked_add(height)) else {
        return Err(CaptureError::new(code::BAD_REQUEST, "Those region numbers are too large to be on any screen."));
    };
    if i64::from(width) * i64::from(height) > MOST_PIXELS {
        return Err(CaptureError::new(code::TOO_LARGE, "That region is far bigger than any screen. Nothing was captured."));
    }
    Ok(Rect { left: x, top: y, right, bottom })
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

/// Cuts a rectangle out of a 3-bytes-per-pixel (red, green, blue) picture. `None` if it does not fit inside it.
pub fn crop_rgb(src: &[u8], src_width: u32, src_height: u32, part: Rect) -> Option<Vec<u8>> {
    if part.is_empty() || part.left < 0 || part.top < 0 || part.right > src_width as i32 || part.bottom > src_height as i32 {
        return None;
    }
    if src.len() != src_width as usize * src_height as usize * 3 {
        return None;
    }
    let (w, h) = (part.width() as usize, part.height() as usize);
    let mut out = Vec::with_capacity(w * h * 3);
    for row in 0..h {
        let start = ((part.top as usize + row) * src_width as usize + part.left as usize) * 3;
        out.extend_from_slice(&src[start..start + w * 3]);
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
    fn crop_rgb_takes_the_right_pixels_and_refuses_what_does_not_fit() {
        // 3 wide, 2 tall, 3 bytes per pixel: the first byte of each pixel is its number 0..5.
        let mut src = Vec::new();
        for i in 0..6u8 {
            src.extend_from_slice(&[i, 100 + i, 200 + i]);
        }
        let cut = crop_rgb(&src, 3, 2, rect(1, 0, 3, 2)).unwrap();
        let firsts: Vec<u8> = cut.chunks_exact(3).map(|p| p[0]).collect();
        assert_eq!(firsts, vec![1, 2, 4, 5]);
        assert_eq!(&cut[..3], &[1, 101, 201], "all three colour bytes travel together");
        assert!(crop_rgb(&src, 3, 2, rect(0, 0, 4, 2)).is_none());
        assert!(crop_rgb(&src, 3, 2, rect(-1, 0, 2, 2)).is_none());
        assert!(crop_rgb(&src, 3, 2, rect(1, 1, 1, 2)).is_none());
        assert!(crop_rgb(&src[..5], 3, 2, rect(0, 0, 1, 1)).is_none());
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

    // The two screens of the author's PC: the main one, and one above it shifted 7 pixels to the right.
    fn two_screens() -> Vec<Rect> {
        vec![rect(0, 0, 1920, 1080), rect(7, -1080, 1927, 0)]
    }

    #[test]
    fn intersect_gives_the_shared_part_or_nothing() {
        assert_eq!(intersect(rect(0, 0, 100, 100), rect(50, 60, 200, 200)), rect(50, 60, 100, 100));
        assert!(intersect(rect(0, 0, 10, 10), rect(10, 0, 20, 10)).is_empty(), "touching is not sharing");
        assert!(intersect(rect(0, 0, 10, 10), rect(50, 50, 60, 60)).is_empty());
    }

    #[test]
    fn a_region_on_one_screen_is_covered() {
        assert!(covered_by(rect(100, 100, 400, 300), &two_screens()));
        assert!(covered_by(rect(0, 0, 1920, 1080), &two_screens()), "the whole main screen");
        assert!(covered_by(rect(7, -1080, 1927, 0), &two_screens()), "the whole second screen");
    }

    #[test]
    fn a_region_across_the_seam_where_the_screens_meet_is_covered() {
        assert!(covered_by(rect(100, -50, 200, 50), &two_screens()));
    }

    #[test]
    fn the_strip_left_of_the_higher_screen_is_not_a_screen() {
        // x 0..7 above the main screen is empty desktop, and would come out black.
        assert!(!covered_by(rect(0, -50, 100, 50), &two_screens()));
        assert!(!covered_by(rect(1900, -50, 1930, 50), &two_screens()), "past the right edge of the main screen");
    }

    #[test]
    fn a_region_partly_off_every_screen_or_empty_is_not_covered() {
        assert!(!covered_by(rect(1800, 1000, 2000, 1100), &two_screens()));
        assert!(!covered_by(rect(-5, 0, 100, 100), &two_screens()));
        assert!(!covered_by(rect(5, 5, 5, 50), &two_screens()));
        assert!(!covered_by(rect(0, 0, 10, 10), &[]));
    }

    #[test]
    fn overlapping_screens_still_cover_what_they_cover() {
        let mirrored = vec![rect(0, 0, 100, 100), rect(0, 0, 100, 100), rect(50, 0, 200, 100)];
        assert!(covered_by(rect(10, 10, 190, 90), &mirrored));
    }

    #[test]
    fn screens_are_numbered_main_first_then_left_to_right() {
        let screen = |x: i32, y: i32, primary: bool| ScreenInfo { number: 0, x, y, width: 100, height: 100, primary, scale_percent: 100 };
        let numbered = number_screens(vec![screen(2000, 0, false), screen(0, 0, true), screen(-1000, 0, false)]);
        let order: Vec<(u32, i32)> = numbered.iter().map(|s| (s.number, s.x)).collect();
        assert_eq!(order, vec![(1, 0), (2, -1000), (3, 2000)]);
    }

    #[test]
    fn region_numbers_are_checked() {
        assert_eq!(check_region(10, 20, 300, 200).unwrap(), rect(10, 20, 310, 220));
        assert_eq!(check_region(-100, -900, 50, 50).unwrap(), rect(-100, -900, -50, -850), "negative positions are fine");
        assert_eq!(check_region(0, 0, 0, 10).unwrap_err().code, code::BAD_REQUEST);
        assert_eq!(check_region(0, 0, 10, -1).unwrap_err().code, code::BAD_REQUEST);
        assert_eq!(check_region(i32::MAX, 0, 10, 10).unwrap_err().code, code::BAD_REQUEST);
        assert_eq!(check_region(0, 0, 20_000, 20_000).unwrap_err().code, code::TOO_LARGE);
    }

    #[test]
    fn contains_rect_checks_all_four_sides() {
        let outer = rect(0, 0, 100, 100);
        assert!(outer.contains_rect(&rect(0, 0, 100, 100)));
        assert!(!outer.contains_rect(&rect(-1, 0, 50, 50)));
        assert!(!outer.contains_rect(&rect(0, 0, 101, 50)));
    }
}
