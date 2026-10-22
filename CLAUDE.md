# OpenExplainer

Free, open-source desktop tool for making still-image tutorials and how-to books from screen captures. Apache 2.0.

The first job is documenting OpenStage Author in a book. The design is in the OpenExplainer Design Spec and the
build order is in the OpenExplainer Build To-Do List (both Docs files owned by Jason). Anything not in the spec is agreed
with Jason first.

Read `docs/HANDOFF.md` first if you are starting a new session. Read `docs/format-spec.md` before touching anything that reads or writes a project.

## What this is

Still images only. No video recording. The printed book (PDF and Word) is the main output. Help site, JSON with images,
and Markdown come after. Short step-by-step guides are a second output. AI help is optional and everything must work
by hand with no AI.

## Separate from OpenStage

OpenExplainer is a standalone product with its own repository, build and run. It ships nothing from OpenStage.
OpenStage or OpenScreen code is copied only when Claude judges it useful, and each piece is credited in `NOTICE`.
It may join the same product suite later, but not now.

## Non-negotiable rules

### Accessibility

- The editor itself must be fully keyboard operable and usable with a screen reader. A feature that is not is not finished.
- Never introduce a keyboard trap. Every dialog and panel closes by keyboard alone.
- Status is never shown by color alone. Use words or symbols as well.
- The contrast checker is always on and only warns. It never blocks, because bad contrast may be deliberate.
- The accessibility check before export is optional, never required.
- Say so in the summary of any change that could affect keyboard access, focus order or screen reader output.

### Architecture

- TypeScript throughout, with a Tauri shell. Rust only where native Windows needs it: the capture helper, and one small part of the shell that asks the browser engine to print a page to a PDF (`src-tauri/src/pdf.rs`, agreed with Jason on 2026-10-21), and two small parts for the built-in AI model that need Windows: keeping its files and reading the PC's disk space and memory (`models.rs`), and starting and stopping the program that runs it (`llama.rs`).
- No Python in the product.
- Windows first, building for both ARM and x64.
- The capture helper is its own process, with a timeout, an always-visible Cancel, and it never captures itself.
- A project is saved as ONE file named after the project (`Name.openexplainer`, a zip package of JSON files plus an images folder), with a version number and migrations. Every format change bumps the version, ships a migration, and updates `docs/format-spec.md` in the same commit.
- Annotation shapes and click positions are stored beside the picture, never burned in.
- Callout letters belong to pictures. Numbers belong to procedure steps.

### Licensing

This project is Apache 2.0. Permissive licences (MIT, BSD, Apache 2.0, ISC) are fine. LGPL is dynamic linking only.
GPL and AGPL are refused. Open model weights are audited one by one before bundling or downloading.
Run `Check Licences.bat` before adding or updating any dependency. Record anything adopted in `NOTICE`.
No code, assets or proprietary specifics are copied from a step-by-step screen capturing program, a step-guide program, a screen capture program or an eLearning authoring suite.

### AI

- Optional. Built-in local Qwen 3.5 by default, downloaded during first install with progress, resume and cancel.
- Or the author's own ChatGPT, Claude or Gemini key. Keys are stored locally and never sent anywhere else.
- The MCP server (`openexplainer.exe --mcp`, the app with no window) lets an AI assistant make a project, capture windows and clicks, write pages, build the index and run exports with nobody at the keyboard. It is off until the
  author turns it on, works only inside the folder the author names, and captures one window at a time unless the author allows more (`docs/mcp.md`).

## Working style

- Explain what changed in plain language. Do not assume familiarity with JavaScript tooling.
- Anything that needs running is delivered as a double-clickable script, not terminal commands to copy.
- Avoid em dashes in prose written for this project.
- When a decision could reasonably go either way, say so and ask rather than picking silently.
