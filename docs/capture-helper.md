# The capture helper

The capture helper is a small Rust program, `openexplainer-capture.exe`, in the `capture-helper/` folder.
OpenExplainer starts it as a separate process, sends it one request, and reads one answer. It is separate on
purpose: if a program being captured stops responding, only the helper is stuck, and OpenExplainer can stop the
helper and carry on. It is not part of the Tauri crate (`src-tauri/`), so a problem in the helper can never break
the app's own build. It only works on Windows.

Status: window list, window capture, screen list and region capture are built and tried on Windows 11 x64
(Step 3b, parts 1 to 4). The app side of it (part 5: the 20-second timeout, the Cancel window, hiding OpenExplainer
while it captures, and plain-words failures) is built too, and part 6 gave the app one **Capture** dialog for a window or
a rectangle of a chosen screen, with a "bring the window to the front first" choice. **Select on the screen** (part 6,
continued) takes a snapshot of a screen, shows it full screen, lets the author drag out a rectangle (or use the keys or four
number boxes), and cuts the picture from that snapshot. **Wait before capturing** (part 6, continued) gives the author a few
seconds to get another program ready, for example to open a menu. **Click by click** (part 7) is built on the helper's side
(`watch-clicks`: a picture of the whole screen and a note for every click). In the app, **Click by click** is a third choice in the Capture dialog: a Stop window, then a review list where the author keeps
the clicks they want and describes each picture, and the kept ones go into the selected topic. See `docs/HANDOFF.md`.

## How to try it (double-click these)

- `Test Helper.bat`: builds the helper, runs its own tests, and asks it "are you there?".
- `Test Window List.bat`: shows the open windows the helper can see. Nothing is captured.
- `Test Window Capture.bat`: shows the list, you type a number, and the picture is saved in `Test captures\` and
  opened so you can check it by eye.
- `Test Region Capture.bat`: shows your screens, you pick one and type four numbers (left, top, width, height,
  counted from that screen's top left corner), or `all` for the whole screen. Saved and opened the same way.

- `Test Click Capture.bat`: watches your mouse clicks for 20 seconds (press Enter to stop sooner). Every click on any program
  is saved as a picture of the whole screen the click was on, with a note of what was clicked, in a new folder inside
  `Test captures\`. It says plainly, before it starts, that the pictures show everything on the screen.

All of these build the helper first and keep their window open at the end so any error can be read. They run
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

One command, `watch-clicks`, keeps going after its reply. Until it ends, the helper also writes **event lines**, which have an
`event` (and a `watch` carrying the `id` of the `watch-clicks` request) instead of an `ok`. Every line the helper writes goes out
through one lock, so a reply and an event never mix.

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

### `crop-picture`

Request: `{"command": "crop-picture", "source": "C:\\...\\snapshot.png", "x": 100, "y": 50, "width": 300, "height": 200,
"out": "C:\\...\\part.png"}`. Cuts a rectangle out of a saved PNG and saves it as a new PNG. The four numbers count pixels from
the source picture's top left corner. `source` and `out` must be full paths ending in `.png`, and they may not be the same
file; the source is never changed. It needs no screen, so it works the same on any computer. Result: `path`, `width`,
`height`, `method` (`crop`), `note`, `elapsed_ms` and `region`. A rectangle that reaches past the edge of the picture, or has
no size, is refused with `bad-request` and plain words that give the picture's size; a source that is missing, not a PNG or
damaged is explained too. Only 8-bit red-green-blue (and with alpha) PNGs, which is what the helper makes, can be cut.
It is how Select on the screen gets the author's rectangle out of the snapshot.

### `watch-clicks`

Request: `{"id": 7, "command": "watch-clicks", "out_dir": "C:\\...\\pictures", "idle_seconds": 600, "max_clicks": 200,
"exclude_pids": []}`. `out_dir` must be the full path of a folder that already exists. `idle_seconds` (1 to 3600, default 600)
and `max_clicks` (1 to 1000, default 200, a safety limit so a mistake cannot fill the disk) are optional. It answers at once with
`{"watching": true, "idle_seconds", "max_clicks", "double_click_ms"}`, or an error (`bad-request` for a folder that is not there
or a number out of range, `busy` if a session is already running, `capture-failed` if Windows would not let the helper watch the
mouse). Only one session runs at a time. After the answer, **each click is an event line**:

```json
{"event": "click", "watch": 7, "n": 3, "path": "C:\\...\\click-1792454313196-003.png", "width": 1920, "height": 1080,
 "screen": {"x": 0, "y": 0, "width": 1920, "height": 1080},
 "click": {"x": 196, "y": 453, "button": "left", "target": {"role": "button", "name": "Save", "accessKey": "Alt+s",
           "bounds": {"x": 121, "y": 431, "width": 150, "height": 44}}},
 "held_ms": 40, "note": "optional plain words"}
