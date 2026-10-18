// What OpenExplainer learns when it asks the capture helper something, and the plain words for when it goes wrong.
// The messages between the app and the helper are written up in docs/capture-helper.md.

/** How long the app waits for the helper before it stops it. */
export const CAPTURE_TIMEOUT_MS = 20_000;

/** Said at the end of every failure, so the author always knows their work is safe. */
export const UNCHANGED = "Your project was not changed.";

export interface WindowInfo {
  id: number;
  title: string;
  process: string;
  pid: number;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  not_responding: boolean;
  scale_percent: number;
}

export interface CaptureResult {
  path: string;
  width: number;
  height: number;
  method: "print-window" | "screen-copy";
  note: string;
  scale_percent: number;
  elapsed_ms: number;
  window?: WindowInfo;
}

/** The helper's own answer: a result, or an error that already has plain words in `message`. */
export type HelperReply =
  | { id: unknown; ok: true; result: unknown }
  | { id: unknown; ok: false; error: { code: string; message: string; detail?: string } };

/** What the app's shell reports after running the helper once. */
export type ShellOutcome =
  | { kind: "reply"; reply: HelperReply }
  | { kind: "timeout"; seconds: number }
  | { kind: "cancelled" }
  | { kind: "stopped" }
  | { kind: "busy" }
  | { kind: "unavailable"; reason: "missing" | "cannot-start" | "bad-request" | "no-cancel-window"; detail?: string };

/** A capture that did not work. `message` is for the author to read, `code` is for the app to act on. */
export interface Failure {
  ok: false;
  code: string;
  message: string;
}

export type Done<T> = { ok: true; value: T } | Failure;

export function failure(code: string, message: string): Failure {
  return { ok: false, code, message };
}

/** The plain words for everything that can go wrong before the helper gives an answer. */
export function failureFor(outcome: Exclude<ShellOutcome, { kind: "reply" }>): Failure {
  switch (outcome.kind) {
    case "timeout":
      return failure(
        "timeout",
        `The program did not answer within ${outcome.seconds} seconds, so the capture was stopped. ${UNCHANGED}`,
      );
    case "cancelled":
      return failure("cancelled", `You cancelled the capture. ${UNCHANGED}`);
    case "stopped":
      return failure("stopped", `The capture helper stopped without giving a picture. ${UNCHANGED} Try again.`);
    case "busy":
      return failure("busy", "Another capture is still running. Wait for it to finish, or cancel it, then try again.");
    case "unavailable":
      switch (outcome.reason) {
        case "missing":
          return failure(
            "helper-missing",
            `The capture helper was not found. Double-click "Test Helper.bat" in the OpenExplainer folder to build it, then try again. ${UNCHANGED}`,
          );
        case "cannot-start":
          return failure("helper-cannot-start", `The capture helper could not start${outcome.detail ? ` (${outcome.detail})` : ""}. ${UNCHANGED}`);
        case "no-cancel-window":
          return failure(
            "no-cancel-window",
            `OpenExplainer could not show its Cancel window, so it did not start the capture. ${UNCHANGED}`,
          );
        default:
          return failure("app-error", `OpenExplainer could not make the capture request${outcome.detail ? ` (${outcome.detail})` : ""}. ${UNCHANGED}`);
      }
  }
}

/** The helper refused or could not do the capture: its message is already plain words, so it is kept and the reassurance added. */
export function failureFromHelper(error: { code: string; message: string }): Failure {
  const message = error.message.trim();
  return failure(error.code, `${message}${/[.!?]$/.test(message) ? "" : "."} ${UNCHANGED}`);
}
