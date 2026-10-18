# The capture helper

The capture helper is a small Rust program, `openexplainer-capture.exe`, in the `capture-helper/` folder.
OpenExplainer starts it as a separate process, sends it one request, and reads one answer. It is separate on
purpose: if a program being captured stops responding, only the helper is stuck, and OpenExplainer can stop the
helper and carry on. It is not part of the Tauri crate (`src-tauri/`), so a problem in the helper can never break
the app's own build. It only works on Windows.

Status: window list, window capture, screen list and region capture are built and tried on Windows 11 x64
(Step 3b, parts 1 to 4). The app side of it (part 5: the 20-second timeout, the Cancel window, hiding OpenExplainer
while it captures, and plain-words failures) is built too, and part 6 gave the app one **Capture** dialog for a window or
a rectangle of a chosen screen, with a "bring the window to the front first" choice. The drag-to-select overlay, a delay
before capturing, and click-by-click capture are not built. See `docs/HANDOFF.md`.

## How to try it (double-click these)

- `Test Helper.bat`: builds the helper, runs its own tests, and asks it "are you there?".
- `Test Window List.bat`: shows the open windows the helper can see. Nothing is captured.
- `Test Window Capture.bat`: shows the list, you type a number, and the picture is saved in `Test captures\` and
  opened so you can check it by eye.
- `Test Region Capture.bat`: shows your screens, you pick one and type four numbers (left, top, width, height,
  counted from that screen's top left corner), or `all` for the whole screen. Saved and opened the same way.

All four build the helper first and keep their window open at the end so any error can be read. They run
`tools/capture-helper-test.mjs`, which talks to the helper exactly as the app will.

## The messages

The app writes one JSON request per line to the helper's standard input. The helper writes one JSON reply per line
to its standard output, and writes nothing else there. Anything meant for a human debugging goes to standard error.
The helper stops when the app closes the pipe.

Every request has a `command` and may have an `id` (any JSON value), which comes back unchanged in the reply so
the app can tell which request a reply belongs to.

A reply is either

```json
{"id": 1, "ok": true, "result": { ... }}
```

or

```json
{"id": 1, "ok": false, "error": {"code": "minimized", "message": "plain words for the author", "detail": "optional, for a bug report"}}
```

`message` is always in plain words and is safe to show the author. `code` is for the app to act on. `detail` is
technical and is only shown if the author asks for it.

### `ping`

Asks the helper to say who it is. Result: `helper`, `version`, `protocol` (1), `os`, `arch`, `commands`.

### `list-windows`

Request: `{"command": "list-windows", "exclude_pids": [1234]}`. `exclude_pids` is optional: programs whose windows
must be left out. Result: `{"windows": [ ... ]}`, the window in front first. Each window has:

| Field | Meaning |
| --- | --- |
| `id` | Windows' own number for the window. Pass it to `capture-window`. Only good while the window stays open. |
| `title`, `process`, `pid` | The title bar text, the program (such as `notepad.exe`) and its process number. |
| `x`, `y`, `width`, `height` | The part of the window a person sees, in real screen pixels. `y` is negative for a monitor above the main one. For a minimized window this is where it will sit when restored. |
| `minimized` | The window is on the taskbar. It cannot be captured until it is restored. |
| `not_responding` | Windows says the program has stopped answering. |
| `scale_percent` | The display scaling for that window: 100, 125, 150 and so on. |

What is listed follows the Alt+Tab rule: visible, not on another virtual desktop, has a title, not a tool window,
and not owned by another window. So **dialog windows that belong to a program are not listed**. The desktop
itself is left out.

**It never lists or captures itself.** The helper leaves out its own windows, the windows of the program that
started it (OpenExplainer), the helper's console window if it has one, and any `exclude_pids` the app names.
`capture-window` refuses them with `own-window`.

### `capture-window`

Request: `{"command": "capture-window", "window": 394822, "out": "C:\\...\\picture.png", "exclude_pids": [], "activate": false}`.
`out` must be a full path ending in `.png`. The folder is made if it is missing. The file is written beside its
final name first and renamed when complete, so a failure never leaves half a picture.

`activate` is optional and off unless asked. When true, the helper first makes the window the active one and waits a
moment (about 180 ms), so Windows draws its title bar as active and not grey. It is not done for a program that is not
responding. Windows only allows this in some situations; it worked from a test tool and from inside the app (the helper
is started by OpenExplainer, which is in front while it captures). If it did not work the picture is still taken and the
`note` says the title bar may look inactive. Tried: with the option off, the darkest pixel of the title text was 145
(grey); with it on, 0 (black).

Result: `path`, `width`, `height`, `method`, `note`, `scale_percent`, `elapsed_ms`, `window` (the same fields as
a list entry) and, only when `activate` was asked for, `activated` (whether it worked). The picture is the part of the
window a person sees: the invisible resize borders that Windows 10 and 11 put round most windows are trimmed off.

`method` says how the picture was made, and `note` says why in plain words:

1. `print-window`: Windows is asked to draw the window itself (`PrintWindow` with `PW_RENDERFULLCONTENT`). This works
   even when other windows are in front of it, and it is tried first.
2. `screen-copy`: used only when method 1 gave nothing: the program is not responding, it did not draw within 5
   seconds, or it gave back a pure-black picture. The window's rectangle is copied from the screen. This is only
   right if the window is really in front, so the helper checks 25 points over the window first, tries to bring the
   window forward if it is not, and refuses with `covered` if it still is not in front. A frozen program shows
   as Windows' stand-in "ghost" window, which counts as the window.

### `list-screens`

Request: `{"command": "list-screens"}`. Result: `{"screens": [ ... ]}`, the main screen first and the rest left to
right, then top to bottom. Each screen has `number` (from 1), `x`, `y` (where its top left corner is on the whole
desktop, negative for a screen left of or above the main one), `width`, `height`, `primary` and `scale_percent`.
The screens need not touch: on the author's PC the second screen sits above the first and 7 pixels to the right,
so the strip left of it is not part of any screen.

### `capture-region`

Request: `{"command": "capture-region", "x": 827, "y": 400, "width": 40, "height": 40, "out": "C:\\...\\picture.png",
"exclude_pids": [1234]}`. `x` and `y` are the top left corner in real screen pixels on the whole desktop (so they can
be negative), `width` and `height` are at least 1. `out` is as for `capture-window`.

The picture is always a copy of what is on the screen in that rectangle (`method` is `screen-copy`): every window in
front of it is included, and the mouse pointer is not. Before copying, the helper checks, each with its own plain
message and nothing saved if one fails:

1. The numbers make a real rectangle (`bad-request` if not) that is not absurdly large (`too-large`).
2. **Every pixel of the rectangle is on a screen** (`off-screen`). A rectangle that reaches past an edge, or into the
   gap between two screens, is refused instead of coming out with black patches.
3. **No window of OpenExplainer is showing in the area** (`own-window`). It looks at every top-level window of the
   helper's own program, the program that started it and every `exclude_pids`, including tool windows and pop-ups
   such as a Cancel overlay, and refuses only if one of them is really what shows at some point inside the
   rectangle. A window that is hidden behind another window, or that only touches the rectangle, does not count.
   This is the "never captures itself" rule for regions. The app should still hide itself first. **One exception:** a
   window that Windows keeps out of screen copies (display affinity "exclude from capture", which OpenExplainer's
   Cancel window sets) is never in the picture, so it is allowed to be there, and the helper looks through it. In the same
   way `capture-window`'s screen copy does not count such a window as "in front".

Result: `path`, `width`, `height`, `method`, `note`, `scale_percent` (of the screen at the middle of the rectangle),
`elapsed_ms` and `region` (the four numbers again).

### Error codes

| Code | When |
| --- | --- |
| `bad-request` | The line was not JSON, the command is unknown, a field is missing, `out` is not a full `.png` path, or a region has no size. |
| `window-gone` | The window has closed. Make a new list. |
| `own-window` | The window belongs to OpenExplainer or to the program running the helper, or (for a region) one of its windows is showing in the area. |
| `hidden` | The window is hidden or has no size. |
| `minimized` | The window is minimized. Restore it first. |
| `other-desktop` | The window is on another virtual desktop, or its program is suspended. |
| `covered` | Only the screen copy was possible and another window is in front. |
| `off-screen` | Part of the rectangle (or, when only the screen copy was possible, of the window) is not on any screen. |
| `blank` | Both methods gave a pure-black picture. Some programs block capture on purpose. |
| `too-large` | The window or region is larger than 120 million pixels. |
| `capture-failed` | Windows would not give the pixels. |
| `write-failed` | The PNG could not be saved. The message says where and why. |
| `helper-crashed` | A bug inside the helper while handling one request. The helper keeps running. |
| `not-supported` | A non-Windows build. |

## What the app does (Step 3b, part 5)

The helper does not enforce the 20-second timeout, the Cancel button or hiding the app. The app does.

**The shell (`src-tauri/src/capture.rs`)** has three commands. It uses no extra Tauri plugin and no extra permission.
- `capture(request, timeoutMs, hideApp)` starts the helper (with no console window), sends it one request line and waits
  for one answer line on a background thread, so the app's window is never held up. It stops the helper if no answer
  comes within `timeoutMs`, or when Cancel is pressed, and always cleans the helper up before returning. It adds the
  request's `id`, and for `capture-` requests it chooses `out`, a new file in `%TEMP%\openexplainer-capture\`. It returns
  `{kind: "reply", reply}`, `{kind: "timeout", seconds}`, `{kind: "cancelled"}`, `{kind: "stopped"}` (the helper ended
  without answering), `{kind: "busy"}` (one capture at a time) or `{kind: "unavailable", reason}` (`missing`,
  `cannot-start`, `no-cancel-window`, `bad-request`). It does not pass `exclude_pids`: the helper already leaves out its
  parent, which is the app.
- `cancel_capture()` stops the capture that is running. A Cancel pressed before the helper has even started is not lost.
- `take_capture_picture(path)` returns the picture's bytes and deletes the file. It only takes a `.png` that sits in the
  capture folder in the temporary folder.

With `hideApp`, the shell first opens a small always-on-top **Cancel window** (`capture-bar.html`, top right of the main
screen, with its own close button counting as Cancel), and only then hides the main window. Both are undone however the
capture ends, even on an error. The Cancel window is set to be kept out of screen copies, so it is never in a picture, and
the helper knows to look through it. It has focus on its Cancel button; **Cancel, the Enter or Space key on it, Escape,
and its close button** all cancel. It shows a count-down for people who can see it, and tells a screen reader once, not
every second, that it stops by itself after 20 seconds.

**The wording and the rules are in TypeScript (`src/capture/`).** `outcome.ts` turns every way a capture can fail into
plain words ending "Your project was not changed."; `client.ts` asks the helper through a `Shell` (so it can be tested
with a pretend one) and never throws: every failure comes back as a message. The app only adds a picture to the project
after a capture has fully worked, so a failed, cancelled or timed-out capture changes nothing. `tauri.ts` is the real
`Shell`.

**The Capture dialog (part 6).** *Capture into the selected item* (Pictures section) opens one dialog. It asks "What do
you want to capture?" with two radio buttons.
- **A window**: the open windows in a list box (arrow keys, type a letter, screen reader friendly), a *Refresh the list*
  button, and a tick box *Bring the window to the front first* (off unless ticked), with a plain explanation that it changes
  which window is on top and that, while it is in front, the keyboard is with that window, so a slow capture is cancelled
  with the button in the Cancel window and not with Escape.
- **A rectangle of the screen**: a *Screen* list (from `list-screens`, the main screen first) and four boxes: distance from
  the left edge, distance from the top edge, width and height, in pixels, counted from the top left corner of the chosen
  screen. *Use the whole screen* fills them in (and tells a screen reader it did). The numbers are checked in
  `src/capture/region.ts` before anything is captured, and a mistake is explained next to the boxes (for example "The
  rectangle reaches past the right edge of Screen 1, which is 1920 pixels wide. Make the width 1820 or less, or the distance
  from the left edge smaller."): the message is in a live region, the dialog stays open so nothing typed is lost, the wrong
  box is marked `aria-invalid` and given the focus, and typing in a box clears the message. The desktop position the helper
  wants is worked out by adding the screen's own position, which is negative for a screen above or left of the main one.

Either way the picture is captured through the shell (so the 20-second limit, the Cancel window and the "project unchanged"
rule apply), the description is asked for exactly as Import does (never filled in silently), and the picture is added with
`source.kind` `window` or `region`. `originalName` holds the window's title, or for a rectangle words such as "Screen 1, 800
by 600 pixels, 100 from the left and 50 from the top". No format change. A screen copy of a frozen program, or a window that
could not be brought to the front when asked, is announced with the helper's `note`.

**Where the helper is found:** the file named by the `OPENEXPLAINER_CAPTURE_HELPER` environment variable (for tests),
else `openexplainer-capture.exe` beside the app, else (while developing) `capture-helper/target/release/` found by walking
up from the app. `Run OpenExplainer.bat` builds the helper before it starts the app. Putting the helper inside an installer
(a Tauri sidecar) is installer work and is not done.

**For tests only:** in a development build, `window.__openexplainerCaptureTimeoutMs = 2000` shortens the 20 seconds.

The helper's own limit (5 seconds for Windows to draw a window) is shorter than the app's, so a stuck program normally
still gets a picture. A region capture still needs the app out of the way: the shell hides the app, and if anything of
the app's is showing in the rectangle the helper refuses with `own-window` instead of saving a picture of the app.

## What has and has not been tried

Tried on Windows 11 x64, display scaling 100 percent, two monitors (the second above the first, so with
negative positions): a plain window, a window with another in front of it, a window on the second monitor, a
minimized window, a closed window, the app's own process refused, a program that stopped responding (picture
taken, quickly, with a "Not Responding" title), a Chromium-based window (Edge), nonsense requests. The test
windows were made-up ones, and the pictures were checked by looking at them and by exact pixel colours.

Region capture, tried the same way (a made-up window with solid red, green and blue blocks, checked to the exact
colour): a rectangle inside each block, a rectangle the size of a whole window, a rectangle across the seam where the
two screens meet (works), a rectangle in the strip beside the higher screen, past the right edge and far away (all
refused, `off-screen`), zero and negative sizes and an absurdly large one (refused), a whole screen (about 60 to 140
ms; the pictures of whole screens were checked for size only and deleted unseen), a pretend OpenExplainer window in
the way (refused, and not refused when another window covers it, with the picture showing the covering window), a
rectangle elsewhere and one that only touches the window's edge (no false refusal). The test tool's typed input was
tried with a rectangle, with Enter to quit, with text that is not numbers, and with no input at all (captures
nothing).

The app side (part 5) was tried in the real OpenExplainer window (a development build, driven through its debugging
port, clicking its real button and dialogs), with made-up windows: a normal capture (list leaves out OpenExplainer
itself; one picture added, 602 by 332 pixels; main window back; no helper left running); a program that stopped
responding (5.5 seconds, picture added, main window hidden and Cancel window shown while it waited, count-down running,
the app still answering in about 1 ms, button focused); Cancel by the button, by the Escape key, by the window's own
close button, and by Enter and by Space on the focused button (each: plain message, project unchanged, helper stopped,
main window back, Cancel window gone); the time limit shortened to 2 seconds (gave up after 2.3 seconds,
plain message, project unchanged); a window that closed after being chosen (plain message); a pretend helper that never
answers (stopped at the limit, no process left); the helper file missing (plain message naming `Test Helper.bat`). The
Cancel window was looked at as a picture and its size was corrected. The shell's own logic has 10 tests (a helper that
never answers is stopped at the limit, Cancel stops the wait at once, even before the helper starts, and the rest), and
the TypeScript wording and the "failure changes nothing" rules have 13.

A window kept out of screen copies was tried both ways: with the helper naming it as OpenExplainer's own (not refused,
and the picture shows what is behind it), and sitting on top of a frozen program being copied (still captured).

Part 6 (the Capture dialog) was tried the same way in the real window, with made-up windows with solid red and blue blocks:
a rectangle over the red block on Screen 1 and over the blue block on Screen 2 (above the main one, so with negative desktop
positions): each picture was 40 by 40 and three sampled pixels were exactly the block's colour, and each was named by
screen and place; *Use the whole screen* (the four boxes were filled in and announced; the picture was 1920 by 1080, looked
at for size only and removed from the project again); four kinds of mistake typed into the boxes (too wide, not a number,
empty, zero), each explained next to the boxes with the dialog still open, the right box focused and marked, the message
cleared by typing, Escape closing the dialog, the project unchanged and focus back on the Capture button; every control in
both modes has a name (`label`, legend or button text); and *Bring the window to the front first*, with a window sitting
behind another: the darkest pixel of its title text was 145 (grey, inactive) with the option off and 0 (black, active) with
it on. The part 5 checks (normal, frozen, five ways to cancel, time limit, closed window, a helper that never answers,
missing helper) were run again against the new dialog and passed.

Not tried: a screen reader on the Capture dialog, the description prompt and the Cancel window; a release build of the
app (the production build of the web part was checked and contains `capture-bar.html`, but the release `.exe` was not
run); keyboard-only use start to finish was not walked through by a person; the helper inside an installer; "bring to the
front" with a program that refuses to be activated.

Not tried: display scaling above 100 percent, Windows on ARM (the helper has not been built for it), a window
that blocks screen capture on purpose, windows run as administrator, and the other programs on the author's PC
beyond those listed.

Things to know:

- A program's own **modal dialog is a separate window** and is not part of the picture of the program's main
  window. Edge showed this: its sign-in dialog was dimming the page, and the dialog was not in the picture.
- A region is a copy of the screen, so it includes anything in front of it that is not OpenExplainer: a notification
  that pops up, a tooltip, another program's window. The mouse pointer is never included (the click highlight is
  meant to be drawn later from the stored click position).
- Windows 11 windows have rounded corners, and neither method makes those few corner pixels transparent. A
  `print-window` picture has black pixels in its bottom corners (the top corners took the title bar colour in the
  one window tried). A `screen-copy` picture shows whatever was behind the window at the corners. Making the
  corners transparent would mean saving the PNG with transparency. Not done; it needs your decision.
