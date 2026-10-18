# Handoff for a new Claude Code session

Written 2026-10-18 by the Claude session that designed OpenExplainer and built Steps 1 to 3a from the cloud.
That session could not compile Windows code, so the work moves here, to a session on Jason's PC.

## Who you are working with

Jason S. Wrench. He is not a programmer and does not use a terminal or Python. Everything he needs to run must be a
double-click `.bat` file, and explanations must be in plain language. He is on Windows 11 x64 (the ARM build is untested).
He pastes errors and screenshots back, so make failures print something readable and keep the window open (`pause`).
No em dashes in prose. When a choice could go either way, ask.

## What OpenExplainer is

A free, open-source (Apache 2.0) desktop tool for making still-image tutorials and how-to books from screen captures.
Think a step-by-step screen capturing program, but his own design: nothing is copied from a step-by-step screen capturing program, a step-guide program, a screen capture program or an eLearning authoring suite. First job: document
OpenStage Author (his separate eLearning authoring tool, folder `C:\Users\Jason\OpenStage`) in a book modeled on
"a published how-to book for an eLearning authoring platform" (about 15 chapters, appendix, index, numbered procedures, callout boxes,
lettered screenshot callouts). It is a completely separate product from OpenStage: separate repository, build and run.

The full design and the ten-step build list live in two Docs files (they may not be readable from here; this note is the summary):
- Design spec: https://claude.ai/code/artifact/82e1a1c1-bbeb-4c44-8b5a-106fac062540
- Build to-do list: https://claude.ai/code/artifact/006c0032-30d3-4dd7-9fbf-ae8ecf82cddd

## Decisions already made

- TypeScript with a Tauri shell. Rust only where native Windows capture needs it. No Python anywhere in the product.
- Windows first; build for ARM and x64.
- Still images only. No video.
- Primary output: printed book (tagged PDF and Word). After that: help site (HTML), JSON with images, Markdown.
- Also short step-by-step guides in two layouts: (a) picture on top, text below; (b) up to three pictures on the left, text beside.
  One task per guide by default, with the option to hold several or combine small tasks.
- Optional yellow click highlight (per capture type, adjustable size, color, see-through level), drawn from the stored click position.
- Simple drawing tools: arrow, text box (white background by default), rectangle, numbered marker. Colors changeable, saved named
  styles (for example a red box with white lettering). Stored as shapes beside the picture, never burned in.
- Contrast checker always on, as a WARNING ONLY (bad contrast may be deliberate). Accessibility check before export is optional, never required.
- AI help is optional. Default: local Qwen 3.5, downloaded during first install (progress, resume, cancel). Or the author's own ChatGPT,
  Claude or Gemini key. Everything must work by hand with no AI. An MCP server lets assistants read a project, add and draft topics, and run exports.
- OpenStage or OpenScreen code: starts with none. Copy only what is clearly useful, small and marked, and credit it in `NOTICE`.
- Callout letters belong to pictures; numbers belong to procedure steps.
- Status is never color alone (word plus symbol).

## State of the code (all on main)

Done and tested on Jason's PC (x64): Steps 1 and 2: app shell, licence checker, project model, chapter tree with numbering and status,
one-file project package (`.openexplainer`), variables dialog, template choice, find and replace in titles, Save and Save as.
Step 3a: format version 2, pictures per topic, import of PNG and JPEG screenshots with a required description prompt, picture list.
Step 3a was tested by unit tests only (19 pass) and not yet by Jason in the app.

