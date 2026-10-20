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
   screens to the exact colour, the whole screen (size only), mistakes, labels, bring to front, and the part 5 checks again.
   **Select on the screen** (2026-10-18, Jason chose the snapshot approach): a button in the rectangle part of the dialog takes a snapshot of the chosen
   screen, shows it full screen in its own window (`selection.html`, `src/selection.ts`, rules and tests in `src/capture/selection.ts`), and the picture is
   cut from that snapshot by a new helper command `crop-picture`. Mouse (draw from outside, move inside, corner handles), keyboard (arrows, Shift resizes,
   Control x10, Enter, Escape) and the four number boxes work together, with a live region and a written size. Fail-safes: Escape, Cancel, window close,
   a 5-second start limit, a vanished window counts as Cancel; snapshots are deleted on every path and old ones swept at start. Tried in the real window
   on screen 2 (see `docs/capture-helper.md`). Counts: helper 47, app shell 13, TypeScript 67 (65 pass; the 2 old `python3` ones fail on this PC).
   **Wait before capturing** (2026-10-19, Jason asked for it): a box in the Capture dialog, 0 to 60 seconds, for a window, a typed rectangle and
   Select on the screen. The shell hides the app, shows the Cancel window as a count-down, waits (cancellable at once), and only then starts the helper
   or takes the snapshot, so the 20-second limit starts after the wait. During a wait the Cancel window does NOT take the keyboard (so a menu the author
   opened stays open); Alt+Tab then Esc cancels from the keyboard. A menu is a window of its own, so a *window* capture leaves it out: use a rectangle or
   Select on the screen (the dialog says so). The last wait used is kept until the app closes. No format change. Tried in the real window (see
   `docs/capture-helper.md`). Counts: helper 47, app shell 16, TypeScript 72 (70 pass; the 2 old `python3` ones fail on this PC).

