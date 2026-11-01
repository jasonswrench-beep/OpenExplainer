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
- The app icon (given by Jason, 2026-10-22, "going forward this is the icon for the software"): a yellow open viewfinder with a capture circle and an extended upper-right corner on a navy rounded tile. The source is `src-tauri/icons/app-icon.svg` (kept exactly as Jason supplied it; its title and description say "OpenCapture", which is not this product's name, so ask before renaming anything).
  The PNG, ICO and ICNS files beside it are made from it with `npx tauri icon src-tauri/icons/app-icon.svg` (the tool takes an SVG directly, so no PNG is needed); only the ones the Windows build uses are kept (`icon.png`, `icon.ico`, `icon.icns`, `32x32.png`, `128x128.png`, `128x128@2x.png`, listed in `tauri.conf.json`). The Store, Android and iOS sizes are not kept; make them when those targets exist.

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
Lessons from the editor:
- The page is drawn again only when the topic, its title or its pictures (or their descriptions) change, never while typing: a redraw on every key would take the keyboard from the box. `renderPictures()` in `src/main.ts` asks the editor to refresh, and the editor compares a key.
- A button that becomes disabled after it is pressed (Move up on the first block) must hand the keyboard to the other one, or the keyboard falls to the page.
- The properties pane is redrawn on every edit (`changed` also calls `renderProperties`), so its word count follows typing.
- Node-side regular expressions in the scratch tests must not double their backslashes; only the ones inside page.eval template strings do.

Lessons from the loose ends (2026-10-19):
- **Windows' own Save and Open dialogs cannot be driven reliably from a test.** What was learned: they are children of the app's main window in the
  accessibility tree (not top-level), their File name box is a ComboBoxEx32 > ComboBox > Edit (control id 1148), the buttons are classic controls (Save or
  Open id 1, Cancel id 2) that do not support Invoke, and the box swallows letters that are posted or typed too fast while its auto-complete is open
  ("Jason" arrived as "Jaon"), and ignores text set with WM_SETTEXT. Worse, the dialog then uses its default name and asks "Untitled project.openexplainer
  already exists. Do you want to replace it?" in the folder it opens in, which is where Jason's real files are. NEVER answer Yes to that question from a
  test; close the dialog by restarting the dev app. A test that needs a file path has no safe way in, so the file round trip is tested inside the window
  with `packProject` and `unpackProject` on a project built from real captured pictures, and the dialogs remain a manual check for Jason: capture a few
  clicks, Save as, make a new project, Open the saved one, and check the pictures, the circle settings and each picture's circle choice came back.
- The fs plugin only allows paths the dialog picked (`forbidden path ... allow-write-file`), so a page cannot write a test file itself.
- A plain `<dialog>` in the app's window had one Tab stop on nothing between the last control and the first. `wrapTab` in `src/dialogs.ts` closes it for
  every dialog. The keyboard pass is a scenario that sends real key events (`rawKeyDown` then `keyUp`, so the browser does its default action).
- A screen reader was not run. It cannot be run from here.

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

## Step 4, Editor and callouts (started 2026-10-20)

Jason's answers (2026-10-20): the page is edited as a **block editor** (each paragraph, step and callout box is its own labelled text box with Add, Move up,
Move down and Delete; not a free-flowing word-processor, which is harder to make accessible and to export); text has **plain text plus a few marks** (bold,
italic and a "control name" mark, typed as `**bold**`, `*italic*`, `[[Control name]]`); build **the page text and the three panes first**, then lettered
callouts and picture views. The design (Claude Docs "OpenExplainer Design Spec", section 6) says: three panes (tree left, page middle, properties right) with a
preview tab for print and one for the help site; procedures are numbered steps with an optional picture and callout and a result line; callout boxes are
Design Tip, Caution, Bright Idea, Power Tip, Time Saver and a new-feature marker; callouts on pictures are lettered markers with a leader line placed
automatically from the captured items, movable and deletable, each with an entry under the picture; picture views are full window, cropped region and zoomed
focus on the clicked area; the editor also has find and replace across the book, a check tool, and comments on any paragraph.

Parts, in order:
1. **Format version 5, the page model and the text marks (DONE 2026-10-20)**: `src/project/page.ts` (blocks, cleaning, moving), `src/project/text.ts` (marks),
   `src/project/ids.ts`, pages saved as `topics/<id>.json` (`src/project/files.ts`), migration 4 to 5, `docs/format-spec.md` ("The page"). Counts: helper 60,
   app shell 25, TypeScript 149 (147 pass; the 2 old `python3` ones fail on this PC). The panes and editor have no Node tests (they are drawn on a screen) and were tried in the real window.
2. **The three panes and the block editor (DONE 2026-10-20)**: `src/page-editor.ts` (the middle pane), the properties pane and F6 in `src/main.ts`, styles in
   `src/style.css`, written up in `docs/editor.md`. Heading, paragraph, picture, numbered procedure and callout box blocks, each with Move up, Move down and
   Delete, marks buttons, a preview of the marks, announcements. Tried in the real window (see `docs/editor.md`).
