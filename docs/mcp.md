# MCP: letting an AI assistant use OpenExplainer

MCP (the Model Context Protocol) is the way an AI assistant uses a program's tools. With it on, an assistant can document a program **while nobody is at the keyboard**: it makes a
project, captures the program's windows and the clicks made in it, writes the pages, names the callouts, builds the index, runs the book check and makes any export. The decisions behind this
are in `docs/ai-and-mcp-plan.md` (Jason's choices of 2026-10-21: the app itself runs with no window, MCP is off until turned on, capture is by window only).

## Turning it on

MCP is **off** until the author turns it on. In the app, choose **Tools > MCP access...**:

- **Turn on MCP access**, and **the folder an assistant may use**. An assistant can only open, save and export inside this folder, and nowhere else on the PC. (The shell refuses to turn MCP on for a folder that
  does not exist.)
- **Let an assistant capture windows** is off to begin with: without it an assistant sees no window titles and captures nothing (security review, 2026-11-13).
  **Also let it capture a whole screen, not only one window** is a second step on top, off to begin with too (see "Capture" below).
- The dialog gives the lines to connect an assistant: for one that reads its MCP servers from a settings file, the block to add to that file; for one that asks for the
  command that starts a server, the command itself (`"<path>" --mcp`), each with a Copy button.

The settings are kept in `mcp.json` in the app's config folder (`%APPDATA%\\org.openexplainer.app`). Settings are read each time an assistant connects, so a change takes effect for the next one. A byte order mark at the start of the file (which Windows PowerShell's `Set-Content -Encoding UTF8` writes) is skipped; the AI help file `ai.json` is read the same way.

## How it runs

`openexplainer.exe --mcp` starts the app with **a window nobody can see** (not in the taskbar). The assistant talks to it on standard input and output, one JSON line at a time (`src/mcp/protocol.ts`:
`initialize`, `ping`, `tools/list`, `tools/call`). The shell (`src-tauri/src/mcp.rs`) only carries the lines to the hidden page (`mcp.html`, `src/mcp/main.ts`) and its answers back, and prints nothing
else on standard output. The hidden page is the app's own TypeScript, so everything works as it does in the window: the project, the drawing of marks onto pictures, every export and the PDF. When the assistant
closes the line, the program ends. If MCP is off, the assistant is refused at `initialize` with the words that say how to turn it on. As it closes, the browser engine may write one line to the error output, `Failed to unregister class Chrome_WidgetWin_0. Error = 1412`. It is the engine tidying up, it is never on standard output (so the protocol is not touched), and it is left alone on purpose, so that a real error is never hidden with it.

An assistant works in its own hidden copy of OpenExplainer, so **do not edit the same project in the app's window while an assistant is working on it**.

## The tools

Every change is saved as it is made. Every tool checks everything first, so a call that cannot be done says why in plain words and changes nothing. Tool calls run one at a time.