```

- **The picture** is the whole screen the click was on (a `.png` in `out_dir`, written whole or not at all), as it looked
  just before the program under the pointer reacted. The mouse pointer is not in it.
- **`click`** is exactly a click note of the project format (`ClickInfo`, see `docs/format-spec.md`): `x` and `y` in picture
  pixels, `button` (`left`, `right`, `middle`), `double` (only when true) and `target`. The app can keep it as it is.
- **`n`** counts the clicks of this session from 1. **`held_ms`** is how long the click was held back while the screen was copied.
- **`note`** is present when something is worth saying: Windows did not say what was clicked, or did not answer in time (a
  program that has stopped responding), or the click was held back longer than 250 ms.
- A second click of the same button, soon enough and close enough (Windows' own double-click settings), is not a new step: the
  first click's event says `"double": true` instead. For that, the first click's event is sent up to about half a second late.
- Clicks in OpenExplainer's own windows (the helper's parent program) and in programs named in `exclude_pids` are ignored, so
  pressing the Stop button is not a step. A click that cannot be captured is counted, and a `{"event": "skipped", "watch", "count",
  "message"}` line says so, so a click is never lost silently.
- The session ends with `{"event": "ended", "watch": 7, "ended": "stopped" | "idle" | "limit" | "hook-lost", "clicks", "skipped",
  "slowest_hold_ms"}`: `stopped` after `stop-watching`, `idle` after `idle_seconds` with no recorded click, `limit` at `max_clicks`,
  `hook-lost` if Windows took the mouse watcher away. The last picture is saved before `ended` is sent.

**What is said about the clicked item (the privacy rules).** Windows UI Automation is asked what is under the pointer. A
**password box** is reported as `{"password": true}` and nothing else is asked about it. For a **button, check box, radio button,
combo box, menu, menu bar, menu item, slider, spin box or split button** the `name`, `acceleratorKey`, `accessKey` and
`description` are given. For **everything else** (list items, text boxes, documents, windows, tabs, links, panes) only the `role`
(the kind of item) and the `bounds` (its outline, cut to the screen, in picture pixels) are given, because such names can be private:
an email subject, a file name, what is in a box, a browser tab's page title or a link's text. What is typed in a box is never
read, and the keyboard is never watched. The list is one function, `details_allowed`, in `capture-helper/src/clicks.rs`. The
project's own code checks the same rules again when a project is opened and saved (`src/project/clicks.ts`).

**How it works, and its limits.** A low-level mouse hook (`WH_MOUSE_LL`) sees every click before the program under the pointer. For
each button-down it holds the click back while it copies the screen (about 35 to 45 ms for a 1920 by 1080 screen on the test PC;
a bigger screen takes longer), so the picture is from before the program reacted. At the same moment a second thread asks UI
Automation what is there (it gives up on a stuck program after 1.5 seconds, and the event waits at most 2.5 seconds for the answer),
and a third saves the PNG and writes the event. Windows removes a hook that holds a click for too long (usually about 300 ms), so the
hook does nothing slow; if a copy is ever slower than 250 ms the event says so. At most six pictures wait to be saved; a click
beyond that is skipped and counted. A program running as administrator may not be seen by a helper that is not, and some security
programs warn about any program that watches the mouse. Neither was tried.

### `stop-watching`

Request: `{"command": "stop-watching"}`. Answers `{"stopping": true}` if a session is running (`false` if not, which is fine). The
`ended` event follows as soon as the last picture is saved (0.1 seconds in the tests). When the app closes the pipe the helper
quits and Windows takes the hook away with it.

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
| `busy` | A click-by-click session is already running. |
| `not-supported` | A non-Windows build. |

## What the app does (Step 3b, part 5)

The helper does not enforce the 20-second timeout, the Cancel button or hiding the app. The app does.

**The shell (`src-tauri/src/capture.rs`)** has three commands. It uses no extra Tauri plugin and no extra permission.
- `capture(request, timeoutMs, hideApp, delayMs)` starts the helper (with no console window), sends it one request line and waits
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

**Waiting first.** `capture` and `select_region` both take an optional `delayMs` (the shell caps it at 60 seconds, and only
waits when it is hiding the app). After the Cancel window is up and the main window hidden, the shell waits in 25 millisecond
steps and checks the Cancel flag each time, so Cancel ends even a 60-second wait at once. Only then does the helper start, so
the 20-second limit starts after the wait and a long wait never counts against it. See "Wait before capturing" below.

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

**Wait before capturing.** The dialog has a box, *Wait before capturing, in seconds*, under both choices. It takes a whole
number from 0 to 60 (0 captures straight away, which is how it starts; the app remembers the last number used until it is
closed). It applies to a window, to a typed rectangle and to Select on the screen. `src/capture/wait.ts` checks it before
anything starts, and a mistake is explained next to the box in the same way as the rectangle boxes ("Type the wait as a whole
number of seconds from 0 to 60, such as 5. "ten" is not one." or "The longest wait is 60 seconds. Type a number from 0 to
60."). The box has a label and help text that a screen reader reads.
- **What the author sees.** OpenExplainer hides, and the small Cancel window shows "Waiting to capture", a count-down ("Capturing
  in: N seconds") and a Cancel button. When the count reaches 0 it changes to "Capturing" and the usual 20-second time left.
- **The Cancel window does not take the keyboard during a wait.** The author is using another program, perhaps with a menu
  open, and a window that grabbed the keyboard would close the menu. So with a wait the Cancel window opens without focus (with
  no wait it takes focus as before). The Cancel button works with the mouse. With the keyboard, use Alt+Tab (the window stays in
  the taskbar and Alt+Tab) to come back to it and press Esc, which its text says. A screen reader is told the wait once, not every
  second.
- **A rectangle or Select on the screen sees the screen as it is after the wait.** For Select on the screen the snapshot is
  taken after the wait, so it holds an open menu; then the Cancel window closes and the selection window opens as before.
- **A menu is a window of its own.** A capture of a *window* leaves a pop-up menu out (the same reason a program's own modal
  dialog is left out). To get a menu, use a rectangle or Select on the screen. The help text under the box says so.

**Select on the screen.** In the rectangle part of the dialog, the button *Select on the screen* takes a snapshot of the
chosen screen and shows it, full size, in a window of its own, so the author can choose the rectangle on a frozen picture.
- **The shell** (`select_region`) hides the main window and shows the Cancel window exactly as a capture does, has the helper
  take the snapshot (`capture-region` of the whole screen into a temporary file, with the same 20-second limit), and then
  closes the Cancel window and opens the selection window (`selection.html`) exactly over that screen: borderless, always on
  top, still in the taskbar and Alt+Tab. It waits for the author's answer. There is no time limit on choosing.
  **Fail-safes so a full-screen window can never trap anyone:** Escape, the Cancel button and the window's close (Alt+F4, the
  taskbar) all cancel; if the page has not reported it is showing (`selection_ready`) within 5 seconds, the app closes the
  window by itself and says "The window for choosing a rectangle did not start, so nothing was captured. Your project was
  not changed. Try again, or type the four numbers instead."; and if the window vanishes, that counts as Cancel. The snapshot
  is deleted on cancel and on every failure, and `Select on the screen` cuts the picture from it through `crop-picture` and
  then deletes it. Because it shows the author's whole screen, leftover pictures in the temporary capture folder that are an
  hour old are swept out when the app starts.
- **The page** (`src/selection.ts`, rules in `src/capture/selection.ts`) shows the snapshot at its real size (a page pixel
  may be several screen pixels on a scaled display, so it divides by `devicePixelRatio`; only 100 percent could be tried).
  Three ways of working, always in step: **the mouse** (drag from outside the rectangle to draw a new one, drag inside to move
  it, drag a corner to resize it; a click without a drag changes nothing), **the keyboard** (arrow keys move it by 1 pixel,
  Shift with them resizes, Control makes the step 10, Enter captures, Escape cancels) and **four number boxes** (the same
  four as in the dialog, with the same plain-words checks), which are also the main route for a screen reader. A live region
  says "Rectangle: 40 by 40 pixels, 20 from the left and 200 from the top." after the changes settle, and the size is also
  written on the screen. The rectangle has a white-and-black double outline so it shows on any background, the outside is
  dimmed, and the panel of controls moves to the other side if the rectangle is under it. The rectangle starts as the dialog's
  four numbers, or a smaller one in the middle if those were not a good rectangle.
- **After the choice** the app cuts the picture out of the snapshot (`crop-picture`, no hiding needed), asks for the
  description as usual, and adds it with `source.kind` `region` named by screen and place. A cancelled selection is announced
  quietly ("The selection was cancelled. Your project was not changed.") and is not shown as an error.
- **For tests:** `OPENEXPLAINER_SELECTION_PAGE=no-such-page.html` makes the window fail to start, to prove the fail-safe.

A snapshot is a frozen picture, which is what makes the choice exact. It does not by itself let the author capture a menu
that another program closes: pressing OpenExplainer's button closes that menu before the snapshot is taken. That needs a delay
before the snapshot, which is not built.

**Click by click, the app side (part 7c).**
- **The shell** (`src-tauri/src/capture/clicks.rs`, a child module of `capture.rs`): `watch_clicks(idleSeconds?, maxClicks?)` shows the
  Stop window, hides the main window, starts the helper with `watch-clicks` and the capture folder, and keeps reading its lines on a
  background thread. It ends when the author presses Stop (it sends `stop-watching` and waits up to 5 seconds for the helper's `ended`, then
  stops the helper anyway), when the helper says `ended` (idle time, click limit), or when the helper falls over (the clicks so far are
  kept, `ended: "helper-stopped"`). It returns `{kind: "clicks", clicks, skipped, ended}`, or `reply` (the helper said no, with its own
  words), `stopped`, `busy` or `unavailable`, like every other capture. Only one capture at a time. The windows and the helper are always
  cleaned up. `stop_clicks` is what Stop calls, and `click_session_status` gives the count so far (the Stop window asks every 0.4 seconds,
  which needs no capability permission).
- **The Stop window** (`click-bar.html`, `src/click-bar.ts`): top right of the main screen, always on top, kept out of screen copies (so it is
  never in a picture) and opened **without** taking the keyboard from the program the author is working in. It shows "Clicks captured:" and
  the count, tells a screen reader "3 clicks captured." politely after each click (in a hidden live line, not by announcing the visible
  number), and has a Stop button. Stop, the Escape key (once the window has the keyboard, after Alt+Tab) and the window's close button
  all stop the session and **keep** every click so far. Clicks on it are ignored by the helper, so pressing Stop is never a step.
- **TypeScript** (`src/capture/clicks.ts`, `client.watchClicks()`): `Shell.watchClicks` asks the shell; `collectSession` checks every click
  note again with the project's own rules (`cleanClick`, so a password box and anything typed in a box are cleaned out whatever the helper
  said), collects every picture at once so none is left in the temporary folder, and counts the clicks it could not use (a note that is not
  valid, a picture that cannot be read), deleting their pictures. `describeEnded` says in plain words why a session ended by itself,
  `describeLost` says how many clicks were lost, and `describeShot` says a click in words. Every failure is plain words ending "Your project
  was not changed.", as for every other capture.

- **The choice in the Capture dialog** (`src/dialogs.ts`): a third radio button, *Click by click*. It shows a plain explanation of what is and is
  not recorded (only mouse clicks, never the keyboard or what is typed; a password box noted only as that; names kept only for buttons, menus
  and similar controls; the pictures show the whole screen and are kept only if the author keeps them; it stops by itself after 10 idle minutes
  or 200 clicks), hides the *Wait before capturing* box (watching starts at once) and the other parts, and the button reads *Start capturing
  clicks*. Switching back brings the wait box and the word *Capture* back.
- **The review list** (`reviewClicksDialog` in `src/dialogs.ts`, rules in `src/capture/review.ts`), shown when the author presses Stop: every click
  in order, each with a small picture of the screen just before the click, the click in words ("Click on the button "Save" (access key Alt+S)."),
  a *Keep click N* tick (ticked), and a description box that starts **empty**. Beside each box is a button, *Use the click's words*, that fills
  the box with the click's words **only when the author presses it**, so a description is never filled in silently. Notices come first: why the
  session ended early (idle time, click limit, Windows or the helper stopped), and how many clicks were lost. Enter in a description moves to the
  next one (and finally to the OK button), because it must not press OK and add everything. *Add the kept pictures* adds the kept clicks to the
  selected topic **in click order**, each as a picture with `source.kind` `click`, the click in words as `originalName`, and the `click` note
  beside it; a picture whose description was left empty shows as "Needs a description". *Throw them all away* (and Escape) asks "Throw away the
  clicks?" first, with focus on Cancel, because the clicks only exist in memory; Cancel there goes back to the review with everything typed kept.
  A session with no clicks says "No clicks were captured ... Nothing was added. Your project was not changed." and nothing else.

**The click circle and click details in the picture list (part 7d).** The format side is in `docs/format-spec.md` ("The click highlight").
- **Click details.** A click picture shows, under its name and size: where the click was ("Click at 196 across and 453 down in the picture."),
  what Windows said about the item ("Windows describes it as ..."), and the item's outline; a password box says only where the click was.
  What its circle is doing is said too ("Click circle: follows the project (not shown in the book).").
- **The circle on the thumbnail.** An SVG drawn over the picture in the picture's own pixels, so it lines up at any size, and never burned into
  the file. Next to *Capture into the selected item* are *Click circle settings* and *Show the click circle as in the* **Book** or **Quick guide**
  (a preview choice for this session; the book is the starting one, where the circle is off until a picture says "always show").
- **Click circle settings** (`highlightDialog`): for the book and for a quick guide, whether the circle shows, its size (percent of the picture's
  width, 1 to 20), its colour (six hex digits, or a ready-made colour: yellow, orange, green, blue, pink, red, white) and its see-through level
  (0 to 100). A sample drawing follows what is typed, with the same rules as the real circle. A mistake is explained next to the box ("Problem in
  the quick guide settings: Type the size as a number from 1 to 20, such as 3. "big" is not one."), the box is marked and focused, and the dialog
  stays open. The settings are kept in the project.
- **One picture's own choice** (click pictures): *Click circle:* **Follow the project setting**, **Always show** or **Never show**, and *Move the
  circle*, which takes two whole numbers (across and down, in picture pixels) or puts the circle back on the click. The click itself is never
  changed. Focus returns to the control that was used.

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

Select on the screen was tried in the real window, with a made-up window that fills most of screen 2 (so the snapshot is almost
all that window): the window opens exactly over screen 2 (position and size 1920 by 1080, the snapshot is 1920 by 1080 and
fills it, the rectangle has the keyboard focus, and OpenExplainer's only visible window is the selection window); a mouse drag
from outside the rectangle gave exactly the typed numbers, the live region said the size and place, Enter captured it, and the
picture was 40 by 40 and exactly the red block, named by screen and place; the arrow keys, Control for 10 pixels, Shift for
the size, and Shift with Control all moved and resized as described; dragging inside moved the rectangle, dragging the bottom
right and the top left corners resized it with the opposite corner fixed, and a click without a drag changed nothing; typing
into the four boxes moved the rectangle, a mistake was explained and the Capture button then refused and focused the box with
the mistake; Escape and a close message to the window both cancelled quietly (no error box, nothing added, snapshot deleted,
main window and focus back); and with the page deliberately missing, the app gave up by itself after about 6.5 seconds with the
plain message, deleted the snapshot and left only the main window. The page was looked at as pictures clipped to the parts that
show only the made-up window. The part 6 dialog checks (including every control having a name) were run again with the new
button present and passed. `crop-picture` has 7 helper tests and was also tried on a real snapshot (colours exact, 7 ms).

The wait was tried in the real window with made-up windows, one whose red block turns purple 4 seconds after it starts and one
that opens a pop-up menu on a timer. A rectangle with a 5-second wait: OpenExplainer's main window was hidden, the Cancel window
said "Waiting to capture" and counted down (4 left after 1.5 seconds), the made-up program still had the keyboard (the Cancel
window did not take it), the picture came 5.6 seconds after Capture was pressed and showed the block purple, not red. Select on
the screen with a 5-second wait: the snapshot came 5.8 seconds after, a 40 by 40 picture of the purple block was cut from it, and
the snapshot was deleted. Cancel in the middle of a 30-second wait, by the button and by the Escape key: it stopped after about 2
seconds, said "You cancelled the capture. Your project was not changed.", added nothing, left no helper running and brought the
main window back. Mistakes in the wait box ("ten", 61, -1, 2.5, "soon") were each explained next to the box, with the dialog
still open and the box focused and marked, in the window and rectangle modes and by Select on the screen. A 3-second wait followed
by a program that never answers (limit shortened to 2 seconds) took 5.4 seconds in all, so the limit really starts after the wait.
A pop-up menu that appeared during a 5-second wait: the rectangle picture shows the menu and the window picture of the same
program leaves it out (both pictures were looked at, not only sampled). A first version of that check passed for the wrong reason,
because the menu had already closed (tapping Alt to bring the test window forward closes a menu); looking at the picture showed
it, and the test now makes the menu appear during the wait. The earlier checks (normal, frozen, cancels, time limit, closed
window, rectangles, whole screen, mistakes, labels, bring to front, drag, keyboard, numbers, close, fail-safe, handles) were run
again and passed. The shell has 16 tests (3 new for the wait: it runs its full length, Cancel ends it at once, it only happens
when the app is hidden and is capped at 60 seconds), and `src/capture/wait.ts` has 5.

Click by click (part 7b) was tried with the real helper and real mouse clicks (sent by a test tool, so the pointer moved by itself)
on made-up windows with a real button, check box, password box, text box holding private text, list box and pop-up menu, on both
screens. Eight clicks gave eight pictures of the whole 1920 by 1080 screen, each held back 33 to 44 ms. The picture of a click on a
button that turns a block purple the moment the mouse goes down showed the block still red, and the next picture showed it purple:
the picture really is from before the program reacted. The notes said: button "Save" with its access key and outline, check box
"Remember me", menu item "Open file", and a password box as only `{"password": true}`. The text box said only "text box" and the list
item only "list item", and neither the password, its label, the text in the box nor the list item's text appears anywhere in what the
helper said (searched in every line). A double-click was one step marked double. A right-click was marked right. A click in a window of
a program named in `exclude_pids` (standing in for OpenExplainer's Stop button) was ignored. A click on the main screen gave a picture
of the main screen with the click and the block in the right place. A click on a program that had stopped responding was not held up
(44 ms) and gave a note that Windows did not answer. Eight quick clicks 120 ms apart were all captured (none skipped, slowest 42 ms).
The session ended by itself after the idle time (2.1 s for a 2 second setting), at the click limit (2 pictures), and on `stop-watching`
(0.1 s). A second session was refused, a missing folder was refused in plain words, and quitting the helper closed everything. The
helper has 60 tests, 13 of them new (the privacy rules, double-click rule, outline cutting, settings and event shape), and
`Test Click Capture.bat` was tried with two real clicks.

The app side of click by click (part 7c, first half) was tried in the real window (a development build driven through its debugging port),
with real injected clicks on a made-up window and the real TypeScript client: the Stop window showed and the main window was hidden;
Windows was told to keep the Stop window out of screen copies (display affinity 0x11); it did not take the keyboard (the same program had
it before and after); three clicks showed as 3 and were announced as "3 clicks captured."; the Stop button was pressed with the real mouse
and was not recorded as a step; the three clicks came back through the client with the button's name, the check box's name and the password
box as only `{"password": true}`; the password appears nowhere in what the app was given; no picture file was left in the temporary folder;
the main window came back and no helper was left. The Escape key and the window's close button also stopped the session and kept the click.
The idle time (3 seconds asked, ended after 3.5), the click limit (2 clicks) and a second capture while one was running (refused in plain
words, the first unharmed) all worked. The Stop window was looked at as a picture, and its height was corrected because a scroll bar showed.
The shell has 25 tests (9 new, with a pretend helper that stops, ignores Stop, falls over, says no or never answers), and there are 13 new
TypeScript tests. One first run recorded four clicks that the author made on the PC at the same time: the session records every click on the
screen, by design, so the tests now look only for their own clicks and print nothing else.

The Click by click choice and the review list were tried in the real window the same way. The dialog's third choice, its five plain-words points,
the hidden wait box, the button words and a name for every control were checked. The whole flow ran several times: choose, press Start, four real
clicks on the made-up window, Stop, the review list with every row ticked, its picture showing and its description box empty; *Use the click's
words* filled in exactly the click in words and told a screen reader; Enter moved to the next description and did not add everything; a click was
left out and the author's own description typed; *Add the kept pictures* added exactly the kept clicks to the topic, named by the click in words,
with the typed description on its picture and the others flagged "Needs a description". Throwing away asked first (focus on Cancel), Cancel went
back with the typed words kept, Escape asked again, and yes added nothing and said so. Stopping before any click said so in plain words. The review
list was looked at as a picture (the small pictures show the red block red before the Save click and purple before the next). A few runs found
a click that had landed on the author's own program: the made-up test clicks are real mouse clicks, and the person using the PC moved the mouse
between the pointer being placed and the click, so that run was repeated. The review rules have 6 TypeScript tests.

The click circle (part 7d) was tried in the real window with three real click pictures: the details lines; the book preview showing no circle and
saying why; the quick guide preview showing the circle exactly on the click with the starting look (yellow, 3 percent of the width, 40 percent
see-through); "Never show" taking one picture's circle off with focus staying on its choice; "Always show" showing one in the book; moving a circle
(a typed mistake explained with the dialog open, then the new place drawn, the click still recorded where it was, focus back on the Move button)
and putting it back; the settings dialog opening with the starting look, a mistake explained next to the box, the sample following a typed size, a
ready-made colour and a see-through level, a typed code showing "Other", Save changing every circle (red, 10 percent, 75 percent see-through), and
Cancel changing nothing; every control in both dialogs has a name. A zoomed picture of a thumbnail showed the circle on the check box that was
clicked. The first run found a rounding mistake (75 percent see-through was drawn as 0.3, not 0.25) and it was fixed. The rules have 20 TypeScript
tests (`highlight.test.ts`, `highlight-input.test.ts`). The circle is drawn in the editor only: export will use the same rules and is not built.
Saving a project with these settings and opening it again was tried by unit tests, not through the app's own Save and Open.

A real project with real click pictures was also packed and unpacked by the app's own code inside the real window (the helper's pictures,
the circle settings, two pictures' own circle choices, one description): unpacking gave exactly the project that was packed, every picture's bytes
came back exactly (3 whole-screen pictures, 1418 KB, packed in 4 ms), and the .NET zip reader opened the file and found version 4, the settings,
the click notes, the choices, and the password box as only `{"password": true}`.

A keyboard-only pass was driven with simulated key presses (Tab, Shift+Tab, arrow keys, Space, Enter and Escape sent to the page) over the
Capture dialog in Click by click mode, the review list, the click circle settings and Move the click circle. Tab reaches every control in each
(a radio group counts as one stop), focus never leaves the dialog, Shift+Tab goes back, Escape closes each (the review list asks first, and
Escape on that question keeps the review open with what was typed), focus returns to the control that opened the dialog, Space on a Keep tick
leaves a click out, Enter on *Use the click's words* fills the description, Enter in a description moves to the next one without adding
anything, the arrow keys change the ready-made colour and a picture's circle choice and keep the focus, and Start was pressed with Enter. The
pass found one thing: Tab from the last control landed on nothing for one press before coming back to the first, where a screen reader has no
control to read. Every dialog now wraps Tab from the last control to the first and Shift+Tab from the first to the last (`wrapTab` in
`src/dialogs.ts`), and the pass was run again with no stop on nothing.

Not tried (the app side of click by click): saving and opening through Windows' own Save and Open dialogs (the dialog's File name box swallows
automated typing, see `docs/HANDOFF.md`, and the app's file plugin only allows paths the dialog picked, so a test cannot write elsewhere); a
screen reader on any of the new windows; a session of many minutes, many clicks in the review list (it scrolls, but a list of 200 was not
tried), a screen reader on the Stop window or the review list, Alt+Tab to the Stop window and Esc by a person, keyboard-only use of the review
list start to finish, saving a project with click pictures and opening it again in the app (the format is tested, the app's own Save was not
driven), and a display scaling above 100 percent.

Not tried (click by click): a program running as administrator, a display scaling above 100 percent, a screen bigger than 1920 by 1080
(the hold-back grows with the size of the copy), a session of many minutes, a security program's reaction, Windows on ARM, a person
doing it by hand with the bat file, and the app side (part 7c).

Not tried: Select on the screen at a display scaling above 100 percent (the page is written to divide by `devicePixelRatio`),
a screen reader on the selection page, and keyboard-only use start to finish by a person; a screen reader on the Capture dialog, the description prompt and the Cancel window; a release build of the
app (the production build of the web part was checked and contains `capture-bar.html`, but the release `.exe` was not
run); keyboard-only use start to finish was not walked through by a person; the helper inside an installer; "bring to the
front" with a program that refuses to be activated; a wait of the full 60 seconds; Alt+Tab to the Cancel window and Esc by a person
(the window is in the taskbar, but the keys were not pressed); a screen reader on the wait box and the Cancel window's count-down;
a tooltip that appears only after the mouse rests on something (the wait would allow it, but it was not tried).

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
