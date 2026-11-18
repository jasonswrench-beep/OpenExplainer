# Bringing in a recording (the shared capture format, C1)

Written 2026-11-16. Item 1 of the OpenExplainer development list: *Read C1 recordings, so a Recorder or Author capture becomes a guide or a book chapter.*

## What it does

**Insert, Import a recording...** (or **Ctrl+K**, "recording") takes a folder made by OpenStage Recorder or OpenStage Author (its name ends in `.capture`) and turns the
clicks the recording noted into the same thing a live click-by-click capture makes: a picture of the screen from just before each click, with a click note (where it was, the
item that was clicked and, for a button or a menu, its name) and a first callout. A recording says what was clicked but not how big it was, so the callout is a small box round the
click (5 percent of the picture's width, at least 40 pixels), named for a button or a menu and left unnamed otherwise; the author moves or resizes it in the Callouts window if the item is bigger
(made this way since 2026-11-18; alpha 5 said it made one "at that item" and made none). The author sees the same review list as after a live capture, keeps or leaves out
each click, writes the descriptions, and presses OK; nothing is added to the book before that. An assistant does the same with the `import_recording` tool
(`docs/mcp.md`).

So one recording can feed a book, a quick guide and everything else OpenExplainer makes, without a second capture. The recording is never changed.

## How it is built on the core

The format and the code that reads it belong to the shared core (`jasonswrench-beep/openstage-core`, tag `capture-v0.1.0`, `specs/capture/`). Nothing of it is copied here:

| Job | Who does it |
| --- | --- |
| Open the folder, check its schema, list its takes, read `events.jsonl` (skipping a half-written last line) | the core's `openstage-capture-project` (`open_project`, `list_takes`, `read_log`) |
| A plain edit of a take, and one still picture of it at a moment | the core's `openstage-capture-windows` and `-render` (`edit_from_take`, `export_frame`, `WindowsPictures`: Windows' own video decoder) |
| Which clicks make a step, the double-click rule, which names may be kept, where a click is in the picture | OpenExplainer (`capture-helper/src/recording.rs`) |
| The dialog, the review list, the callouts, saving | OpenExplainer (`src/recording-dialog.ts`, `src/capture/recording.ts`, `src/main.ts`) |

The work is done in the capture helper (its own process, with a time limit), so a bad file can never freeze the app. A newer schema than the core knows is refused in the core's words,
and an old one (0.1.x to 0.2.4) opens as the core says it does.

## The rules

- **Only clicks with a log.** The recording must have been made with interaction notes on. A take with no `events.jsonl` says so in words ("it was recorded with interaction notes off") and nothing is added.
  The author's `marker` notes and the keys that were pressed are not used yet (see "Not done").
- **The picture is taken 100 milliseconds before the click**, three pictures of the video, so it shows the program before it reacted, as the live capture does. A click in the first moments takes the first picture.
- **A click's place in the picture.** The log counts from the display's corner: used as it is for a whole display, minus the region's corner for a region recording, minus the window's corner (as the log last said where that
  program's window was) for a window recording. A window recording with no known window place leaves those clicks out and says how many. A click outside the picture (on another screen) is left out and said.
- **A double-click is one step**: the same button again within 500 milliseconds and 4 pixels. The back and forward buttons make no step. Left, right and middle clicks do.
- **Names are kept as for a live click**: only a button, a check box, a combo box, a menu, a menu bar, a menu item, a radio button, a slider, a spin box or a split button keeps its name. A text box, a list item, a tab, a link
  and the rest keep only the kind of item, because their names can be private (an email subject, a page title, what was typed). The recording's log never says a box is a password box, so a text box never keeps a name
  at all. The core's words are changed to the app's (`edit` is `text box`, `spinner` is `spin box`).
- **Window titles and the program's file names are never carried in.** The log holds them; the click note does not. The pictures go in as `click` pictures with the usual description of the click as their name.
- **Limits.** At most 200 clicks at a time (the limit a live session has; the author may choose fewer), 20 pictures to a request, a 90 second limit for each request.
  A run that fails in the middle adds nothing.

## What the author sees

The window lists the recording's name, its takes (a take that cannot be used is named in words and cannot be chosen), what was found ("42 clicks found in take 2 (3 minutes 12 seconds); 5 are double-clicks, each one step; 31 have the name of
the item that was clicked."), what was left out and why, and a box for how many clicks to bring in. Escape and Cancel close it. Every message is plain words and ends by saying the project was not changed when that is so.

## Tried

- 14 tests in `tests/recording.test.ts` and 3 in `tests/mcp-capture.test.ts`; 21 in `capture-helper/src/recording.rs`; one in the app shell (`src-tauri/src/capture.rs`).
- **A real video:** a test makes a three second MP4 with Windows' own encoder (red, then green, then blue), writes a recording folder round it, and cuts pictures at 0.5, 1.5 and 2.5 seconds
  through the real code: the right colours come back, in the right size, and a click outside the picture is said to be outside.
- The real helper program was driven over its pipe against Studio's example recording (a log with no picture: refused in words) and three recordings on the author's PC (no click log: refused in words). Only counts were read.

## Not tried

- A recording with a real click log and a real video from OpenStage Recorder (none exists on this PC: the author's recordings were made with interaction notes off). The log is read as the core's format document says; a first real one is the test to make
  (see `TESTING-TODO.md`).
- The folder chooser (Windows' own window) and the dialog with a screen reader. The page cannot drive the chooser.
- Window recordings with real window places, and display scaling.

## Not done

- The author's `marker` notes (a step with no click) and typed keys (a step such as "Press Ctrl+S") are in the log and could become steps; they are not used yet.
- Choosing which clicks to bring in by looking at them before the pictures are cut: the author sees every picture in the review list, after, and can leave any out.
- Re-capturing one step so every output updates (the provenance links of the core's C1 list): it needs the core to say how a step is named in a recording and in the book.
