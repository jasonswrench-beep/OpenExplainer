// SPDX-License-Identifier: Apache-2.0
//! OpenExplainer capture helper.
//!
//! A small program that OpenExplainer starts as its own process. It reads one JSON request per line on
//! stdin and answers with one JSON line on stdout. It lives apart from the app on purpose: if a program
//! being captured stops responding, only this helper is stuck, and the app can stop it and carry on.
//! The messages are written up in `docs/capture-helper.md`.

mod handler;
mod pixels;
mod png_out;
mod protocol;

#[cfg(windows)]
#[path = "windows_api.rs"]
mod platform;
#[cfg(not(windows))]
#[path = "other_os.rs"]
mod platform;

use std::io::{self, BufRead, Write};

fn main() {
    platform::prepare();
    let stdin = io::stdin();
    let mut input = stdin.lock();
    let stdout = io::stdout();
    let mut output = stdout.lock();
    let mut buffer = Vec::new();
    loop {
        buffer.clear();
        match input.read_until(b'\n', &mut buffer) {
            Ok(0) => break, // the app closed the pipe: time to stop
            Ok(_) => {}
            Err(e) => {
                eprintln!("capture helper: could not read a request: {e}");
                break;
            }
        }
        let line = String::from_utf8_lossy(&buffer);
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let reply = handler::handle_line(line);
        let text = serde_json::to_string(&reply).unwrap_or_else(|_| {
            r#"{"id":null,"ok":false,"error":{"code":"helper-crashed","message":"The helper could not write its reply."}}"#.to_string()
        });
        if writeln!(output, "{text}").and_then(|_| output.flush()).is_err() {
            break; // nobody is listening any more
        }
    }
}
