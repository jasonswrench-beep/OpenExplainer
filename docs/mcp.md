# MCP: letting an AI assistant use OpenExplainer

MCP (the Model Context Protocol) is the way an AI assistant such as Claude uses a program's tools. With it on, an assistant can document a program **while nobody is at the keyboard**: it makes a
project, captures the program's windows and the clicks made in it, writes the pages, names the callouts, builds the index, runs the book check and makes any export. The decisions behind this
are in `docs/ai-and-mcp-plan.md` (Jason's choices of 2026-10-21: the app itself runs with no window, MCP is off until turned on, capture is by window only).

## Turning it on

MCP is **off** until the author turns it on. In the app, choose **MCP access** (a toolbar button):

- **Turn on MCP access**, and **the folder an assistant may use**. An assistant can only open, save and export inside this folder, and nowhere else on the PC. (The shell refuses to turn MCP on for a folder that
  does not exist.)
- **Let an assistant capture a whole screen, not only one window** is off to begin with (see "Capture" below).
- The dialog gives the lines to connect an assistant: for **Claude Desktop** the block to add to `claude_desktop_config.json`, for **Claude Code** the command `claude mcp add openexplainer -- "<path>" --mcp`,
  each with a Copy button.

The settings are kept in `mcp.json` in the app's config folder (`%APPDATA%\\org.openexplainer.app`). Settings are read each time an assistant connects, so a change takes effect for the next one. A byte order mark at the start of the file (which Windows PowerShell's `Set-Content -Encoding UTF8` writes) is skipped; the AI help file `ai.json` is read the same way.

## How it runs

`openexplainer.exe --mcp` starts the app with **a window nobody can see** (not in the taskbar). The assistant talks to it on standard input and output, one JSON line at a time (`src/mcp/protocol.ts`:
`initialize`, `ping`, `tools/list`, `tools/call`). The shell (`src-tauri/src/mcp.rs`) only carries the lines to the hidden page (`mcp.html`, `src/mcp/main.ts`) and its answers back, and prints nothing
else on standard output. The hidden page is the app's own TypeScript, so everything works as it does in the window: the project, the drawing of marks onto pictures, every export and the PDF. When the assistant
closes the line, the program ends. If MCP is off, the assistant is refused at `initialize` with the words that say how to turn it on.

An assistant works in its own hidden copy of OpenExplainer, so **do not edit the same project in the app's window while an assistant is working on it**.

## The tools

Every change is saved as it is made. Every tool checks everything first, so a call that cannot be done says why in plain words and changes nothing. Tool calls run one at a time.

| Group | Tools |
| --- | --- |
| Projects | `list_projects`, `create_project`, `open_project`, `save_project` |
| Reading | `get_outline`, `get_topic` (the page as blocks, the pictures with what was clicked, the callouts, the index terms), `check_book`, `list_guides` |
| Writing | `add_topic`, `update_topic`, `delete_topic` (needs `confirm: true`), `set_page`, `append_blocks`, `describe_picture` (description and callout names), `make_callout_from_click`, `set_variables`, `set_index_terms`, `update_index`, `create_guide` |
| Capture | `list_windows`, `capture_window`, `capture_region` (off unless allowed), `start_click_capture`, `click_capture_status`, `stop_click_capture`, `view_picture`, `remove_picture` |
| Exports | `export_book` with `kind`: `help-site`, `json`, `markdown` (zip files), `word`, `guide-word` (.docx), `pdf`, `guide-pdf` |

A page is written as blocks (`src/mcp/blocks.ts`): `{type:'heading'|'paragraph'|'picture'|'procedure'|'callout', ...}`. Text uses the editor's own marks, `**bold**`, `*italic*` and `[[Control name]]`.
A mistake in a block is said with where it is ("Block 2 (procedure), step 1 needs its text").

## Capture, by window

The assistant does the clicking in the program with its own tools; OpenExplainer watches and records, exactly as it does for a person (click-by-click capture): a picture from just before each click and
a note of what was clicked, never anything typed and never a password box's contents (`docs/capture-helper.md`).

- `list_windows`, then `capture_window` (by a part of the title, or the id): one window, kept in a topic's list of pictures, with a small copy sent back so the assistant can see it.
- `start_click_capture` (naming the window), then the assistant uses the program, then `stop_click_capture`. Only clicks **inside the named window** are kept and each picture is cut to that window's part, so
  a mail window or a password manager on the same screen never gets into the project. Each kept picture has its click note and a first callout at the item that was clicked. Clicks outside the window are counted
  and said.
- `capture_region`, and a click capture with no window, need the author to have allowed whole screens. They are refused otherwise, with words saying how to allow them.
- **The Stop window (click capture) and the Cancel window (other captures) stay visible**, as they always do, so a person who comes back can stop it at once. Capture never captures OpenExplainer itself.
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
