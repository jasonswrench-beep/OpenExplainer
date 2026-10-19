// SPDX-License-Identifier: Apache-2.0
//! Saving a picture as a PNG file, so that a failed save never leaves half a picture behind.

use crate::protocol::{code, CaptureError};
use std::fs::{self, File};
use std::io::BufWriter;
use std::path::{Path, PathBuf};

/// Checks the file name the app asked for, before any capturing happens.
pub fn check_out_path(out: &str) -> Result<PathBuf, CaptureError> {
    let path = PathBuf::from(out);
    if !path.is_absolute() {
        return Err(CaptureError::new(code::BAD_REQUEST, "The helper needs the full path of the picture file to write."));
    }
    let is_png = path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("png")).unwrap_or(false);
    if !is_png {
        return Err(CaptureError::new(code::BAD_REQUEST, "The picture file name must end in .png."));
    }
    Ok(path)
}

/// Checks the name of the picture to cut a part out of.
pub fn check_source_path(source: &str) -> Result<PathBuf, CaptureError> {
    let path = PathBuf::from(source);
    let is_png = path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("png")).unwrap_or(false);
    if !path.is_absolute() || !is_png {
        return Err(CaptureError::new(code::BAD_REQUEST, "The helper needs the full path of a .png picture to cut a part out of."));
    }
    Ok(path)
}

/// Writes red, green, blue pixels (3 bytes each) as a PNG. The file appears under its real name only once it
/// is complete: it is written beside it first and then renamed.
pub fn write_png(path: &Path, rgb: &[u8], width: u32, height: u32) -> Result<(), CaptureError> {
    let fail = |why: String| {
        CaptureError::new(code::WRITE_FAILED, format!("The picture could not be saved to {}. {}", path.display(), why))
    };
    if rgb.len() != width as usize * height as usize * 3 {
        return Err(CaptureError::new(code::CAPTURE_FAILED, "The captured picture was the wrong size inside the helper.")
            .with_detail(format!("{} bytes for {}x{}", rgb.len(), width, height)));
    }
    if let Some(folder) = path.parent() {
        fs::create_dir_all(folder).map_err(|e| fail(format!("The folder could not be made: {e}.")))?;
    }
    let mut partial = path.as_os_str().to_owned();
    partial.push(".partial");
    let partial = PathBuf::from(partial);
    let written = (|| -> Result<(), String> {
        let file = File::create(&partial).map_err(|e| format!("The file could not be made: {e}."))?;
        let mut encoder = png::Encoder::new(BufWriter::new(file), width, height);
        encoder.set_color(png::ColorType::Rgb);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(|e| format!("{e}."))?;
        writer.write_image_data(rgb).map_err(|e| format!("{e}."))?;
        writer.finish().map_err(|e| format!("{e}."))?;
        Ok(())
    })();
    if let Err(why) = written {
        let _ = fs::remove_file(&partial);
        return Err(fail(why));
    }
    if let Err(e) = fs::rename(&partial, path) {
        let _ = fs::remove_file(&partial);
        return Err(fail(format!("The finished file could not be put in place: {e}.")));
    }
    Ok(())
}

/// Reads a PNG the helper (or any 8-bit red-green-blue or red-green-blue-alpha PNG) made, as red, green, blue pixels.
pub fn read_png_rgb(path: &Path) -> Result<(Vec<u8>, u32, u32), CaptureError> {
    let bad = |why: &str| CaptureError::new(code::BAD_REQUEST, format!("The picture {} could not be read: {why}", path.display()));
    let file = File::open(path).map_err(|e| bad(&format!("it could not be opened ({e}).")))?;
    let mut reader = png::Decoder::new(std::io::BufReader::new(file))
        .read_info()
        .map_err(|_| bad("it is not a PNG picture."))?;
    let mut buffer = vec![0; reader.output_buffer_size().ok_or_else(|| bad("it is too large."))?];
    let info = reader.next_frame(&mut buffer).map_err(|_| bad("it is damaged."))?;
    if info.bit_depth != png::BitDepth::Eight {
        return Err(bad("only 8-bit pictures can be cut."));
    }
    let pixels = &buffer[..info.buffer_size()];
    let rgb = match info.color_type {
        png::ColorType::Rgb => pixels.to_vec(),
        png::ColorType::Rgba => pixels.chunks_exact(4).flat_map(|p| [p[0], p[1], p[2]]).collect(),
        _ => return Err(bad("only red-green-blue pictures can be cut.")),
    };
    Ok((rgb, info.width, info.height))
}