Layout: `src/project/*` (model, migrate, files, zip, package, image, disk), `src/main.ts` (UI), `src/dialogs.ts`,
`tests/*.test.ts` (run `npm test`, uses Node's type stripping, no extra tools), `tools/check-licences.mjs`,
`src-tauri/` (Tauri shell; permissions in `capabilities/default.json`), `docs/format-spec.md`.
Double-click scripts: `Run OpenExplainer.bat`, `Check Licences.bat`, and for the capture helper (see `docs/capture-helper.md`) `Test Helper.bat`,
`Test Window List.bat`, `Test Window Capture.bat`. The helper is its own program in `capture-helper/` (Rust, 26 tests) and is not yet used by the app.

## Lessons already learned (save yourself the time)

- Tauri permissions are compiled into the app. After editing `src-tauri/capabilities/default.json`, touch `src-tauri/build.rs` or the old
  permissions stay and saving fails with "not allowed".
- `vite.config.ts` must ignore `**/src-tauri/**` in the watcher, or Vite crashes on locked Rust build files.
- Use `npm.cmd`, not `npm` (PowerShell blocks the .ps1 shim). The run script already does.
- a step-by-step screen capturing program hung for minutes when told to capture its own window. OpenExplainer must never capture itself.

## Step 3b, the Windows capture helper: parts 1 to 3 are done, 4 to 7 are next

Goal (from the to-do list): capturing a program that has stopped responding never freezes OpenExplainer.

Done on 2026-10-18 by the session on Jason's PC (Windows 11 x64), and tried there. Read `docs/capture-helper.md` for the
messages, the error codes, and what was and was not tried.
1. A separate Rust program in `capture-helper/` (its own `Cargo.toml` with an empty `[workspace]`, so it is not part of the Tauri crate and
   a helper error cannot break the app build). The app starts it as a child process and talks to it with one JSON line in, one JSON line out.
2. `list-windows`: titles, programs, rectangles, minimized and not-responding flags, display scale. It follows the Alt+Tab rule and leaves out
   its own program and the program that started it.
3. `capture-window`: PrintWindow first, a screen copy if that gives nothing, and the reply says which was used. Invisible window borders are
   trimmed. Tried with two monitors, a window with another in front, a minimized window (plain message), a closed window, the app's own window
   (refused), a program that stopped responding (a picture in about 30 ms; Windows' "Ghost" stand-in window counts as the window), and an Edge window.
   Double-click tests: `Test Helper.bat`, `Test Window List.bat`, `Test Window Capture.bat` (they run `tools/capture-helper-test.mjs`).

Still to build, in this order, testing each on this PC:
4. `capture-region`: four numbers (x, y, width, height), plus a drag-to-select overlay later.
5. Timeout (default 20 seconds) enforced by the app, which kills the helper; an always-visible Cancel; the app window hides itself during
   capture so it never captures itself; a failed capture leaves the project unchanged and says why in plain words.
6. Wire it into the app: a Capture button that adds the PNG as a Picture with `source.kind` of `window` or `region`
   (the Picture type already supports it). Use Tauri's sidecar/shell plugin; keep permissions minimal and rebuild after editing them.
7. Then click-by-click capture: low-level mouse hook, a still picture per click, and Windows UI Automation details of the clicked item
   (name, role, accelerator/hot key, description, position). NEVER store password fields. Store the click position so the highlight can be
   added or removed later. This needs a format version 3 and a migration, plus a `docs/format-spec.md` update.

Reference (read only, for ideas, not for copying wholesale): OpenStage's Rust capture crates under `D:\Documents\OpenStage\capture\crates\` on this
PC (the first version of this note said `C:\Users\Jason\OpenStage`, which does not exist here) (`openstage-capture-windows`, `-protocol`, `-project`,
`-render`, `-cli`) and its `docs/decisions/0001-screen-capture.md`. Nothing was copied from it for parts 1 to 3: its window listing says it was
only type-checked, never run, so the helper's was written fresh and tried for real.
Do not adopt outside recorders' code (copyleft). Any Rust crate must be permissive; `tools/check-licences.mjs` now covers
`capture-helper/Cargo.toml` as well as `src-tauri/Cargo.toml`.
Known limit: apps like Notepad expose little accessibility data, so labels come back generic. The later AI drafting step gives them real names.

Also check ARM: build the helper for `aarch64-pc-windows-msvc` as well as x64, even if Jason can only run x64 today. Rust on this PC has only the
`x86_64-pc-windows-msvc` target, so adding ARM (`rustup target add aarch64-pc-windows-msvc`) is a download that needs Jason's yes.

Lessons from parts 1 to 3:
- When a program stops responding, Windows puts a stand-in window of class `Ghost` in front of it, titled "... (Not Responding)", owned by a
  different process. A check for "is this window in front?" must count that stand-in as the window.
- `PrintWindow` pictures only the one window. A program's modal dialog is a separate window and is not in it (Edge's sign-in dialog dimmed the page
  and was not in the picture). Owned dialogs are also not in the window list, because the list follows the Alt+Tab rule.
- Test with made-up windows, not the author's own: a tiny program built with the `csc.exe` that ships with Windows made a clean target. PowerShell
  `Start-Process -WindowStyle Hidden` hides the target's first window too, and Windows PowerShell 5.1 strips the quotes from JSON passed to a program.
- A fresh Edge profile can sign in with the PC's account and start syncing by itself, so do not use Edge for test windows.

## Still open (ask Jason, do not guess)

- Qwen 3.5: which size, and what its weights licence allows (audit before downloading or bundling).
- MCP server: which actions to offer first.
- Which the reference authoring platform page styles to copy exactly versus only resemble; how much detail per feature in the OpenStage book.
- The name "OpenExplainer" has not been checked for conflicts on GitHub and elsewhere.
- Capture helper: should the window list also show a program's dialogs (marked as belonging to it) so a native dialog can be captured by itself?
  Region capture can also take one.
- Capture helper: Windows 11's rounded corners leave a few black or background pixels in the picture's corners. Save with transparent corners, or leave?
- Steps 1 and 2 leftovers: more double-click scripts (build, tests), keyboard and screen reader pass, ARM check.

## Housekeeping on Jason's PC

a step-by-step screen capturing program may still be open with an unsaved test project, and there may be an untitled a step-guide program guide. Harmless; mention if relevant.