Still to build, in this order, testing each on this PC (6 left two things for Jason to decide, see "Still open"):
7. Then click-by-click capture: low-level mouse hook, a still picture per click, and Windows UI Automation details of the clicked item
   (name, role, accelerator/hot key, description, position). NEVER store password fields. Store the click position so the highlight can be
   added or removed later. Plan agreed in words with Jason on 2026-10-19 ("Change and continue"), in four parts:
   a. **Format version 3 (DONE 2026-10-19)**: a picture can hold a click note (`click`: position in picture pixels, button, double, and a `target`
      with name, role, accelerator key, access key, description, outline). A password box is reduced to `{password: true}` and anything off the list
      (such as text typed in a box) is dropped, both when a project is opened and when it is saved (`src/project/clicks.ts`). Migration 2 to 3 adds
      nothing. `describeClick` says a click in plain words. Tests in `tests/clicks.test.ts`; `docs/format-spec.md` updated. Counts: helper 47, app
      shell 16, TypeScript 83 (81 pass; the 2 old `python3` ones fail on this PC).
   b. **The helper watches clicks (DONE 2026-10-19)**: `watch-clicks` and `stop-watching` (see `docs/capture-helper.md`). Jason's answers: a picture of
      the WHOLE screen the click was on, taken just before the program reacts (the hook holds the click back about 40 ms to copy the screen),
      a session ends by itself after 10 idle minutes (default; plus a 200 click safety limit I added), and names are kept only for buttons, menus
      and similar controls (not list items). My judgment on top: tabs and links also have their names withheld (page titles, link text); one
      list, `details_allowed` in `capture-helper/src/clicks.rs`, to change that. A password box is only `{password: true}`. Clicks in the app's own
      windows (the Stop button) are ignored. A double-click is one step. Events are JSON lines with an `event` and a `watch` field. Files:
      `capture-helper/src/clicks.rs` (rules, 13 tests), `watch_windows.rs` (hook, UI Automation, saving), `Test Click Capture.bat`. Counts: helper 60,
      app shell 16, TypeScript 83 (81 pass).
   c. The app side: a third choice in the Capture dialog, "Click by click", with an always-visible Stop window (it must be kept out of screen
      copies, like the Cancel window, and the app must keep the helper's events coming while it hides itself). The shell needs a streaming version
      of `run_helper` (the current one is one request, one reply).
      **First half DONE 2026-10-19**: the shell runs a whole session (`src-tauri/src/capture/clicks.rs`: `watch_clicks`, `stop_clicks`,
      `click_session_status`, tested with a pretend helper), the Stop window (`click-bar.html`, `src/click-bar.ts`), and the TypeScript client
      (`client.watchClicks()`, `src/capture/clicks.ts`, 13 tests). Tried in the real window with real clicks (see `docs/capture-helper.md`).
      Counts: helper 60, app shell 25, TypeScript 96 (94 pass; the 2 old `python3` ones fail on this PC).
      **Second half DONE 2026-10-19** (Jason said yes to my defaults): the *Click by click* choice in the Capture dialog (explanation, wait box hidden,
      button *Start capturing clicks*) and the review list after Stop (`reviewClicksDialog`, rules in `src/capture/review.ts`, 6 tests): every click in
      order with its picture, the click in words, a *Keep* tick, and a description box that starts EMPTY with a button the author presses to use the
      click's words; Enter moves to the next box; OK adds the kept pictures to the selected topic in click order as `source.kind` `click` with the
      `click` note; throwing away asks first. Tried in the real window. Counts: helper 60, app shell 25, TypeScript 102 (100 pass; the 2 old
      `python3` ones fail on this PC).
   d. **Format version 4 DONE 2026-10-19** (Jason's answers to my four questions: capture type means where a picture is used, Book or Quick guide, so the
      project keeps `highlight: { book, guide }` with `show`, `size` (percent of the picture's width), `color`, `seeThrough` (starting look: yellow,
      40 percent see-through, 3 percent, off for the book and on for a quick guide), kept IN THE PROJECT; and each picture may have its own
      `highlight { show?, x?, y? }`: follow the project, always, never, and a moved circle). Rules in `src/project/highlight.ts` (12 tests), migration
      3 to 4, `docs/format-spec.md` updated.
      **The editor side DONE 2026-10-19**: the circle drawn over thumbnails (SVG in picture pixels), click details in the picture list, *Click circle
      settings* (`highlightDialog`, with a live sample and ready-made colours), the Book / Quick guide preview choice, and per picture *Follow the
      project setting / Always show / Never show* and *Move the circle* (`moveCircleDialog`). Tried in the real window. Counts: helper 60, app
      shell 25, TypeScript 121 (119 pass; the 2 old `python3` ones fail on this PC). NOT done: drawing the circle in an export (the book, a quick
      guide) with the same rules (`circleFor`), and saving then opening a project with these settings through the app's own Save and Open.
      Original wording: showing click notes in the picture list (the kind of item, the shortcut keys), then the yellow click highlight drawn from the stored position
      (per capture type, adjustable size, colour and see-through level, from Jason's design). NOT built. Also not done for click pictures: the picture
      list shows only the name and the description, and Save and Open of a project with click pictures were not driven through the real app (the
      format and its unit tests cover them).
   Jason answered the four questions for b on 2026-10-19 (see b). Still to ask before c: what the author sees for each click picture (a review
   list to describe each picture, or one at a time), whether the Stop window also shows the click count, and where the steps go (one topic, one
   picture per step).

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

Lessons from Select on the screen:
- A full-screen always-on-top window must have every way out: Escape, a Cancel button, the window's close, a start limit that closes it if its page never
  reports in (the app, not the page, enforces it), and a vanished window counted as Cancel. Keep it in the taskbar so Alt+Tab still finds it.
- Show the snapshot at `natural size / devicePixelRatio` and convert mouse positions back with the same ratio: the window is sized in real pixels
  (`set_size(PhysicalSize)`), so at 150 percent the page is 1280 pixels wide for a 1920 pixel snapshot. Only 100 percent was tried.
- Dragging inside the current rectangle moves it, so a big starting rectangle makes drawing a new one awkward: the start is a smaller centred rectangle
  and the instructions say to drag from outside.
- A test driver must wait for a page to finish loading before asking it questions (a connection can open before the DOM exists), and must close a
  selection window it leaves open, or every later scenario fails.
- Killing the app while the selection window is open leaves the snapshot in `%TEMP%\openexplainer-capture`; the startup sweep removes it after an hour.

Lessons from part 6:
- `SetForegroundWindow` from the helper worked, both from a test tool and from inside the app. Wait about 150 ms after it for the window to repaint
  as active. Do not do it for a program that is not responding.
- In a test driver, a frozen test window is only "frozen but not yet flagged" for 5 seconds. Start the capture 1 to 2 seconds after the freeze begins
  (hang after 4 seconds, wait about 4.8 seconds, then click), or the helper takes its quick route and the Cancel window is gone before a test can find it.
- A test that starts its own helper to look at windows will itself be counted as a "capture helper still running": check for leftover processes by who
  started them (parent process id), not by name alone.
Lessons from the click circle:
- `circleFor` (`src/project/highlight.ts`) is the one place that decides whether and where a circle goes and how big and see-through it is. The
  editor and the settings sample use it; an export must too, so the book and the editor can never disagree.
- A percent see-through must be rounded to two decimals as a fraction (75 gives 0.25). One decimal drew 0.3.
- A text box that edits a number should say the allowed range in its label, and the check function should explain a mistake with the typed text in
  quotes ("big" is not one) and say which box it is in, as for the rectangle boxes.
- A test scenario that changes settings leaves them changed for the next run in the same app session: restart the app between runs.
- `Page.captureScreenshot` clip coordinates are page coordinates, so add the scroll offsets to a bounding box taken after scrolling.

Lessons from the click dialog and review list:
- Injected test clicks are real mouse movements, so a person using the PC at the same time can move the pointer between `SetCursorPos` and the
  click and land it on their own program. A run that finds the wrong row is not an app bug: repeat it, and never look at pictures unless every click
  in the list is the test's own (the review-list picture was only taken when the list had exactly the three test clicks).
- `Enter` inside a text box in a `<form method="dialog">` presses the first submit button. In the review list that would add every click, so Enter
  in a description moves focus instead.
- A modal dialog's `cancel` event (Escape) can be turned into a question with `preventDefault()`; the browser still closes it on a second Escape
  without a key press in between, so there is no keyboard trap.

Lessons from click by click (part 7c, first half):
- A session records EVERY click on the screen, including the person's own while a test runs. Tests must look only for their own clicks (by
  name) and must never print the notes of clicks they did not make: one early run printed a button name from Jason's own browser. The pictures
  are held in memory and deleted unseen.
- A newly opened window may not be hidden-main yet when a test first sees it: the Stop window appears a few milliseconds before the main window is
  hidden, so wait a moment before checking.
- The Stop window is opened with `.focused(false)` like the Cancel window during a wait, and a child module of `capture.rs` can use its private items
  (`HelperRun`, `CaptureState`, `Choreography`), which is why click code lives in `capture/clicks.rs` and not a sibling file.
- A small window needs its height checked as a picture (a scroll bar showed at 200 pixels; 250 is right for the text).

Lessons from click by click (part 7b):
- A low-level mouse hook only works while its thread keeps taking messages, and Windows removes a hook that holds a click too long (about 300 ms),
  so the hook thread only copies the screen; Windows UI Automation runs on its own thread (it can hang on a stuck program) and PNG saving on a third.
- The helper's stdout is now shared by the main thread and the click threads, so every line goes through `protocol::send_line` (one lock). Do not
  hold `stdout().lock()` for a whole loop again.
- To test real clicks, inject them with `mouse_event` from a script (they pass through the hook). Make the made-up window react on MouseDown, then
  a picture that still shows the old state proves the picture was taken before the program reacted. Test windows go on the second screen, topmost, so
  a stray click can never land on Jason's own programs. The pointer moves by itself during these tests.
- C# test windows: `AccessibleDescription` does not come through UI Automation's help text, so `description` was never seen in a test.
- `csc.exe` options from Git Bash need a dash (`-nologo`, `-out:`), not a slash, or bash turns them into paths.

Lessons from the wait:
- The Capture dialog remembers the last wait for the rest of the app session. A test that does not set the box itself inherits the old number: after
  my wait tests the frozen-program and time-limit checks "failed" (a 5-second wait lets a frozen window become a stand-in "Ghost" window, which
  captures fine). Set the wait box in every test, or restart the app between groups of tests.
- A pop-up menu closes when the program that owns it is deactivated, and even a tap on Alt (the trick used to bring a test window forward) closes it.
  Make the menu appear during the wait, after any activation. A pixel check of "not the window colour" passed once for the wrong reason (black text
  under where the menu should be): look at the pictures of anything visual.
- A test cannot move the keyboard to a window just by calling `SetForegroundWindow` from a background script; a tap on Alt first lets it. The checks
  print only the program name of the window that has the keyboard, never a window title, so nothing of Jason's own windows is shown.
- PowerShell on this PC refuses to run scratch `.ps1` files unless started with `-ExecutionPolicy Bypass`.
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
- Capture: should the wait be remembered between runs of the app (now it is only remembered while the app stays open)? Should there be a way to cancel
  a wait from the keyboard without Alt+Tab, for example a global hot key (it would need a new permission and a plain-words explanation)?
- Capture: whether "Bring the window to the front first" should be on by default (it is off, because the keyboard is then with the other window and
  Escape does not reach the Cancel window, and it changes which window is on top).
- Steps 1 and 2 leftovers: more double-click scripts (build, tests), keyboard and screen reader pass, ARM check.

## Housekeeping on Jason's PC

a step-by-step screen capturing program may still be open with an unsaved test project, and there may be an untitled a step-guide program guide. Harmless; mention if relevant.
