# The installer and the installed program

First built and tried on 2026-10-23 (Windows 11 Home, x64). Before this the program had only ever been run as a development build.

## Making and trying an installer

Double-click, in this order:

1. `Build Installer.bat`: builds the capture helper, then the release program and a per-user installer (NSIS), `src-tauri/target/release/bundle/nsis/OpenExplainer_0.1.0_x64-setup.exe` (about 12 MB). It fetches the AI program first if it is missing (`Get AI Runtime.bat`).
   The first build needs the internet: Tauri downloads the NSIS tool and one plug-in from GitHub (about 2 MB, checked by hash).
2. Run the installer. It installs for the person who runs it, with no administrator rights, into `%LOCALAPPDATA%\OpenExplainer`, and adds a Start menu entry, a desktop shortcut and an entry in Add or Remove Programs. `OpenExplainer_..._x64-setup.exe /S` does the same without asking anything.
3. `Test Installed App.bat`: starts the installed program and uses it the way a person would (see below). Do not touch the mouse or keyboard while it runs.

What is inside the installer: the program, the capture helper (`openexplainer-capture.exe`, beside the program), the AI program (`llama\`, with its own licences), `LICENSE.txt` and `NOTICE.txt`. The AI model (2.7 GB) is not inside: it downloads when the author turns the built-in model on.
A bare `cargo build --release` is not a release program: it still loads its pages from the development server. Use `npm run tauri -- build` (or `-- build --no-bundle` for the program without an installer).

## What was tried on the installed program, and how it went

- **Install and uninstall (silent).** Installs in a few seconds. Everything is where it should be (see above). Uninstalling removes the program folder, both shortcuts and the Add or Remove Programs entry. It leaves the author's data alone (`%LOCALAPPDATA%\org.openexplainer.app`: the downloaded model, the browser engine's profile, the AI program's log), which is right for the model; the interactive uninstaller offers to delete it.
- **Smoke test of the installed program** (`tools/release-smoke.mjs`, run by `Test Installed App.bat`): it starts and shows the whole editor; the helper, the AI program and the licences are in the install folder; a chapter, a topic, a paragraph and a numbered procedure can be made; the Capture dialog lists the open windows (this proves the helper starts from the install folder);
  the print, help site and guide previews show; the Variables, Writing style, Check the book, Drafts, Index, Guides, AI help, MCP access and Export dialogs open and close with Escape; the book check answers; AI help sees the downloaded model and **Test the AI answers from the installed AI program (about 7 seconds)**; nothing reached the page's error log.
- **The MCP check against the installed program** (`OPENEXPLAINER_EXE=... node tools/mcp-e2e.mjs`): all of it passes, including a real PDF, Word, help site, JSON and Markdown export and the guides.
- **An upgrade install over an existing install** went through: the program file was replaced, the 32 files are all there, there is still one Add or Remove Programs entry, and the smoke test and the MCP check passed on the upgraded copy.
- **The test copy was uninstalled again afterwards**; the model (2,740,937,888 bytes) was still in place. The installer is at `src-tauri/target/release/bundle/nsis/` for anyone to run.

## What was found

- **Fixed: the installer did not include the capture helper.** The program looks for `openexplainer-capture.exe` beside itself, and nothing put it there, so an installed copy would have had no Capture at all. It is now a bundled resource (`src-tauri/tauri.conf.json`), so the helper must be built before the program is: `Run OpenExplainer.bat` and `Build Installer.bat` both do that. (A development build would not have shown this: it finds the helper in the project's build folder.)
- **Settings made for the installer:** NSIS only, per-user, the licence and notices installed with the program. The Windows publisher shows as "openexplainer" in Add or Remove Programs until a publisher name is set.
- **The real AI server ends about 25 seconds after OpenExplainer is closed or killed, not at once.** `llama-server.exe` is a launcher that starts the real server; OpenExplainer ties the launcher to a Windows job so it dies with OpenExplainer (that works), but the real server is not reachable by OpenExplainer: Windows refuses every request to open it (even "query limited" from a separate PowerShell), so it cannot be added to the job or ended by OpenExplainer.
  It ends by itself about 25 seconds later (it was timed four times, 21 to 26 seconds). Until then it holds about 2 GB of memory. Nothing is harmed. A try to also tie what the launcher starts was made and gave up for this reason (documented here so it is not tried again the same way). A real fix needs a change in llama.cpp's launcher or another way to start it.
- **Opening a project by double-clicking it (added 2026-10-23, after the first installer).** The installer now registers `.openexplainer` for the person who installs it (`bundle.fileAssociations` in `tauri.conf.json`), and the program reads the project's file name from its command line (`src-tauri/src/launch.rs`), lets itself read and save that one file, and opens it at start-up. A second double-click while the program is open starts another copy of the program with that project, the same as MCP mode already runs beside the window; there is no single-instance plug-in, so no new dependency. Before this a project could only be opened with the Open button.
- **The program's identifier `org.openexplainer.app` ends in `.app`**, which Tauri warns about for macOS. Changing it would move the author's data folder (and the 2.7 GB model), so it is left alone for now.

## Not tried yet

- The interactive installer wizard (only the silent install was run), and an installation on a clean PC or a second Windows user account. This PC is Windows 11 Home, which has no Windows Sandbox.
- Saving and opening a project through the native dialogs of the installed program (the development build was tried; the dialogs are the same code).
- A screen reader on the installed program. Windows with a display scale above 100 percent, other monitor layouts, and capturing real programs other than a made-up window.
- Windows on ARM: the Rust ARM target is not installed here, the AI program would need its ARM download and the capture helper an ARM build.
- Code signing: the installer is unsigned, so Windows SmartScreen will warn when it is run. A certificate is a decision for the author.
- Windows 10 without the WebView2 runtime: the installer would download it (it needs the internet then).
