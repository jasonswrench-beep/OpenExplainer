// SPDX-License-Identifier: Apache-2.0
//! Turns one request line into one reply.

use crate::platform;
use crate::png_out;
use crate::protocol::{code, parse_line, CaptureError, Reply, Request};
use serde_json::{json, Value};
use std::panic::{catch_unwind, AssertUnwindSafe};

pub fn handle_line(line: &str) -> Reply {
    let envelope = match parse_line(line) {
        Ok(envelope) => envelope,
        Err(reply) => return reply,
    };
    let id = envelope.id.clone();
    // A bug in one request must not take the whole helper down without a word.
    match catch_unwind(AssertUnwindSafe(|| run(envelope.request))) {
        Ok(Ok(result)) => Reply::success(id, result),
        Ok(Err(error)) => Reply::failure(id, error),
        Err(_) => Reply::failure(
            id,
            CaptureError::new(code::HELPER_CRASHED, "The capture helper ran into a problem it did not expect. Nothing was saved. Try again."),
        ),
    }
}

fn run(request: Request) -> Result<Value, CaptureError> {
    match request {
        Request::Ping => Ok(json!({
            "helper": "openexplainer-capture",
            "version": env!("CARGO_PKG_VERSION"),
            "protocol": 1,
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
            "commands": crate::protocol::COMMANDS,
        })),
        Request::ListWindows { exclude_pids } => {
            let windows = platform::list_windows(&exclude_pids)?;
            Ok(json!({ "windows": windows }))
        }
        Request::CaptureWindow { window, out, exclude_pids } => {
            let path = png_out::check_out_path(&out)?;
            let done = platform::capture_window(window, &path, &exclude_pids)?;
            Ok(done)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_answers_with_the_helper_name_and_the_commands() {
        let reply = handle_line(r#"{"id": 1, "command": "ping"}"#);
        assert!(reply.ok);
        let result = reply.result.unwrap();
        assert_eq!(result["helper"], "openexplainer-capture");
        assert_eq!(result["protocol"], 1);
        assert!(result["commands"].as_array().unwrap().iter().any(|c| c == "capture-window"));
    }

    #[test]
    fn a_bad_line_gets_a_failure_not_a_crash() {
        let reply = handle_line("???");
        assert!(!reply.ok);
        assert_eq!(reply.error.unwrap().code, code::BAD_REQUEST);
    }

    #[test]
    fn a_capture_to_a_relative_path_is_refused_before_anything_is_captured() {
        let reply = handle_line(r#"{"id": 5, "command": "capture-window", "window": 1, "out": "picture.png"}"#);
        assert!(!reply.ok);
        assert!(reply.error.unwrap().message.contains("full path"));
    }
}
