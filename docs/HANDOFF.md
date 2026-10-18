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
`Test Window List.bat`, `Test Window Capture.bat`, `Test Region Capture.bat`. The helper is its own program in `capture-helper/` (Rust, 39 tests) and is
not yet used by the app.

## Lessons already learned (save yourself the time)

- Tauri permissions are compiled into the app. After editing `src-tauri/capabilities/default.json`, touch `src-tauri/build.rs` or the old
  permissions stay and saving fails with "not allowed".
- `vite.config.ts` must ignore `**/src-tauri/**` in the watcher, or Vite crashes on locked Rust build files.
- Use `npm.cmd`, not `npm` (PowerShell blocks the .ps1 shim). The run script already does.
- a step-by-step screen capturing program hung for minutes when told to capture its own window. OpenExplainer must never capture itself.

## Step 3b, the Windows capture helper: parts 1 to 6 are done, 7 is next

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
4. `list-screens` and `capture-region` (2026-10-18). `list-screens` gives each screen's position (negative for a screen left of or above the
   main one), size and scale. `capture-region` takes four numbers in real screen pixels on the whole desktop and makes a screen copy. It refuses a
   rectangle with no size, one that is not entirely on the screens (the gap between two screens counts as off-screen), and one where a window of
   OpenExplainer (the helper's own program, its parent, or any `exclude_pids`) is really showing, which is the "never captures itself" rule for
   regions. Tried with exact colours on both screens; double-click test: `Test Region Capture.bat`. The drag-to-select overlay is NOT built (the
   handoff said "later"); it will need a window of its own and the same keyboard and screen reader rules as everything else.

5. The app side (2026-10-18): `src-tauri/src/capture.rs` runs the helper on a background thread with a 20-second limit and stops it on timeout or Cancel;
   a small always-on-top Cancel window (`capture-bar.html`, kept out of screen copies) is shown and the main window hidden while it runs, and both
   are restored however it ends; `src/capture/` holds the plain wording and the rule that a failed capture changes nothing; a plain *Capture a window
   into the selected item* button (Pictures section) lets it be tried. The helper learned to look through windows kept out of screen copies.
   Tried in the real window (development build driven through its debugging port): a normal capture, a frozen program, five ways to cancel, the
   time limit, a closed window, a helper that never answers, a missing helper. See `docs/capture-helper.md`, "What the app does". Test counts:
   helper 39, app shell 10, TypeScript 13 new (30 pass, 2 old `python3` ones fail on this PC).

6. The Capture dialog (2026-10-18): one dialog, *Capture into the selected item*, for **a window** (list box, refresh, and a *Bring the window to the
   front first* tick box that is off unless ticked) or **a rectangle of a chosen screen** (a Screen list, four boxes counted from that screen's top
   left corner, *Use the whole screen*). Mistakes in the boxes are explained next to them in plain words and the dialog stays open
   (`src/capture/region.ts`, tested). The helper's `capture-window` took an optional `activate` (makes the window active so its title bar is not grey;
   black title text 0 with it, grey 145 without). Pictures get `source.kind` `window` or `region`; no format change. Tried in the real window: both
   screens to the exact colour, the whole screen (size only), mistakes, labels, bring to front, and the part 5 checks again. Counts: helper 40, app
   shell 10, TypeScript 46 (44 pass; the 2 old `python3` ones fail on this PC).

Still to build, in this order, testing each on this PC (6 left two things for Jason to decide, see "Still open"):
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

Lessons from parts 1 to 4:
- Windows may leave gaps between screens set at different heights (here 7 pixels beside the higher screen), so "inside the whole desktop" is not
  the same as "on a screen". Check a region against each screen's own rectangle (`covered_by` in `capture-helper/src/pixels.rs`).
- A region copy leaves out the helper's own program and the program that started it (the app, as its parent), plus any `exclude_pids`. The helper decides
  by what is really showing at points in the overlap, not by overlap on paper, so a window hidden behind another one does not count. When the helper is
  started by something other than the app (a test tool), name the pretend app in `exclude_pids`.
- Windows PowerShell passes a bare `-50` to a function as text, which the helper rightly refuses as not a number: type the parameters (`[int]`).
- A test tool reading typed answers with a new reader for each question loses lines when input is piped from a file; use one reader for the run.
- When a program stops responding, Windows puts a stand-in window of class `Ghost` in front of it, titled "... (Not Responding)", owned by a
  different process. A check for "is this window in front?" must count that stand-in as the window.