| Group | Tools |
| --- | --- |
| Projects | `list_projects`, `create_project` (empty, or from the `openstage-how-to-book` or `software-user-guide` template), `open_project`, `save_project` |
| Reading | `get_outline`, `get_topic` (the page as blocks, the pictures with what was clicked, the callouts, the index terms), `check_book`, `list_guides` |
| Writing | `add_topic`, `update_topic`, `move_topic` (a chapter or topic, with its pictures and page, to another place), `delete_topic` (needs `confirm: true`; says how many links to it become plain words), `set_see_also` (a topic's See also list, up to 12 topic ids), `list_snippets`, `set_snippet` (name and the text a snippet is written in), `delete_snippet` (needs `confirm: true`; the words stay where it was used), `set_conditions`, `set_targets`, `set_topic_conditions`, `set_page`, `append_blocks`, `import_picture` (a PNG or JPEG from the MCP folder, as Import does in the program), `import_word` (a Word .docx file from the MCP folder, read into chapters and topics added at the end of the book; the answer lists what came in, with ids, and what was left out), `describe_picture` (description and callout names), `make_callout_from_click`, `add_callout` (a callout round a part of any picture, in pixels, for a window, region or brought-in picture that has no click), `delete_callout`, `set_variables`, `set_index_terms`, `update_index`, `create_guide`, `update_guide`, `delete_guide`, `set_picture_view`, `set_book_settings` (also `look`: fonts, accent colour, title page, header, footer, paper size), `set_logo` |
| Capture | `list_windows`, `capture_window`, `capture_region` (off unless allowed), `start_click_capture`, `click_capture_status`, `stop_click_capture`, `view_picture`, `remove_picture` |
| Exports | `export_book` (also `target`, a target's name, to leave out what it hides) with `kind`: `help-site`, `json`, `markdown` (zip files), `word`, `word-review` (a Word file for a review round, with the open comments as Word comments), `guide-word` (.docx), `epub` (an EPUB 3 e-book), `pdf`, `guide-pdf` |
| Translation | `export_book` kind `xliff` with `language` (an XLIFF 1.2 file of every piece of text), `import_translation` (a returned file from the MCP folder; saves a COPY of the book in the new language as a new project file in the folder and leaves the open book alone), `replace_picture` (another PNG or JPEG of exactly the same size in a picture's place, keeping its callouts and marks), and `set_book_settings` with `language` |
| History and review | `list_snapshots`, `take_snapshot` (a dated copy of the whole book kept in the project file; up to 20), `compare_snapshot` (what is different, in words), `restore_snapshot` (the whole book, or one topic with `topic_id`; needs `confirm: true`; the book as it is now is kept as a snapshot first), `rename_snapshot`, `delete_snapshot` (needs `confirm: true`), `list_comments` (the open comments of the pages), `resolve_comment`, `import_review_comments` (a returned review copy from the MCP folder; adds the reviewers' comments to their blocks, changes no words) |

`set_book_settings` sets, in one call (everything is checked first, so a mistake changes nothing): the width of a zoomed part in the book and in a quick guide (10 to 100 percent), the automatic zoom for print, the click circle for the book and for a quick guide (shown or not, size 1 to 20 percent, colour as six hex digits or a ready-made name, see-through 0 to 100), the writing-style notes (up to 2,000 letters) and the Words to avoid list (up to 100 lines, `word => use instead`). `set_picture_view` makes a picture show the whole picture, a region (in pixels from the top left corner) or a zoom on its click, so a tall window can be cropped; the picture file is never cut. `update_guide` changes a guide's name, layout, close-ups and its list of tasks, and `delete_guide` (with `confirm: true`) removes a guide and nothing else. These were added on 2026-10-23 after the first User Guide had to have its saved file edited by hand for the zoom and the click circle.

A page is written as blocks (`src/mcp/blocks.ts`): `{type:'heading'|'paragraph'|'picture'|'procedure'|'callout', ...}`. Text uses the editor's own marks, `**bold**`, `*italic*`, `[[Control name]]` and `[words](#topic-id)` (a link to another topic; a page with a link to a topic that is not in the book is refused).
A mistake in a block is said with where it is ("Block 2 (procedure), step 1 needs its text").

## Capture, by window

The assistant does the clicking in the program with its own tools; OpenExplainer watches and records, exactly as it does for a person (click-by-click capture): a picture from just before each click and
a note of what was clicked, never anything typed and never a password box's contents (`docs/capture-helper.md`).

- `list_windows`, then `capture_window` (by a part of the title, or the id): one window, kept in a topic's list of pictures, with a small copy sent back so the assistant can see it. A window owned by another, such as the Save or Open window of the program being documented, is listed too.
- `start_click_capture` (naming the window), then the assistant uses the program, then `stop_click_capture`. Only clicks **inside the named window** are kept and each picture is cut to that window's part, so
  a mail window or a password manager on the same screen never gets into the project. Each kept picture has its click note and a first callout at the item that was clicked. Clicks outside the window are counted
  and said.
- Every capture tool, and `list_windows`, needs the author to have allowed **capturing windows** in MCP access. Without it they are refused with words saying how to allow it,
  and no window title is given out (security review, 2026-11-13).
- `capture_region`, and a click capture with no window, need the author to have allowed whole screens too. They are refused otherwise, with words saying how to allow them.
- A path an assistant names is checked by its name (no `..`, inside the folder) and then by where it really leads, with links and junctions followed (`mcp_real_path` in
  `src-tauri/src/mcp.rs`), so a junction inside the folder is not a way out of it.
- **The Stop window (click capture) and the Cancel window (other captures) stay visible**, as they always do, so a person who comes back can stop it at once. A copy of OpenExplainer does not capture its own windows; another copy running on the same PC (the program being documented, when that is OpenExplainer) can be captured.
- `view_picture` gives the assistant a PNG no wider than 1280 pixels (or what it asks for) to look at.

## The log

Every use of a tool is written to **`OpenExplainer MCP log.txt`** in the MCP folder: when, which tool, `OK` or `REFUSED`, and the first line of the tool's reply. What was written on a page or in a
description is not in the log. A log that cannot be written never stops a tool.

## Trying it

Double-click **`Test MCP.bat`**. It builds the app, starts it with `--mcp` and talks to it as an assistant does (`tools/mcp-e2e.mjs`): refused while MCP is off; a project, pages, picture details, the
index, a guide, the check and all seven exports as real files; nothing written outside the folder; no visible window; nothing but protocol on standard output; the log; the program ending when the line
closes. (Capture is tried with made-up windows and injected clicks in the scratch tests, because it needs a real screen; see `docs/HANDOFF.md`.)

## What it does not do

- It does not click or type in the program being documented. The assistant does that with its own tools.
- It does not draft text with the built-in local AI yet (the plan, with Qwen 3.5 at 4B, is in `docs/ai-and-mcp-plan.md`). The assistant writes the text itself from what `get_topic` tells it.
- It works on one project at a time per connection.