3. **Procedures and callout boxes (DONE 2026-10-20, in the same piece)**: steps with an optional picture and result line, and the six kinds of box.
4. **Lettered callouts on pictures (DONE 2026-10-20; Jason chose: made automatically from a click picture's clicked item, and moved with typed numbers first,
   mouse dragging later)**. a. **Format version 6 and the rules**: `Picture.callouts`, `src/project/callouts.ts` (letters, marker placement, entries, leader
   line geometry, the dialog's checks, cleaning, `newCalloutFromClick`, `setCallouts`), 19 tests, `docs/format-spec.md` ("Lettered callouts"). b. **Drawing and
   entries**: `src/picture-marks.ts` draws the click circle and the callouts over a picture (an SVG laid over it, hidden from a screen reader) and lists the
   entries under it; used by the Pictures list thumbnails and by `src/page-editor.ts` (picture blocks and step pictures). c. **The Callouts dialog**
   (`calloutsDialog` in `src/dialogs.ts`, the Callouts button on each picture in `src/main.ts`) and the first callout made automatically when click
   pictures are added (`captureClicks` in `src/main.ts`). Written up in `docs/editor.md` ("Lettered callouts"); tried in the real window (scenarios `callouts`,
   and `circles`, `roundtrip` updated, in the scratch `ui_test.mjs`). Pointing with the mouse was added after (item 5). Not built: drawing callouts and the click
   circle into exported pages (when export is built, reuse `shapesFor` and `circleFor` so the editor and the book always agree); a screen reader pass.
5. **Picture views (DONE 2026-10-20; Jason chose: the zoom size is a project setting, one for the book and one for a quick guide, like the circle)**.
   a. **Format version 7 and the rules**: `Picture.view` (crop region or zoom on the click), `project.zoom {book, guide}`, `src/project/views.ts` (`shownPart` is the one
   place that decides what is shown: exports must reuse it), `setPictureView`, the dialog checks, cleaning, migration 6 to 7, 14 tests, `docs/format-spec.md`
   ("Picture views"). b. **The screens**: `pictureBox` and `entryList(picture, shown)` in `src/picture-marks.ts` draw a picture through its view with the circle and
   callouts laid over it (used by the Pictures list and the page; callouts outside the shown part are not drawn and their entry says so; markers are sized by the
   shown width); `pictureViewDialog` and `zoomSettingsDialog` in `src/dialogs.ts`; the Picture view and Zoom settings buttons and the "Show the pictures as in the"
   preview in `src/main.ts`; a global `[hidden] { display: none !important; }` in `src/style.css` (the keyboard run found the region boxes staying on screen).
   Written up in `docs/editor.md` ("Picture views"); tried in the real window (scenarios `views`, `keyboard2`, and `circles`, `callouts`, `roundtrip` updated).
   c. **Pointing at a picture (DONE 2026-10-20)**. Jason said callouts must be as many as someone needs and that there must be a way for someone to make them
   themselves (there is no limit, tested with 300; Add a callout works on every picture) and chose the mouse control: `src/pointing.ts` (the rules: pointer to picture pixel,
   draw, move, resize by corner or key, key steps, words; 9 tests), `src/pointer-layer.ts` (the handles laid over a sample: mouse drag with pointer capture, Escape to put back,
   focusable outline and marker with arrow-key moves, Control to resize, announcements), used by `calloutsDialog` (one selected callout at a time, picked by focus, Add or
   pressing another marker) and `pictureViewDialog` (the crop region) in `src/dialogs.ts`. The typed boxes stay the exact record and everything pointed at fills them in.
   Written up in `docs/editor.md` ("Pointing at a picture"); tried in the real window (scenario `pointing`, with a real mouse and keys through the browser's input channel).
   Still to do by a person: a screen reader pass over the handles (they use `role="application"` so arrows reach them; the typed boxes are the fallback).
6. **Comments (DONE 2026-10-21)**: format version 8 (`Page.comments`, saved in the topic's page file), `src/project/comments.ts` (rules), `src/project/comment-list.ts` (the
   book's unresolved list, a block in words), `commentsDialog` and `unresolvedDialog` in `src/dialogs.ts`, the Comments button on every block in `src/page-editor.ts` and
   the Unresolved comments button and properties line in `src/main.ts`; 12 tests; `docs/format-spec.md` ("Comments"), `docs/editor.md` ("Comments"); tried in the real
   window (scenarios `comments`, and `keyboard2` extended). Comments are never put in a preview or an export. No replies and no author names (Jason's defaults).
7. **The print and help site previews (DONE 2026-10-21; Step 4's last item)**: `src/render/overlay.ts` (the drawing over a picture as plain data, also written as SVG text; the editor's
   `marksOverlay` now uses it), `src/render/html.ts` (text with marks, figures with callouts and entries, procedures, callout boxes, the notes for the writer, variables filled in,
   everything escaped), `src/render/print.ts` (the book as sheets, contents, chapter openers), `src/render/help.ts` (a help page with tree, breadcrumbs, Previous and Next); 15 tests; the
   three tabs and the preview panel in `src/main.ts` (`setViewMode`, `renderPreview`) and `src/style.css`; written up in `docs/editor.md` ("The print preview and the help site
   preview"); tried in the real window (scenario `previews`). **The exports (Step 6) must reuse `src/render/`** with `notes: false` and `imageSrc` returning file names; the crop
   uses CSS `object-view-box`, which an export for other browsers will need to replace with a cropped picture file. Jason's default: the preview flags pictures too small on paper and does
   not switch them to a crop or zoom by itself (the design says the layout switches; ask him if he wants it automatic). Not built: real page breaks and page numbers (they come with the
   PDF), search, the index and the FAQ of the help site, a quick guide preview.
8. **Step 5, marks and colours (started 2026-10-21; Jason was away and said to keep going down the checklist, so these defaults were chosen and he should confirm them)**.
   a. **Format version 9 and the rules (DONE)**: `Picture.shapes` (arrow, text box, rectangle, numbered marker, in picture pixels, bottom to top), `project.styles` (named colour
   sets), `src/project/contrast.ts` (hex colours, the ten swatches, WCAG 2.2 contrast: text 4.5 to 1, graphics 3 to 1, the average colour behind a mark), `src/project/shapes.ts`
   (new marks, cleaning, arrow head, text wrapping, what a mark says, the checks), `src/project/styles.ts` (apply by copy, names, cleaning), migration 8 to 9, 18 tests,
   `docs/format-spec.md` ("Marks drawn on a picture", "Named styles"). Defaults chosen: applying a style copies colours (no link); a marker's label is typed by the author and its letter
   colour is black or white by contrast; a text box's fill is white; a kept low-contrast choice is recorded when a mark is saved while failing (`keptLowContrast`). b. Drawing the marks in
   the editor, the previews and the exports, and adding them to a picture's description. (DONE) `src/render/overlay.ts` draws marks (`shapeParts`: the arrow's line and head, the rectangle with its
   see-through fill, the text box with its words wrapped into lines, the marker with a letter that is black or white by contrast) between the click circle and the callouts; `altTextFor` adds
   "Marks: ..."; the preview notes mention marks with no alternative text and low contrast. c. The Drawing dialog (DONE): `src/drawing-dialog.ts` (add, typed boxes checked by `checkShapeInput`,
   pointing with the shared pointer layer, which gained extra points, line drawing and pickable outlines; swatch lists, contrast lines in words with symbols, announcements; named styles; save records
   `keptLowContrast`), `src/backdrop.ts` (reads the colour behind a mark through a canvas), the Drawing button and "Drawing: ..." line in `src/main.ts`; written up in `docs/editor.md` ("Drawing
   marks"); tried in the real window (scenarios `drawing`, `keyboard2` extended). Not built: the accessibility check that lists every low-contrast mark and every mark with no alternative text across the
   book (the data is there: `shapeChecks`, `missingAlt`, `keptLowContrast`), a contrast check of the built-in callout box styles in a list, drawing marks into exports (reuse `src/render/overlay.ts`;
   the text box lines are drawn as separate SVG texts, which an export to PDF or Word must keep), a quick guide preview. Defaults for Jason to confirm are in the first paragraph of this item.
9. **The book check and the accessibility check (DONE 2026-10-21, ahead of Steps 6 to 8 because it needed no decisions from Jason; Step 9's first two items)**: format version 10 (`project.checks.ignored`),
   `src/project/checks.ts` (the rules: pictures and marks with no alternative text, colours too close, callouts with no name or sentence, empty topics and blocks, missing files, variables with no
   value or not used, pictures too small for paper; ignore one, ignore all of a kind, bring back, the summary in words, cleaning), `src/check-dialog.ts`, the Check the book button and `goToIssue` in
   `src/main.ts`; the print size rule moved into `src/project/views.ts` (`printScale`, `MIN_PRINT_SCALE`) so the check and the preview share it; 12 tests; `docs/editor.md` ("The book check"),
   `docs/format-spec.md` ("The book check"); tried in the real window (scenarios `check`, `keyboard2` extended). Not checked because the book cannot have them yet: skipped heading levels, links, tables
   with no header row. The export should offer to run this check first, and should never require it.
10. **Exports, the first part of Steps 6 and 8 (DONE 2026-10-21 while Jason was away; the parts that needed no decision)**: `src/render/flatten.ts` (a picture cut to the part shown with its marks drawn in,
    as a PNG, on a canvas), `src/export/pictures.ts` (the flat pictures for a book), `src/export/json.ts` (JSON with images, and reading it back), `src/export/markdown.ts`, `src/export/help-site.ts` and
    `site-assets.ts` (the help site with search), `src/export-dialog.ts`, and the Export and Import an export buttons and `exportBook` and `importExport` in `src/main.ts`; `docs/exports.md`; 10 tests in
    `tests/export.test.ts`; tried in the real window (scenario `exports`, with pixel checks of the drawn pictures, the search script run for real and an import round trip; `keyboard2` extended). Each export is saved as
    one zip through the native Save dialog, which no test can drive: Jason should try Export and Import an export by hand. Not built: the book PDF, the short guides, the automatic crop or zoom for
    pictures that would print too small (the to-do list asks for it in Step 6; the preview only flags them), the book index and the collapsible FAQ of the help site, an installer.
11. **Word export (DONE 2026-10-21 while Jason was away)**: `src/export/docx.ts` (a `.docx` with real styles, a table of contents field, numbered steps that restart for each procedure, inline pictures with
    alternative text, callout box styles, header and page number; see `docs/exports.md`), "Word" in `src/export-dialog.ts`, and `exportBook` in `src/main.ts` (saves one `.docx`, `chooseExportPath` takes the extension).
    Two tests in `tests/export.test.ts`; scenario `word` in the real window plus a check that the real Word opens it, updates its contents and saves a PDF. Jason should try Export, Word by hand through the Save dialog.
12. **Short guides, the model, the dialog and the preview (DONE 2026-10-21 while Jason was away; Step 6's first two items except export)**: format v11 (`project.guides`, commit e952bb2), `src/project/guides.ts`
    (rules), `src/render/guide.ts` (the guide as HTML; shares `figureHtml` with the book, which gained `FigureOptions`: step number, description fallback, close-up), the step-number marker in
    `src/render/overlay.ts` (`overlayFor` takes a step number), `src/guides-dialog.ts`, the Guides button and the Guide preview tab in `src/main.ts`; tests in `tests/guides.test.ts` and `tests/guide-render.test.ts`;
    tried in the real window (scenario `guides`; `keyboard2` extended). Choices made without asking, for Jason to confirm: a guide is made of topics with numbered steps and takes only their steps and boxed notes
    (the book's paragraphs, headings and loose pictures stay out); each step is headed "Step N" (numbered again for each list); the step number marker is dark blue (not red, so it is not mistaken for a lettered
    callout); close-ups are on by default and shown for whole pictures that have a click; the left layout shows two pictures (whole and close-up) because a step holds one picture. Not built: exporting a guide as a help site,
    the third picture of the left layout, check rules for guides.
13. **A guide as Word (DONE 2026-10-21 while Jason was away)**: `src/export/guide-docx.ts` (shares the book's styles through `assembleDocx` in `src/export/docx.ts`), `flattenGuide` and `guideKey` in
    `src/export/pictures.ts` (a picture for each step, since it carries the step's number, and a close-up), "Guide (Word)" in the Export dialog (with a guide picker, switched off when there are no guides) and
    `exportBook` in `src/main.ts`; 3 tests in `tests/guide-export.test.ts`; tried in the real window (scenario `word` extended) and in the real Word (see `docs/exports.md`). Jason should try Export, Guide (Word) by
    hand through the Save dialog.
14. **PDF (DONE 2026-10-21; Jason said yes to Rust in the shell)**: `src-tauri/src/pdf.rs` (three commands; WebView2 `Page.printToPDF` in a hidden window; one at a time; refusals; 180 s limit), `src/export/pdf.ts`
    (the page, `anchorPages`, page numbers), `pdf-css.ts`, `pdf-make.ts` (prints twice to settle the contents), `pdf-job.ts` (the shell and the work folder), "PDF" and "Guide (PDF)" in the Export dialog and
    `exportBook` in `src/main.ts`, a capability scope for `$TEMP/openexplainer-pdf` in `src-tauri/capabilities/default.json`; `renderPrintPreview` takes the contents' page numbers; 6 tests in `tests/pdf.test.ts`,
    1 Rust test; tried in the real window (scenario `pdf`). `CLAUDE.md` and `NOTICE` were updated. Jason should try Export, PDF and Guide (PDF) by hand through the Save dialog, and open a PDF in a desktop PDF program or another
    reader. Not done: a screen reader or a desktop PDF program accessibility check of the PDF, matching the the reference authoring platform look more closely, a guide as a help site.
15. **Automatic zoom for print (DONE 2026-10-21; Jason: a setting that starts off)**: format v12 `project.paper.autoZoom` (off), `switchedForPaper` / `forPaper` in `src/project/views.ts`, `RenderContext.paper`,
    `flattenPlaced(..., { paper })`, Word captions and the book check follow it, a box in Zoom settings, a note for the writer in the print preview; tests in `tests/paper.test.ts`; scenario `paper`. Applies to the print
    preview, PDF and Word only.
16. **The book index (DONE 2026-10-21; Jason: the software writes the first pass, the author edits it and can update it)**: format v13 (`TreeNode.index`, commit dad1f7a), `src/project/book-index.ts` (the first pass from the
    book, editing as lines, update, the index of the book), `src/render/index-html.ts`, the terms box and Suggest terms in the Properties pane and the Index dialog (`src/index-dialog.ts`) in `src/main.ts`, and the index in the
    print preview, PDF (page numbers), Word, help site and Markdown; tests in `tests/book-index.test.ts` and `book-index-output.test.ts`; tried in the real window (scenario `index`; `word` and `pdf` extended) and in the real Word.
    Not built: the AI's first pass of index terms (Step 7 says it may draft them; the software's own first pass works without), sub-entries ("Save, as a copy") and "see also", index terms on a picture or a
    paragraph (terms are per topic), a book check rule for topics with no terms.
17. **The MCP server (DONE 2026-10-21; Jason chose the app with no window, safe defaults, MCP first)**: `openexplainer.exe --mcp` (`src-tauri/src/mcp.rs`, `mcp.html`, `src/mcp/`: `protocol.ts`, `paths.ts`, `session.ts`, `blocks.ts`,
    `tools.ts`, `capture-tools.ts`, `log.ts`, `connect.ts`, `main.ts`), `src/export/make.ts` (the export maker the Export dialog and MCP share), the **MCP access** dialog (`src/mcp-dialog.ts`, off by default, a folder, whole
    screens off by default, the lines for Claude Desktop and Claude Code), a plain log, `Test MCP.bat` (`tools/mcp-e2e.mjs`). Tested: unit tests (`tests/mcp*.test.ts`), the end-to-end test against the real app, the capture
    tools with made-up windows and real injected clicks (scratch `mcp_capture_e2e.mjs`), and the dialog in the real window (scenario `mcp`). See `docs/mcp.md`. Not done: a real assistant (Claude Desktop or Claude Code) connecting
    to it (Jason should try: MCP access, copy the lines, ask the assistant to document something), the check that an assistant's own click-through of a real program works (the tests used made-up windows). Tried in a **release** build with its pages inside it
    (`cargo build --release --features tauri/custom-protocol`; a plain `cargo build --release` still loads its pages from the dev server): `--mcp` works there too (a release program is a GUI program and still gets the pipes).
    `OPENEXPLAINER_EXE=<path> node tools/mcp-e2e.mjs` tries one (it saves and restores the real MCP settings).
18. The **local AI** (Step 7), plan and licence check in `docs/local-ai-plan.md`. Jason confirmed on 2026-10-21: Unsloth's `Qwen3.5-4B-Q4_K_M.gguf` (2,740,937,888 bytes, pinned by commit and SHA-256; Apache 2.0 all the way down),
    the runtime (llama.cpp `llama-server`, MIT) inside the installer, the model downloading the first time the built-in model is turned on, drafts and writing-style notes stored in the project (format v14, part 4).
    **Part 2 DONE 2026-10-21, tried against a stand-in download site only** (the model download: `src/ai/download.ts`, `src/ai/shell-files.ts`, `src-tauri/src/models.rs`, the download controls in `src/ai-dialog.ts`, tests `ai-download.test.ts` with `fake-hub.ts`, scenario `aidownload`; see `docs/local-ai-plan.md`). **Part 1 DONE 2026-10-21** (settings and the connector, no download): `src/ai/` (`settings.ts`, `model-info.ts`, `types.ts`, `local.ts`, `connector.ts`, `model-state.ts`), `src/ai-dialog.ts` (the **AI help** button),
    `src-tauri/src/ai.rs` + `config.rs`, `tests/ai.test.ts` + `tests/fake-llama.ts`, scenario `ai`. **The first real 2.7 GB download was done 2026-10-21 at Jason's yes** (about 50 s, checked, matches the pinned fingerprint; Resume from 5 MB short also tried against the real site; details in `docs/local-ai-plan.md`). The model is in `%LOCALAPPDATA%\org.openexplainer.app\models`. **Part 3 DONE 2026-10-21** (the runtime, tried with the real model): `Get AI Runtime.bat` + `tools/get-ai-runtime.mjs` + `tools/ai-runtime.json` (llama.cpp b11803 pinned), `src-tauri/runtime/llama` (not in git; bundled by `bundle.resources`), `src-tauri/src/llama.rs`, `src/ai/runtime.ts`, `src/ai/app.ts`, the **Test the AI** button, a `connect-src` for the page's security policy (the part 2 download would have been refused in a release build without it), NOTICE for llama.cpp; scenarios `aitest` and `aikill`; release build tried. **To run a fresh checkout's AI: double-click `Get AI Runtime.bat` once, then `Run OpenExplainer.bat`.** **Part 4 DONE 2026-10-21** (Jason confirmed its five points): draft callout sentences with the review list, format v14 (`project.json` `writingStyle` + `drafts.json`). `src/project/drafts.ts`, `src/ai/drafting.ts`, `src/drafts-dialog.ts`, `src/drafting-ui.ts`, `src/style-dialog.ts`, buttons in `src/main.ts` (AI drafts (n waiting), Writing style, Draft callout text on a picture and for a topic), the book check note, tests `drafts` and `drafting`, scenarios `drafts` and `draftreal`; see `docs/local-ai-plan.md` "What part 4 is" and `docs/format-spec.md`. CURRENT_VERSION is 14 (the `roundtrip` scenario hard-codes it). **Part 5 DONE 2026-10-22** (Jason confirmed its five points): **Draft a procedure from the clicks**, steps written by rules from the click notes (no AI; a real-model try showed it adds little and invents typing), kept in the list now named **Drafts**, Accept adds a numbered procedure to the end of the page; format v15. `src/project/procedure-draft.ts`, `src/project/click-item.ts`, `src/project/drafts.ts` (two kinds), `src/drafts-dialog.ts`, the button in `src/main.ts`; tests `procedure-draft`, scenarios `procedure` and `procedurereal`; see `docs/local-ai-plan.md` "What part 5 is". **Also fixed: an older project with page text could not be opened by a newer program** (see the same section). **Part 6 confirmed by Jason 2026-10-22 (all five defaults); built as three steps, each committed on its own.** **6a DONE 2026-10-22**: **Draft an opener for this chapter** and **Draft a chapter summary here** (buttons above the page editor), format v16 (`chapter-text` and `box` draft kinds, `project.json` `avoidWords`), `src/ai/chapter-text.ts`, `src/project/page-text.ts`, `src/project/avoid-words.ts`, `src/drafting-ui.ts` (`draftChapterTextFor`), the entries in `src/drafts-dialog.ts`; tests `chapter-text` and `drafts16`, scenarios `chapters` and `chapterreal`; real sentences in `docs/local-ai-plan.md` "What part 6a is". CURRENT_VERSION is 16. **6b DONE 2026-10-22**: **Suggest boxed notes for this topic** (button above the page editor), `src/ai/boxes.ts` (JSON answer through a new `jsonSchema` option on the question, evidence checked word for word, a Caution rule, an unbacked Caution starts as a Design Tip, the author chooses the kind), `draftBoxesFor` in `src/drafting-ui.ts`, `boxWaiting` in `src/project/drafts.ts`; test `boxes`, scenarios `chapters` (refusals) and `boxesreal`; real sentences in `docs/local-ai-plan.md` "What part 6b is". **6c DONE 2026-10-22** (Part 6 is complete): `src/project/consistency.ts` (three rules: control name differs from the captured name, step verb does not suit the control, word on the Words to avoid list), `src/project/avoid-words.ts` (`avoidCountWords`), three new book check notes in `src/project/checks.ts`, the Words to avoid box in `src/style-dialog.ts` (now takes and returns `{ style, avoid }`), `goToIssue` in `src/main.ts`; test `consistency`, scenario `consistency`; see `docs/local-ai-plan.md` "What part 6c is". **Real-mouse scenarios (roundtrip, saveopen, circles, pointing) could not be verified on 2026-10-22: they failed because the recorded click positions were off from where the test put the cursor, which points to someone using the mouse during the runs; they need a rerun when the PC is idle (see the memory note real-window-tests-need-idle-mouse).** Next: The model reading pictures (the `mmproj` file, point 5 of the part 5 plan) is still undecided; then part 7 (own keys) and part 8 (the MCP draft tool).

## Step 10, documenting OpenStage Author (2026-10-24 and 2026-10-28)

The OpenStage Author User Guide and its Quick Start were first made on 2026-10-24 through the MCP tools (see `docs/mcp.md`). On 2026-10-28, at Jason's yes to all three, Step 10 went further. Everything below is drafted, not reviewed by a person.

- **Structure.** The guide moved from 18 chapters to the 15 chapters and an appendix of the how-to book template, with `move_topic` (no content was rewritten, ids and pictures stayed). The chapter list is `HOW_TO_BOOK_CHAPTERS` in `src/project/model.ts`, and a new project made from the OpenStage how-to book template now has those 16 chapters (it had three). The chapter titles are my reading of the guide's feature areas, not Jason's: he should confirm or change them. The guide's own `project.json` still says `template: empty` (nothing reads it after a project is made).
- **Tools added for assistants** (all in `src/mcp/tools.ts`, tested in `tests/mcp.test.ts`): `move_topic`, `import_picture` (a PNG or JPEG from the MCP folder, as Import does), `add_callout` and `delete_callout` (callouts on a window, region or brought-in picture, which have no click to make one from), and a `template` choice for `create_project`. These answer three of the faults the manuals found (no callouts on window pictures, no way to bring a picture in, no way to start from the template).
- **Callouts.** 11 window pictures of the guide now have lettered callouts (the tour of the window has seven). Two overview pictures were cropped so they print larger.
- **Print.** A chapter named Appendix opens as "Appendix" and "In This Appendix" in the print layout and PDF, not "Chapter 16" (`src/render/print.ts`). The contents and the topic numbers still count it as chapter 16.
- **Short guides**: four tasks (a Quick Start for a first lesson, add narration, make a quiz, bring in slides and a recording), each in both layouts, as PDFs in `Short guides` beside the book.
- **Not done**: the click capture still sometimes names a button "text", "group" or "window" in Chromium and Tauri windows (about half the time in some programs). It needs runs with the real mouse on an idle PC to find out why; nothing was changed. A person still has to read the whole guide. The tour-of-the-window picture still prints at about half size, which the book check notes; it is a whole-window overview on purpose.

## The improve-build list (2026-11-01): items 2 to 10, then 1

From the comparison with help-authoring programs (a Docs file of Jason's, "OpenExplainer compared with help-authoring programs"). Jason asked for items 2 to 10 and then 1, with every design choice left to Claude and listed, and said to push to main when done (no tags, no releases; the v0.1.0 and v0.1.1 drafts stay unpublished). Each item has tests, docs and its own commit; the full suite is 541 tests and the only two that fail on this PC are the two that need Python (`the packed file is a valid zip...` and `compressed zips from other programs can be read`). The project format went from 16 to 21.

| Item | Commit | Format | Where |
| --- | --- | --- | --- |
| 2. Links between topics, See also, broken-link check | 0211d9e | 17 | `src/project/links.ts`, `src/links-dialog.ts`, `src/render/see-also.ts` |
| 3. Look of the outputs: fonts, accent, logo, title page, header and footer, paper | 2acc91a | 18 | `src/project/look.ts`, `src/look-dialog.ts` |
| 4. Snippets, conditions and targets | 5a38ad6 | 19 | `src/project/snippets.ts`, `src/reuse-dialog.ts` |
| 5. Import from Word | d222c8d | none | `src/import/` (`xml.ts`, `docx.ts`, `apply.ts`) |
| 6. Snapshots, and a Word review copy with comments that come back | 02ca982 | 20 | `src/project/history.ts`, `snapshots.ts`, `src/history-dialog.ts`, `src/import/review.ts`, `src/export/docx.ts` (review) |
| 7. EPUB 3 | 0f2fe6e | none | `src/export/epub.ts` |
| 8. Markdown pages and llms.txt in the help site | 9968875 | none | `src/export/help-site.ts`, `markdown.ts` (`topicPageMarkdown`) |
| 9. A bigger book check | e4a21e6 | none | `src/project/book-checks.ts` |
| 10. Translation round trip (XLIFF), and the language of the book | e61aaba | 21 | `src/translate/`, `src/project/language.ts`, `replace-picture.ts` |
| 1. Screen reader pass: machine checks and a script for a person | (see git log) | none | `tools/a11y/`, `docs/screen-reader-*.md` |

Choices made without asking (all written in the docs named): links show their words plus the topic's number, and in a PDF its page (Word: words and number; help site: plain link). A snapshot holds the same files a saved project is made of, so an old one is upgraded when read; the author's own snapshots are never dropped for room (20 at most). The review copy bookmarks every block and topic heading so a reviewer's Word comments find their place; the copy sends only comments and brings back only comments. A translated book is a **copy** (a new project file), never an edit of the open book, because translating in place would lose the original; the language field (format 21) was added because a French book that says it is English is read badly by a screen reader. Word import marks everything Drafted and removes typed heading numbers. XLIFF is version 1.2 only.

**Tried in the real program** (a built `openexplainer.exe` driven through the page's debugging port, on a copy of the OpenStage Author guide): Export's new kinds and language box, Look's language box, History (take, compare, restore with a safety snapshot, delete), the Replace the picture file button (34 checks); every window the toolbar opens and eight a topic's page opens (216 accessibility checks); the guide exported as help site, e-book, PDF, Word, review copy and XLIFF through the assistant tools and read back (Word round trip: 16 chapters, 92 nodes, 45 pictures; a pretend French translation of all 1164 pieces in 28 ms; the e-book's 298 links all resolve).

**Not tried** (say so; do not claim it): the operating system's file choosers behind Import from Word, Bring in review comments, Import a translation and Replace the picture file (the page cannot drive them; their work is tested without a screen and their buttons are checked); a real reviewer's comments made in real Word (the tests inject them); a real translation program (OmegaT) reading and writing the XLIFF; the e-book in EPUBCheck or a reading app; the Word file opened in Word; the PDF in a desktop PDF program's checker or PAC; **a person with NVDA** (item 1: the script is `docs/screen-reader-pass.md`, a ready-to-use copy is in Jason's Documents folder "Screen reader pass", and the machine results are `docs/screen-reader-machine-checks.md`; the results of a person's pass go in `docs/screen-reader-results.md`, which says "not yet done").

**Faults the machine checks found and fixed:** every picture in the PDF had a second, outer figure tag with no alternative text (now a group); the help site's skip link did not always move the keyboard into the topic (now the topic area can take focus).

**The OpenStage Author guide was linked on 2026-11-01** (Jason's yes): its 33 typed references ("Chapter 14", "topic 6.1") became real links to those topics, after a snapshot called "Before real links, 2026-11-01" was taken inside the project and a copy of the old project and its five exports was kept in `Before real links (2026-11-01)` beside them. Fourteen of the links replaced bold "Chapter N" words in topic 1.3. The guide's PDF, Word file, help site, JSON and Markdown were made again (the PDF now has 328 link tags, was 295). Linked words that already say the number ("Chapter 4") are not followed by it again (`wordsSayNumber`, `tests/link-numbers.test.ts`). The Quick Start and the short guides were not changed (a guide never has links) and the documentation zip in Documents was made again the same day with the linked guide, the short guides and these documents (the old zip is kept beside it as "OpenExplainer documentation (previous, 2026-10-27).zip").

**The OpenExplainer User Guide was updated on 2026-11-01** (Jason's yes), through the assistant tools, in \`Documents\\OpenExplainer Manual\`: eight new topics at the ends of chapters 2, 3, 6 and 7 (2.5 Snapshots, 3.8 Links and See also, 3.9 Snippets, conditions and targets, 3.10 Bringing in a Word manual, 6.3 Sending the book out for review, 7.8 The look of your book, 7.9 An e-book, 7.10 Translating your book), changes to 13 old topics (1.1, 1.3, 2.4, 3.2, 3.7, 6.1, 7.3, 7.4, 7.5, 9.3, 10.1, 10.2, 10.3) and 11 glossary terms, six pictures of the new windows taken from a copy of the program with lettered callouts (the Look and Reuse windows are taller than the screen's window, so they show the part the text talks about), and 71 typed references turned into links. VERSION is now 0.1.1, new topics carry a New in this version box ("Added after version 0.1.1"), every new topic is Drafted, and the guide holds a snapshot "Before the update of 2026-11-01". The old files are in \`Before the 2026-11-01 update\`; the guide's MCP log has the update appended. Not done: the older pictures still show the older toolbar, the Quick Start is unchanged, and the documentation zip (made that morning) still holds the older guide and its read-me says so.

**The OpenExplainer User Guide was revised again on 2026-11-01 after another reviewer's audit** (three files in Jason's Downloads: `audit.md`, `blueprint.md`, `topic_table.md`; Jason said "go ahead and make the changes", Quick Start included), through the assistant tools. Every topic was rewritten from a script (result lines 103 to 65, every procedure has a bold lead-in, 21 topics renamed to task headings, Cautions 22 to 11 and boxes beside the procedure they bear on, sentences split, 8 pictures merged into others and 35 cropped, the eight "New in this version" boxes removed, writing style and 21 words to avoid set, the index rebuilt to 209 entries). Decisions to remember: VERSION is **0.2.0** (Jason's decision in the blueprint; the program and installer are still 0.1.1, so topics 1.5 and 2.1 are marked Needs recheck); there is no front-matter page type, so the version and licence page and the conventions page are topics 1.4 and 1.5; merged pictures stay on the step whose click they show, because a guide takes only step pictures; GUIDE_DATE is a new variable. The Quick Start gained topic 2.4 (saving): 8 tasks, 11 pages (was 18). The PDF went from 97 to 90 pages. Four pictures were not taken (4.2 overlay, 4.3 Stop window, 4.4 Review your clicks, 6.3 Bring in review comments) because they need the real capture helper; those topics are marked Needs recheck. Old files: `Documents\\OpenExplainer Manual\\Before the editor's review (2026-11-01)`, plus a snapshot inside the project. The full list, with where the blueprint was not followed, is in `Review changes and what is left (2026-11-01).md` beside the guide. The documentation zip in Documents was made again that afternoon (Jason's yes) with the revised guide, its e-book, the review notes and this file; its read-me is rewritten, the backup folders are left out, and the morning zip is kept beside it as `OpenExplainer documentation (previous, 2026-11-01 morning).zip` (the 2026-10-27 one is still there as well). Not done: the four pictures, a person's read-through, the installer and version question, and pushing the commits.

**The four missing pictures of the OpenExplainer User Guide were taken later on 2026-11-01** (Jason: "Go now, hands off"): 4.2 (Select on the screen, partway through a drag), 4.3 (the Stop window), 4.4 (Review your clicks) and 6.3 (Bring in review comments), each on its step with lettered callouts and the step words naming the letters; the four topics are Drafted again, the book check says nothing to fix, the PDF is 93 pages and every export was made again. How, and what to know: they are pictures of my own copy of the program driven through its debugging port; a plain full-screen "desk" window with the made-up Acme Draw program on it covered the main screen, so the overlay snapshot and the click pictures show nothing private; real clicks were used only for 4.4 and only when nobody had used the mouse for several seconds (each click is checked: the pointer must still be on target and the window under it must be Acme Draw). Windows keeps the Stop window out of every screen copy (`content_protected` in `src-tauri/src/capture/clicks.rs`), so its picture is the window's own page drawn by the program at twice the size, without the title bar, brought in with `import_picture`. 6.3's file chooser was filled in through Windows' own Open box (messages sent to its file name box and its Open button): Tauri locks `window.__TAURI_INTERNALS__.invoke`, so a page cannot be told a file name instead. 4.3 now uses the button's real name, Stop and keep the clicks (it said Stop). A snapshot "Before the four pictures of 2026-11-01" is inside the guide, and a copy of the file from before and the picture files are in `Documents\\OpenExplainer Manual\\Four pictures (2026-11-01)`. The scripts were not saved. Not done: the documentation zip was made before these pictures, so it needs making again.

**The installed program is still 0.1.1 (before all of this).** None of the above is in a release. A new version number, tag and installer are Jason's call.

## Still open (ask Jason, do not guess)

- **Shipping (first installer built and tried 2026-10-23, see `docs/release.md`):** a per-user NSIS installer builds (`Build Installer.bat`) and the installed program passes a smoke test (`Test Installed App.bat`) and the MCP check; an install, an upgrade over it and an uninstall were tried silently. The installer had been missing the capture helper (fixed). Still open for Jason: code signing (SmartScreen warns on an unsigned installer),
  Windows on ARM (a download and an ARM build of the helper and the AI program), the publisher name shown in Add or Remove Programs, a clean-PC or second-account install (this PC is Windows 11 Home, no Sandbox), the interactive wizard, a screen reader on the installed program, whether a project file should open by double-click (no file association yet), and the identifier `org.openexplainer.app` (ends in `.app`; changing it moves the data and the 2.7 GB model).
  Known and not fixable from OpenExplainer: the real AI server keeps running about 25 seconds after the app is closed or killed.
- PDF export: answered 2026-10-21 (Rust in the shell, see item 14). Open: how closely the printed look should follow the reference how-to book (fonts, running headers, chapter openers).

- Short guides (built 2026-10-21): please confirm the choices I made without asking (HANDOFF item 12): a guide takes only the numbered steps and boxed notes of its topics; each step is headed "Step N"; close-ups
  are on by default; the left layout shows the picture and a close-up because a step holds one picture (the design says up to three: should a step be able to hold more, such as a result picture?); the step
  number marker is dark blue and 2.5 percent of the width in radius. Also the Step 5 defaults: a named style is applied by copy, a marker's label is typed, and a mark saved with low contrast keeps a record.
- Qwen 3.5 (Jason, 2026-10-21: Apache 2.0 is fine; default Qwen 3.5 at 4B): the licence of the exact files is read and written up in `docs/local-ai-plan.md` section 5 (all permissive). The four points in plan section 7 were confirmed by Jason on 2026-10-21 (item 18).
- MCP server: built (item 17). Open: try it with a real assistant; whether an assistant should also be able to click and type in the program itself (now it does that with its own tools); the log's place and a way to see it in the app.
- The book index: built (item 16). Open: whether it needs sub-entries and "see also", and a rule in the book check for topics with no terms.
- Which the reference authoring platform page styles to copy exactly versus only resemble; how much detail per feature in the OpenStage book.
- The name "OpenExplainer" has not been checked for conflicts on GitHub and elsewhere.
- Capture helper: should the window list also show a program's dialogs (marked as belonging to it) so a native dialog can be captured by itself?
  Region capture can also take one.
- Capture helper: Windows 11's rounded corners leave a few black or background pixels in the picture's corners. Save with transparent corners, or leave?
- Jason, please check by hand (the tests cannot): Save as, New project, Open the saved file, and see that the click pictures, the circle settings and each picture's circle choice are back; and a screen reader on the Capture dialog, the review list and the circle settings.
- Capture: should the wait be remembered between runs of the app (now it is only remembered while the app stays open)? Should there be a way to cancel
  a wait from the keyboard without Alt+Tab, for example a global hot key (it would need a new permission and a plain-words explanation)?
- Capture: whether "Bring the window to the front first" should be on by default (it is off, because the keyboard is then with the other window and
  Escape does not reach the Cancel window, and it changes which window is on top).
- Steps 1 and 2 leftovers: more double-click scripts (build, tests), keyboard and screen reader pass, ARM check.

## Housekeeping on Jason's PC

Nothing to note. a step-by-step screen capturing program was never installed on this PC (Jason confirmed 2026-10-21), and a stray untitled a step-guide program guide does not matter.
