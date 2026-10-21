# Plan: the local AI and the MCP server

Written 2026-10-21 from Jason's answers. Nothing here is built yet. The decisions that need Jason are at the end.

## What Jason asked for

- **Local AI**: Qwen is Apache 2.0, so it works as the built-in model.
- **MCP server**: an AI assistant can use OpenExplainer to document something **without a person being actively involved**. So it must be able to capture, not only read and write.

Everything in the app keeps working by hand with no AI at all, and nothing an AI writes is exported as reviewed until the author accepts it (design spec, section 7).

## What I found out (looked up 2026-10-21)

- Qwen 3.5 exists in several sizes. The model card of `Qwen/Qwen3.5-9B` says Apache-2.0, 9B parameters, a 262,144 token context, and lists 600 quantised versions. `Qwen3.5-4B` exists too. A newer family, Qwen3.8 (for example `Qwen/Qwen3.8-27B`), is on the Qwen page, also Apache-2.0. Each file I download is still audited from its own card first, as `CLAUDE.md` says.
- `llama.cpp` is MIT licensed, has `llama-server` (a small program with an HTTP interface the app can talk to) and publishes prebuilt zips for Windows on both x64 and ARM64. So the model can run without Python and without building anything.
- The MCP protocol is JSON messages over standard input and output. It can be written in TypeScript without any library.

Sources: [Qwen3.5-9B model card](https://huggingface.co/Qwen/Qwen3.5-9B), [Qwen3.8-27B model card](https://huggingface.co/Qwen/Qwen3.8-27B), [llama.cpp](https://github.com/ggml-org/llama.cpp).

## The local AI (Step 7)

1. **One connector, three ways to fill it**: the built-in local model, the author's own ChatGPT, Claude or Gemini key, or none. Keys are kept on the PC, protected with Windows' own key storage (DPAPI), and never sent anywhere except the service they are for.
2. **The local runtime**: `llama-server` from llama.cpp, started by the app on a private local port only when a draft is asked for and stopped afterwards. Bundled in the installer (about 15 to 30 MB for the CPU builds, one for x64 and one for ARM64) so only the model is downloaded.
3. **The model**: downloaded the first time AI is turned on, not at install. A dialog says the size and where it comes from, with a progress bar, **Pause and Resume** (HTTP range requests, so a broken connection continues), **Cancel**, a check of the file's SHA-256, and a button to delete it. Stored in the app's data folder.
4. **What it drafts**, one thing at a time, each marked as a draft until accepted: names and one-sentence descriptions for callouts; a numbered procedure from a click-by-click capture; chapter openers and summaries; suggested boxes (labelled as suggestions); a consistency pass against the project's style sheet. (The index's first pass already works without AI.)
5. **Guards** from the design: never invent a control that is not in the capture, mark an unclear label "needs a name", and ask before any picture goes to an outside service. The local model never sends anything out. To begin with the drafts use the **words** of the capture (the clicked item's name, its kind, its shortcut), not the picture, so nothing visual leaves the PC even with a cloud key.
6. **Build order**: connector and settings; the model download; drafting callout names; drafting a procedure from clicks; the review screen that shows drafts apart from accepted text; the rest.

## The MCP server

**Goal**: an AI assistant (Claude Desktop, Claude Code or another) asks OpenExplainer to document a program while nobody is at the keyboard.

**How it runs (recommended)**: `openexplainer.exe --mcp` starts the app with no visible window and speaks MCP over standard input and output. The app's own TypeScript does the work, so **everything that exists works the same way**, including the drawing of marks onto pictures and the PDF, which cannot be done from a plain Node program. A small part of the shell passes the messages to the hidden window. The assistant's settings point at that command; the app can show a "Copy the MCP settings" box that gives the exact lines.

**Who does the clicking**: the assistant, with its own computer-use tools, in the program being documented. OpenExplainer watches and records, exactly as it does for a person: click-by-click capture already keeps a picture before each click and the clicked item's details, and never keeps typed text or a password box's contents.

**The tools, in the order I would build them**:

| Group | Tools |
| --- | --- |
| Open and read | create a project, open a project file, outline, read a topic, read the style sheet |
| Write | add a chapter or topic, set a page's blocks (paragraphs, headings, numbered steps with pictures, boxes), name and describe callouts, set alternative text, set index terms, set a topic's status, save |
| Capture | list windows, capture a window, capture a region, start and stop click-by-click capture into a topic |
| Draft | draft a procedure from the clicks (with the local model if it is set up, otherwise hand back the structured details for the assistant to write itself) |
| Check and export | run the book check, update the index, export any of the seven kinds (help site, JSON, Markdown, Word, PDF, guide as Word or PDF) |

**Safety, because nobody is watching**:

- MCP is **off** until the author turns it on in settings, and it names the folder projects may be opened from.
- Capture is **by window** to begin with, not the whole screen, so an unattended run cannot photograph a mail window or a password manager by accident. The author can allow the whole screen.
- The **Stop window stays visible** during every capture, as it does today, so a person who comes back can stop it at once.
- Every action is written to a plain log file beside the project, in words.
- Passwords and typed text are never kept (already the rule).

## Order of work I suggest

1. The MCP server first: it mostly connects what already exists, and it is the thing Jason wants soonest.
2. The local AI second: it is bigger (a runtime, a multi-gigabyte download, the review screen), and once it exists the MCP's draft tool can use it.

## Decisions for Jason

1. **How the MCP server runs**: the app with no window (recommended, because exports and PDF then work unchanged) or a separate small Node program (simpler to start, but it cannot draw marks onto pictures or make a PDF).
2. **The MCP safety defaults** above: off until turned on, capture by window only, Stop window always visible. Anything to change?
3. **The default Qwen model**: Qwen 3.5 at 4B (about 2.5 GB, quick on a laptop, recommended), 9B (about 5.5 GB, better writing, slower), or a newer Qwen 3.8 size (the design spec named 3.5).
4. **Which to build first**: MCP then AI (recommended), or AI then MCP.
