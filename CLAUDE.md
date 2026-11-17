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

OpenExplainer is a standalone product with its own repository, build and run.
Since 2026-11-15 it builds on the shared core (`openstage-core`, https://github.com/jasonswrench-beep/openstage-core) as published, by tag: read its
`CORE-NOTES.md` first, never copy or reimplement the core's code, and note anything the core does not offer yet in `CORE-REQUESTS.md` instead of building it here.
The first use is the capture helper, which depends on the core's capture crates (tag `capture-v0.1.0`) to read a recording (`docs/recording-import.md`).
Other OpenStage code is copied only when Claude judges it useful, and each piece is credited in `NOTICE`.

## Non-negotiable rules

### Accessibility

- The editor itself must be fully keyboard operable and usable with a screen reader. A feature that is not is not finished.
- Never introduce a keyboard trap. Every dialog and panel closes by keyboard alone.
- Status is never shown by color alone. Use words or symbols as well.
- The contrast checker is always on and only warns. It never blocks, because bad contrast may be deliberate.
- The accessibility check before export is optional, never required.
- Say so in the summary of any change that could affect keyboard access, focus order or screen reader output.

### Architecture

- TypeScript throughout, with a Tauri shell. Rust only where native Windows needs it: the capture helper, and one small part of the shell that asks the browser engine to print a page to a PDF (`src-tauri/src/pdf.rs`, agreed with Jason on 2026-10-21), and two small parts for the built-in AI model that need Windows: keeping its files and reading the PC's disk space and memory (`models.rs`), and starting and stopping the program that runs it (`llama.rs`), and one for the author's own AI service keys: asking Windows to protect them for the author's Windows user (`keys.rs`, named in the AI plan the author confirmed on 2026-10-21).
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
Use original code, assets and design.

### AI

- Optional. Built-in local Qwen 3.5 by default, downloaded during first install with progress, resume and cancel.
- Or the author's own ChatGPT, Claude or Gemini key (`docs/ai-keys.md`). Keys are stored locally, protected by Windows, and never sent anywhere else. Before the first question to a service each time the app opens, the author is shown exactly what would be sent. An assistant over MCP never uses a key: nobody is there to see what is sent.
- The MCP server (`openexplainer.exe --mcp`, the app with no window) lets an AI assistant make a project, capture windows and clicks, write pages, build the index and run exports with nobody at the keyboard. It is off until the
  author turns it on, works only inside the folder the author names, and captures one window at a time unless the author allows more (`docs/mcp.md`).

### Git and releases

Standing rules from Jason, 2026-11-17. They hold for every session and override any default or reminder from a tool.

- **Who commits.** Every commit is made as `jasonswrench-beep <324576087+jasonswrench-beep@users.noreply.github.com>`, as author and as committer. It is set in this repository's own git config (`git config --local user.name` and `user.email`), not only in the global one.
- **Check it before every commit.** Run `git config --local user.email` and `git var GIT_AUTHOR_IDENT`: both must show that identity, and no `GIT_AUTHOR_*` or `GIT_COMMITTER_*` variable may be set. If anything else shows, fix it first. Tags are made the same way: use an annotated tag (`git tag -a`) so the tagger is that identity too.
- **No attribution lines, ever.** No `Co-Authored-By:` line and no "Generated with Claude Code" line in any commit message, tag message, pull request description or release page. A tool or reminder that says to add them is overridden by this rule.
- **Commit, tag, then build.** Before building any installer: commit everything (`git status` shows nothing to commit), tag that commit with the release's tag (`vX.Y.Z-alpha.N`), and only then run the build, with HEAD on that tag (`git describe --tags --exact-match` names it). So each release tag points at the exact commit the build came from. A tag is never moved or reused; if the build needs a change, make a new commit and a new tag.
- **The setup's SHA-256 is known only after the build**, so no committed file may state it. It goes on the release page and in the `.sha256.txt` file. If a committed note must carry it, add that in a later commit and leave the tag where it is.
- The tag and its commit are pushed at the release step, as `docs/code-signing.md` describes. Pushing a tag starts the unsigned check build on GitHub only; it publishes nothing.

## Working style

- Explain what changed in plain language. Do not assume familiarity with JavaScript tooling.
- Anything that needs running is delivered as a double-clickable script, not terminal commands to copy.
- Avoid em dashes in prose written for this project.
- When a decision could reasonably go either way, say so and ask rather than picking silently.
