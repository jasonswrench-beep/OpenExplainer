# OpenExplainer

A free, open-source tool for making still-image tutorials and how-to books from screen captures.
Licensed under Apache 2.0.

OpenExplainer is built for people who need to document software: capture a screen, write the steps,
add numbered markers and callouts, and publish a printed-quality book or short step-by-step guides.

## Status

Early. You can create a project, build a chapter and topic tree with numbering and status, and save and open it as one file, such as Test1.openexplainer. You can import PNG and JPEG pictures into a topic, each with a description. Screen capture is built as a separate small program, the capture helper: it can list your open windows and capture one, list your screens, and capture a rectangle of the screen. In the app, **Capture into the selected item** (in Pictures) uses it to capture a window or a rectangle of a screen, with a 20-second limit and a Cancel window (see `docs/capture-helper.md`). A rectangle can be typed as four numbers or dragged out on a snapshot of the screen (**Select on the screen**). Page editing and export are not built yet.

## What it will do

- Capture still images: a window, a region, click by click, or import a picture.
- Organize chapters and topics, with numbered procedures and callout boxes (Design Tip, Caution, Bright Idea, Power Tip, Time Saver).
- Annotate with arrows, text boxes, rectangles and numbered markers, with an optional click highlight.
- Warn about low contrast as you work (a warning only, never a block).
- Export a book as tagged PDF and Word, plus help site, JSON with images, and Markdown.
- Export short step-by-step guides in two layouts.
- Optional AI help (local Qwen 3.5, or your own ChatGPT, Claude or Gemini key). Everything works by hand without it.
- An MCP server so an AI assistant can help build documentation and eLearning.

## Running it

On Windows, double-click **Run OpenExplainer.bat**. The first run installs what it needs, which takes a few minutes.
You need Node.js and Rust installed. The script tells you if either is missing.

To check dependency licences, double-click **Check Licences.bat**.

To try the capture helper, double-click **Test Helper.bat**, **Test Window List.bat**, **Test Window Capture.bat** or **Test Region Capture.bat**.

## Licence

Apache 2.0. See `LICENSE` and `NOTICE`.
