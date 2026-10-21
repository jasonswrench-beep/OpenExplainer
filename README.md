# OpenExplainer

A free, open-source tool for making still-image tutorials and how-to books from screen captures.
Licensed under Apache 2.0.

OpenExplainer is built for people who need to document software: capture a screen, write the steps,
add numbered markers and callouts, and publish a printed-quality book or short step-by-step guides.

## Status

Early. You can create a project, build a chapter and topic tree with numbering and status, and save and open it as one file, such as Test1.openexplainer. You can import PNG and JPEG pictures into a topic, each with a description. Screen capture is built as a separate small program, the capture helper: it can list your open windows and capture one, list your screens, and capture a rectangle of the screen. In the app, **Capture into the selected item** (in Pictures) uses it to capture a window or a rectangle of a screen, with a 20-second limit and a Cancel window (see `docs/capture-helper.md`). A rectangle can be typed as four numbers or dragged out on a snapshot of the screen (**Select on the screen**). A **wait before capturing** (0 to 60 seconds) lets you open a menu in another program first. Choose **Click by click** in the Capture dialog to capture every click you make in another program, each as a picture of the whole screen with a note of what was clicked; you review them, describe each one and keep the ones you want. A click picture can show a transparent circle on the click (**Click circle settings**, set for the book and for a quick guide, and per picture). Each topic has a **page** written in a block editor (paragraphs, headings, pictures, numbered procedures and callout boxes, with bold, italic and control-name marks), in a three-pane window (see `docs/editor.md`). A picture can have **lettered callouts**: a marker with a letter, a line to the part of the picture it names, and an entry under the picture with its name and a sentence. A click picture gets its first callout by itself from the item that was clicked, and callouts are added, moved, re-ordered and deleted in a **Callouts** dialog with typed numbers. A picture can also be shown **whole, cropped to a region, or zoomed in on its click** (a **Picture view** dialog for each picture, and **Zoom settings** for how close a zoom goes, one for the book and one for a quick guide); the picture file itself is never cut. Callout outlines, callout markers and crop regions can be drawn, moved and resized on a sample picture with the mouse, or moved and resized with the arrow keys, and the typed numbers stay beside them. Comments can be left on any block and listed across the book. The page can be seen as a **print preview** (the whole book drawn as sheets, with a contents list, chapter openers and notes for the writer, such as pictures that will be too small on paper) and as a **help site preview** (the contents tree, breadcrumbs and Previous and Next links). A **Drawing** dialog puts arrows, text boxes, rectangles and numbered markers on a picture (kept beside it, never burned in), with colours chosen from a short list, a contrast check that always warns in plain words but never stops you, alternative text on every mark, and named colour styles such as Warning. **Check the book** is an optional check before you export: it lists, in plain words, pictures and marks with no description, colours that are too close, callouts with no name or sentence, empty topics and blocks, missing picture files, variables with no value and pictures too small to read on paper, and you can go to each, ignore one, or ignore all of a kind (saved with the project). Export and AI drafting are not built yet.

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

To try the capture helper, double-click **Test Helper.bat**, **Test Window List.bat**, **Test Window Capture.bat**, **Test Region Capture.bat** or **Test Click Capture.bat**.

## Licence

Apache 2.0. See `LICENSE` and `NOTICE`.