- `PrintWindow` pictures only the one window. A program's modal dialog is a separate window and is not in it (Edge's sign-in dialog dimmed the page
  and was not in the picture). Owned dialogs are also not in the window list, because the list follows the Alt+Tab rule.
- Test with made-up windows, not the author's own: a tiny program built with the `csc.exe` that ships with Windows made a clean target. PowerShell
  `Start-Process -WindowStyle Hidden` hides the target's first window too, and Windows PowerShell 5.1 strips the quotes from JSON passed to a program.
- A fresh Edge profile can sign in with the PC's account and start syncing by itself, so do not use Edge for test windows.

Lessons from part 5:
- Tauri's `#[tauri::command] fn` (not `async`) runs on the thread that draws the window, so anything that waits must be an `async fn` that hands the
  waiting to `tauri::async_runtime::spawn_blocking`. Window changes (hide, show, make a window) are safe from that background thread.
- `WebviewWindowBuilder::content_protected(true)` sets Windows' "exclude from capture". A window with it is left out of screen copies (BitBlt too, not
  only recorders), which is how the Cancel window can be always visible and never in a picture. The helper's own-window and in-front checks look through it.
- Do not pass a query string in `WebviewUrl::App("page.html?x=1")` (it may be encoded); pass values with `initialization_script` instead.
- A second Tauri window can call the app's own commands (`invoke`) without being listed in `capabilities/default.json`: capabilities only gate
  plugin and core commands. Nothing was added to the permissions.
- The real window can be driven for tests: start `npm.cmd run tauri dev` with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, then
  talk to `http://127.0.0.1:9222/json` targets over a WebSocket (Node 24 has `WebSocket` built in). A page of its own window (the Cancel window) is a
  second target. `tauri dev` rebuilds and restarts the app when a Rust file changes.
- A window you capture right after the app had focus may show a greyed title bar (inactive). Part 6 added the *Bring the window to the front first*
  choice (the helper's `activate`), off by default.

Lessons from part 6:
- `SetForegroundWindow` from the helper worked, both from a test tool and from inside the app. Wait about 150 ms after it for the window to repaint
  as active. Do not do it for a program that is not responding.
- In a test driver, a frozen test window is only "frozen but not yet flagged" for 5 seconds. Start the capture 1 to 2 seconds after the freeze begins
  (hang after 4 seconds, wait about 4.8 seconds, then click), or the helper takes its quick route and the Cancel window is gone before a test can find it.
- A test that starts its own helper to look at windows will itself be counted as a "capture helper still running": check for leftover processes by who
  started them (parent process id), not by name alone.
- Never put a backslash-n inside a string in a script written through a shell here (it turns into a real new line): use `String.fromCharCode(10)` or
  write the file with a file-writing tool.

## Still open (ask Jason, do not guess)

- Qwen 3.5: which size, and what its weights licence allows (audit before downloading or bundling).
- MCP server: which actions to offer first.
- Which the reference authoring platform page styles to copy exactly versus only resemble; how much detail per feature in the OpenStage book.
- The name "OpenExplainer" has not been checked for conflicts on GitHub and elsewhere.
- Capture helper: should the window list also show a program's dialogs (marked as belonging to it) so a native dialog can be captured by itself?
  Region capture can also take one.
- Capture helper: Windows 11's rounded corners leave a few black or background pixels in the picture's corners. Save with transparent corners, or leave?
- Capture: the drag-to-select overlay (on the to-do list: "by dragging or by typing four numbers"). Typed numbers are done. Two ways to build the drag:
  (A) take a snapshot of the chosen screen with the helper, show it full screen in an app window and select on that (easy to make keyboard and screen
  reader friendly with arrow keys, Shift to resize and the four boxes as the equivalent; whatever was on the screen is frozen, so a menu another
  program would close can still be captured), then crop; or (B) a transparent live overlay (more work; the window under it keeps changing). Recommended:
  A. Ask Jason before starting it.
- Capture: a delay ("wait 5 seconds, then capture") so an author can open a menu first. Small, but not on the to-do list, so ask.
- Capture: whether "Bring the window to the front first" should be on by default (it is off, because the keyboard is then with the other window and
  Escape does not reach the Cancel window, and it changes which window is on top).
- Steps 1 and 2 leftovers: more double-click scripts (build, tests), keyboard and screen reader pass, ARM check.

## Housekeeping on Jason's PC

a step-by-step screen capturing program may still be open with an unsaved test project, and there may be an untitled a step-guide program guide. Harmless; mention if relevant.