/// Cuts a rectangle out of a saved PNG and saves it as a new PNG. The numbers count pixels from the picture's top left
/// corner. The source is never changed, and it may not be the same file as the result.
pub fn crop_picture(source: &Path, left: i32, top: i32, width: i32, height: i32, out: &Path) -> Result<(u32, u32), CaptureError> {
    if source == out || (source.exists() && out.exists() && fs::canonicalize(source).ok() == fs::canonicalize(out).ok()) {
        return Err(CaptureError::new(code::BAD_REQUEST, "The cut-out picture cannot be saved over the picture it is cut from."));
    }
    if width < 1 || height < 1 {
        return Err(CaptureError::new(code::BAD_REQUEST, "A cut-out needs a width and a height of at least 1 pixel."));
    }
    let (rgb, picture_width, picture_height) = read_png_rgb(source)?;
    let right = left.checked_add(width);
    let bottom = top.checked_add(height);
    let fits = left >= 0 && top >= 0 && right.is_some_and(|r| r <= picture_width as i32) && bottom.is_some_and(|b| b <= picture_height as i32);
    if !fits {
        return Err(CaptureError::new(
            code::BAD_REQUEST,
            format!("The rectangle reaches past the edge of the picture, which is {picture_width} by {picture_height} pixels."),
        ));
    }
    let part = crate::pixels::Rect { left, top, right: left + width, bottom: top + height };
    let cut = crate::pixels::crop_rgb(&rgb, picture_width, picture_height, part)
        .ok_or_else(|| CaptureError::new(code::CAPTURE_FAILED, "The cut-out could not be made."))?;
    write_png(out, &cut, width as u32, height as u32)?;
    Ok((width as u32, height as u32))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A small picture where every pixel's colour says where it is: red = column, green = row, blue = 77.
    fn write_test_picture(path: &Path, width: u32, height: u32) {
        let mut rgb = Vec::new();
        for y in 0..height {
            for x in 0..width {
                rgb.extend_from_slice(&[x as u8, y as u8, 77]);
            }
        }
        write_png(path, &rgb, width, height).unwrap();
    }

    #[test]
    fn a_cut_out_has_exactly_the_pixels_of_that_part_of_the_picture() {
        let folder = scratch("crop-ok");
        let (source, out) = (folder.join("whole.png"), folder.join("part.png"));
        write_test_picture(&source, 10, 8);
        assert_eq!(crop_picture(&source, 3, 2, 4, 5, &out).unwrap(), (4, 5));
        let (rgb, w, h) = read_png_rgb(&out).unwrap();
        assert_eq!((w, h), (4, 5));
        // the top left pixel of the cut-out is column 3, row 2 of the whole; the bottom right is column 6, row 6
        assert_eq!(&rgb[..3], &[3, 2, 77]);
        assert_eq!(&rgb[rgb.len() - 3..], &[6, 6, 77]);
        let (_, sw, sh) = read_png_rgb(&source).unwrap();
        assert_eq!((sw, sh), (10, 8), "the source is left as it was");
        let _ = fs::remove_dir_all(&folder);
    }

    #[test]
    fn the_whole_picture_can_be_cut_out_and_a_cut_out_may_touch_every_edge() {
        let folder = scratch("crop-edges");
        let (source, out) = (folder.join("whole.png"), folder.join("same.png"));
        write_test_picture(&source, 6, 4);
        assert_eq!(crop_picture(&source, 0, 0, 6, 4, &out).unwrap(), (6, 4));
        assert_eq!(read_png_rgb(&out).unwrap().0, read_png_rgb(&source).unwrap().0);
        let _ = fs::remove_dir_all(&folder);
    }

    #[test]
    fn a_rectangle_past_an_edge_or_without_size_is_refused_with_the_picture_size_in_the_words() {
        let folder = scratch("crop-bad");
        let (source, out) = (folder.join("whole.png"), folder.join("part.png"));
        write_test_picture(&source, 10, 8);
        for (l, t, w, h) in [(8, 0, 4, 2), (0, 7, 2, 2), (-1, 0, 2, 2), (0, -1, 2, 2), (i32::MAX, 0, 5, 5)] {
            let error = crop_picture(&source, l, t, w, h, &out).unwrap_err();
            assert!(error.message.contains("past the edge of the picture, which is 10 by 8 pixels"), "{l},{t},{w},{h}: {}", error.message);
            assert!(!out.exists(), "nothing was written");
        }
        assert!(crop_picture(&source, 0, 0, 0, 5, &out).unwrap_err().message.contains("at least 1 pixel"));
        let _ = fs::remove_dir_all(&folder);
    }

    #[test]
    fn a_missing_or_damaged_source_is_explained_and_the_source_is_never_overwritten() {
        let folder = scratch("crop-source");
        fs::create_dir_all(&folder).unwrap();
        let (source, out) = (folder.join("whole.png"), folder.join("part.png"));
        assert!(crop_picture(&source, 0, 0, 1, 1, &out).unwrap_err().message.contains("could not be opened"));
        fs::write(&source, b"this is not a picture").unwrap();
        assert!(crop_picture(&source, 0, 0, 1, 1, &out).unwrap_err().message.contains("not a PNG picture"));
        write_test_picture(&source, 4, 4);
        assert!(crop_picture(&source, 0, 0, 2, 2, &source).unwrap_err().message.contains("over the picture it is cut from"));
        assert_eq!(read_png_rgb(&source).unwrap().1, 4, "the source is still a good 4 pixel wide picture");
        let _ = fs::remove_dir_all(&folder);
    }


    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("openexplainer-capture-tests-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    #[test]
    fn a_small_picture_survives_the_round_trip() {
        let path = scratch("round-trip.png");
        let rgb = vec![255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30];
        write_png(&path, &rgb, 2, 2).unwrap();
        let decoder = png::Decoder::new(std::io::BufReader::new(File::open(&path).unwrap()));
        let mut reader = decoder.read_info().unwrap();
        let mut buf = vec![0; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut buf).unwrap();
        assert_eq!((info.width, info.height), (2, 2));
        assert_eq!(&buf[..12], &rgb[..]);
        assert!(!Path::new(&format!("{}.partial", path.display())).exists());
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn a_folder_that_does_not_exist_yet_is_made() {
        let path = scratch("deeper").join("and deeper").join("x.png");
        write_png(&path, &[1, 2, 3], 1, 1).unwrap();
        assert!(path.exists());
        let _ = fs::remove_dir_all(scratch("deeper"));
    }

    #[test]
    fn the_wrong_amount_of_pixels_is_refused() {
        let path = scratch("wrong-size.png");
        let error = write_png(&path, &[1, 2, 3], 2, 2).unwrap_err();
        assert_eq!(error.code, code::CAPTURE_FAILED);
        assert!(!path.exists());
    }

    #[test]
    fn a_save_that_fails_says_where_and_leaves_nothing_behind() {
        // A folder where the file should go cannot be replaced by a file.
        let path = scratch("is-a-folder.png");
        fs::create_dir_all(&path).unwrap();
        let error = write_png(&path, &[1, 2, 3], 1, 1).unwrap_err();
        assert_eq!(error.code, code::WRITE_FAILED);
        assert!(error.message.contains("is-a-folder.png"));
        assert!(!Path::new(&format!("{}.partial", path.display())).exists());
        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn only_full_paths_ending_in_png_are_accepted() {
        assert!(check_out_path("relative/x.png").is_err());
        assert!(check_out_path("C:\\pictures\\x.jpg").is_err());
        assert!(check_out_path("C:\\pictures\\x").is_err());
        assert!(check_out_path("C:\\pictures\\x.PNG").is_ok());
    }
}
