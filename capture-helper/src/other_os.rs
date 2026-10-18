// SPDX-License-Identifier: Apache-2.0
//! The helper only captures on Windows. On anything else it still starts and answers `ping`, so the
//! messages and picture code can be tested anywhere, and says plainly that capturing is not available.

use crate::pixels::Rect;
use crate::protocol::{code, CaptureError, ScreenInfo, WindowInfo};
use serde_json::Value;
use std::path::Path;

pub fn prepare() {}

fn not_supported() -> CaptureError {
    CaptureError::new(code::NOT_SUPPORTED, "Capturing windows works on Windows only.")
}

pub fn list_windows(_exclude_pids: &[u32]) -> Result<Vec<WindowInfo>, CaptureError> {
    Err(not_supported())
}

pub fn list_screens() -> Result<Vec<ScreenInfo>, CaptureError> {
    Err(not_supported())
}

pub fn capture_window(_window: i64, _out: &Path, _exclude_pids: &[u32], _activate: bool) -> Result<Value, CaptureError> {
    Err(not_supported())
}

pub fn capture_region(_region: Rect, _out: &Path, _exclude_pids: &[u32]) -> Result<Value, CaptureError> {
    Err(not_supported())
}
