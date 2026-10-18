# The capture helper

The capture helper is a small Rust program, `openexplainer-capture.exe`, in the `capture-helper/` folder.
OpenExplainer starts it as a separate process, sends it one request, and reads one answer. It is separate on
purpose: if a program being captured stops responding, only the helper is stuck, and OpenExplainer can stop the
helper and carry on. It is not part of the Tauri crate (`src-tauri/`), so a problem in the helper can never break
the app's own build. It only works on Windows.

Status: window list and window capture are built and tried on Windows 11 x64 (Step 3b, parts 1 to 3).
Region capture, the timeout and Cancel button in the app, hiding the app during capture, the Capture button and
click-by-click capture are the next parts. See `docs/HANDOFF.md`.

## How to try it (double-click these)

- `Test Helper.bat`: builds the helper, runs its own tests, and asks it "are you there?".
- `Test Window List.bat`: shows the open windows the helper can see. Nothing is captured.
- `Test Window Capture.bat`: shows the list, you type a number, and the picture is saved in `Test captures\` and
  opened so you can check it by eye.

All three build the helper first and keep their window open at the end so any error can be read. They run
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

### Error codes

| Code | When |
| --- | --- |
| `bad-request` | The line was not JSON, the command is unknown, a field is missing, or `out` is not a full `.png` path. |
| `window-gone` | The window has closed. Make a new list. |
| `own-window` | The window belongs to OpenExplainer or to the program running the helper. |
| `hidden` | The window is hidden or has no size. |
| `minimized` | The window is minimized. Restore it first. |
| `other-desktop` | The window is on another virtual desktop, or its program is suspended. |
| `covered` | Only the screen copy was possible and another window is in front. |
| `off-screen` | Only the screen copy was possible and part of the window is off the screen. |
| `blank` | Both methods gave a pure-black picture. Some programs block capture on purpose. |
| `too-large` | The window is larger than 120 million pixels. |
| `capture-failed` | Windows would not give the pixels. |
| `write-failed` | The PNG could not be saved. The message says where and why. |
| `helper-crashed` | A bug inside the helper while handling one request. The helper keeps running. |
| `not-supported` | A non-Windows build. |

## What the app must do (Step 3b, part 5, not built yet)

The helper does not enforce the 20-second timeout, the Cancel button or hiding the app. The app does: start the
helper, send the request, and if no reply comes in time (20 seconds by default), stop the helper and say so in plain
words, leaving the project unchanged. The helper's own limits (5 seconds for Windows to draw a window) are shorter,
so a stuck program normally still gets a picture. The app window must hide itself, or pass its own process number
in `exclude_pids`, so it never captures itself.

## What has and has not been tried

Tried on Windows 11 x64, display scaling 100 percent, two monitors (the second above the first, so with
negative positions): a plain window, a window with another in front of it, a window on the second monitor, a
minimized window, a closed window, the app's own process refused, a program that stopped responding (picture
taken, quickly, with a "Not Responding" title), a Chromium-based window (Edge), nonsense requests. The test
windows were made-up ones, and the pictures were checked by looking at them and by exact pixel colours.

Not tried: display scaling above 100 percent, Windows on ARM (the helper has not been built for it), a window
that blocks screen capture on purpose, windows run as administrator, and the other programs on the author's PC
beyond those listed.

Things to know:

- A program's own **modal dialog is a separate window** and is not part of the picture of the program's main
  window. Edge showed this: its sign-in dialog was dimming the page, and the dialog was not in the picture.
- Windows 11 windows have rounded corners, and neither method makes those few corner pixels transparent. A
  `print-window` picture has black pixels in its bottom corners (the top corners took the title bar colour in the
  one window tried). A `screen-copy` picture shows whatever was behind the window at the corners. Making the
  corners transparent would mean saving the PNG with transparency. Not done; it needs your decision.
