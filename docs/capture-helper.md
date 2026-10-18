# The capture helper

The capture helper is a small Rust program, `openexplainer-capture.exe`, in the `capture-helper/` folder.
OpenExplainer starts it as a separate process, sends it one request, and reads one answer. It is separate on
purpose: if a program being captured stops responding, only the helper is stuck, and OpenExplainer can stop the
helper and carry on. It is not part of the Tauri crate (`src-tauri/`), so a problem in the helper can never break
the app's own build. It only works on Windows.

Status: window list, window capture, screen list and region capture are built and tried on Windows 11 x64
(Step 3b, parts 1 to 4). The drag-to-select overlay, the timeout and Cancel button in the app, hiding the app during
capture, the Capture button and click-by-click capture are the next parts. See `docs/HANDOFF.md`.

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

Request: `{"command": "capture-window", "window": 394822, "out": "C:\\...\\picture.png", "exclude_pids": []}`.
`out` must be a full path ending in `.png`. The folder is made if it is missing. The file is written beside its
final name first and renamed when complete, so a failure never leaves half a picture.

Result: `path`, `width`, `height`, `method`, `note`, `scale_percent`, `elapsed_ms` and `window` (the same fields as
a list entry). The picture is the part of the window a person sees: the invisible resize borders that Windows 10 and
11 put round most windows are trimmed off.

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
   This is the "never captures itself" rule for regions. The app should still hide itself first.

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

## What the app must do (Step 3b, part 5, not built yet)

The helper does not enforce the 20-second timeout, the Cancel button or hiding the app. The app does: start the
helper, send the request, and if no reply comes in time (20 seconds by default), stop the helper and say so in plain
words, leaving the project unchanged. The helper's own limits (5 seconds for Windows to draw a window) are shorter,
so a stuck program normally still gets a picture. The app window must hide itself before a region capture (and
should pass its own process number in `exclude_pids`), so it never captures itself. If it forgets, the helper refuses
a region with `own-window` instead of saving a picture of the app, so a forgotten hide shows up as a plain error and
not as a wrong picture. The app should also take care that a Cancel overlay it draws during capture does not sit
inside the rectangle, or hide it too.

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
