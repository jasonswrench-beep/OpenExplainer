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

#[cfg(test)]
mod tests {
    use super::*;

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
