# OpenExplainer 0.2.0 alpha 5

OpenExplainer is a free, open-source (Apache 2.0) Windows program for making still-image tutorials and how-to books from screen captures. Everything works by hand. The AI help (a small model that runs on your own PC) and the assistant access (MCP) are optional and off until you turn them on.

This is an **alpha**: the first release built on the shared OpenStage core. It can read a recording made by OpenStage Recorder or Author, send a guide to OpenStage Studio, and use your own AI service key if you choose to.

## Import a recording

- **Insert, Import a recording...** reads a recording folder (a `.capture` folder made by OpenStage Recorder or Author, with interaction notes on) and turns each click into a step: a picture of the screen just before the click, the place that was clicked, and a first callout. You choose the take and how many clicks to keep, and the pictures go through the same review list as a live capture.
- A button, menu or similar item keeps its name. A text box keeps only the words "text box". A window's title is never kept. Two clicks on the same button within half a second and a few pixels make one double-click step.
- The recording is read with the shared core's capture code, used as published (tag `capture-v0.1.0`). Nothing of it was copied.
- An assistant over MCP can do the same with the new `import_recording` tool, for a recording inside the folder you chose.

## Send a guide to Studio

- **File, Send a guide to Studio...** writes a script file for OpenStage Studio from a guide: one step for each step of the guide, with the item to click named by its role and name. A step with no click, or a click on an item with no kept name, becomes a spoken-only step, because Studio cannot click what it cannot name. The file passes Studio's own checker.
- An assistant can do the same with the new `export_studio_script` tool.
- Sending a guide to OpenStage Author is **not** built: Author has no way yet to receive still steps. It is a request to the shared core (`CORE-REQUESTS.md`).

## Your own AI key

- **AI help, My own key** lets you use your own OpenAI, Anthropic (Claude) or Google (Gemini) key instead of the built-in model. The key is protected by Windows for your Windows user, kept in its own file on your PC, and sent only to its own service. It never goes into a project or a log.
- **Before the first question to a service each time the program opens, a window shows exactly what would be sent and where, and it starts on "Do not send".** Nothing goes out until you press Send.
- The program's window may now reach `api.openai.com`, `api.anthropic.com` and `generativelanguage.googleapis.com`, and only for this, after you have saved a key, chosen that service and pressed Send.
- No model name is chosen for OpenAI or Google (names change): you type the one you use. Anthropic starts at `claude-sonnet-5-5`.
- An assistant over MCP **never** uses your key, because nobody is there to see what is sent. The new `draft_text` tool uses only the built-in model, and hands back the facts to write from when that model is not ready.

## Not in this release

- The accessibility rules from the shared core (the list's third item): the core does not have them yet. OpenExplainer's own book check and its checks of the help site, the e-book and the PDF are as they were.
- Whether the AI should read pictures: written up in `docs/picture-model-decision.md`, not decided.

## Signed

The setup file and every program inside it are signed by **Jason Wrench**, and every signature carries a timestamp. To see it: right-click the downloaded file, Properties, Digital Signatures. Windows SmartScreen may still warn on the first downloads of a new signer; if it does, choose **More info**, then **Run anyway**, but only if the file came from this page and its checksum matches.

## What is in this release

- `OpenExplainer-0.2.0-alpha.5-Setup.exe`: the installer for Windows on a 64-bit Intel or AMD PC. It installs for the person who runs it, with no administrator rights, and updates an installed copy in place, keeping your projects, your settings and a downloaded AI model. The built-in AI model (about 2.7 GB) is not in it.
- `OpenExplainer-0.2.0-alpha.5-Setup.exe.sha256.txt`: its SHA-256.

SHA-256 of the setup: `68dfc6120fa3833b62cd57252c743e97718dbb53bf5ca1057aecfc850adddebc`

The project format is still version 21, so a project moves between this and the earlier alphas freely.


## What has NOT been tried

- **Nobody has installed this release by hand**, and the program window was not opened for this release. The new windows were checked by tests and by the build only.
- **No real recording with clicks has been read.** The reader was tested by cutting pictures out of a video made in a test and by made-up click logs. A first recording from OpenStage Recorder with interaction notes on is the check to make. The picture is taken 100 milliseconds before a click; that number may need changing.
- **No real key has been tried**, with any of the three services. In particular, whether Anthropic's service answers a request from the program's window (it needs a special header) is not known.
- **A Studio script has not been recorded against a real program.**
- **No screen reader has been used** with Import a recording, Send a guide to Studio, My own key or the "Send this to" window.
- **No outside checker has been run** on an e-book or a PDF. `Check EPUB.bat` and `Check PDF.bat` (in the source, not in the installer) are ready and ask before downloading anything.
- Everything the earlier releases list as not tried still holds.
