# Checks only Jason can make

Written 2026-11-16, after the round of the OpenExplainer development list of 2026-11-15 (the work is on the branch `core-round-2026-11-16`, not pushed). Everything a program can check was checked by tests: TypeScript 629, capture helper 87 (one makes a real MP4 and cuts pictures out of it),
app shell 53. **What follows could not be checked from a build session**, in the order of the list. Nothing here is a known fault; each is something not yet tried. Tick a line when it has been done, and write what you saw beside it.

No project format changed in this round, so there is no migration to try and `docs/format-spec.md` is as it was.

## Item 1: Import a recording (`docs/recording-import.md`)

- [ ] **A first real recording with clicks.** Your recordings on the Desktop were made with interaction notes off, so none has a click log. Make a short one in OpenStage Recorder with interaction notes **on** (without keys is enough): a few clicks on named buttons and menus in a program with plain names (Notepad's File menu is a good one), one click in a text box, one double-click.
  Then in OpenExplainer: select a topic, **Insert, Import a recording...**, choose the `.capture` folder. Check that the window names the take and says how many clicks it found; that **Bring in the pictures** shows the same review list as a live capture; that each picture shows the screen *before* the click's effect (a menu not yet open); that the click circle lines up with what was clicked;
  that buttons and menu items keep their names and the text box keeps only "text box"; that the double-click is one step; and that **no window title** appears anywhere in the project.
- [ ] **Where the picture is taken from.** It is 100 milliseconds before the click. If a picture sometimes already shows the menu opened, or shows a hover you did not want, the number is wrong for this PC (`BEFORE_CLICK_MS` in `capture-helper/src/recording.rs`). Say which you prefer.
- [ ] **A recording of a region and of one window**, and **a screen set to 125 or 150 percent**: the click's place is worked out from the region's or window's corner and has only been tested with made-up numbers.
- [ ] **Keyboard and screen reader:** Windows' folder chooser, then the window (the take list, the summary line that is read aloud, the "how many clicks" box and its message when you type "many"). Escape and Cancel close it.
- [ ] **The `import_recording` tool** with a real assistant, with a recording in the MCP folder.
- [ ] **Decision: marker notes and typed keys.** The log also holds the notes you put in with a marker and the shortcuts you press (`Ctrl+S`). They could become steps ("Press Ctrl+S"). Do you want that?

## Item 2: Send to Studio and Author (`docs/send-to.md`)

- [ ] **File, Send a guide to Studio...**: it asks for the program, version, demo project and goal and makes `<guide>.studio-script.json`. Open it in OpenStage Studio's review and record it against the real program: does Studio find the controls by their role and name? Are the steps that were only spoken (text boxes, list items) the ones you expected?
- [ ] **Decision: sending to Author.** Author cannot receive still steps, so nothing was built. `CORE-REQUESTS.md` request 1 asks the core how still steps travel. Do you want that asked of the core now, or a smaller path (Author reads a guide's JSON export through its own assistant tools)?

## Item 3: the accessibility rules (C2) (`CORE-REQUESTS.md`, request 2)

- [ ] Nothing to check yet: the core's C2 does not exist, so nothing was run through it. When it does, the opt-in "turn chosen rules into publishing blockers" setting is **off unless you turn it on**; today every finding only warns and the check before export is optional. Please look at the rule list in request 2 and say if a rule is missing.
- [ ] The list's reason for this item ("contrast is the only check today") is out of date: the book check and the machine checks of the help site, e-book and PDF exist. Do you want the list corrected?

## Item 4: your own key, the assistant's draft tool, the picture model (`docs/ai-keys.md`)

- [ ] **A real key.** AI help, **My own key**, a service, a model, paste a key, **Save the key**, then **Test the AI**. The window "Send this to ...?" must show the words *before* anything is sent: press **Do not send** first (nothing should go out, and the test says so), then try again and press **Send**. Check the answer comes back. Do it for each service you use.
  OpenAI and Google have no model chosen for you (names change): type the one you use. Anthropic starts at `claude-sonnet-5-5`.
- [ ] **Does Anthropic's browser access work in the installed program?** The question is sent from the window with a header the service asks for (`anthropic-dangerous-direct-browser-access`). If the test says OpenExplainer "could not reach api.anthropic.com" with a good connection, that header or the program's security policy needs a second look.
- [ ] **The key is not readable.** The file is in `%LOCALAPPDATA%\org.openexplainer.app\keys\` (Windows may show it under the app's private store: see the memory note about AppData). Open it in Notepad: it must be unreadable. Do not paste its contents anywhere. Press **Remove the key** and check the file goes.
- [ ] **A draft with a key:** *Draft callout text* on a picture with an empty callout, with the key chosen. The "Send this to ...?" window shows the capture's words, not a picture. The draft appears under Drafts, "Written by the AI".
- [ ] **`draft_text` over MCP:** with AI help off you should get the facts back; with the built-in model downloaded (it is not on this PC) you should get drafts under Drafts; with a key chosen you should be told it is never used.
- [ ] **Decision: should an assistant ever be allowed to use your key?** Now it never is, because nobody can see what is sent.
- [ ] **Decision: the picture-reading model.** Read `docs/picture-model-decision.md` and pick A (words only), B (a test of a local picture reader first) or C. I recommend A now and B as a test.
- [ ] **A screen reader** on the My own key box, the Send window and the status line.

## Item 5: outside checks (`docs/outside-checks.md`)

- [ ] **Make the e-book** (Export, E-book) of a real book, then double-click **`Check EPUB.bat`**. It asks before downloading EPUBCheck (the W3C's checker, about 20 MB); type `yes`. Java 25 is on this PC; the script skips the old Java 8. Write the result here.
- [ ] **Make the PDF** (Export, PDF), install veraPDF (software.verapdf.org), and double-click **`Check PDF.bat`**. Open the same PDF in **PAC** (pdfua.foundation) too and note any difference.
- [ ] **A screen reader user** works through `docs/screen-reader-pass.md` with NVDA, including the windows added in this round: Import a recording, Send a guide to Studio, My own key, Send this to ...?. Results go in `docs/screen-reader-results.md`.

## Not from the list, but you should know

- [x] **The branch.** The work was fast-forwarded into `main` and pushed on 2026-11-16, and published as the signed pre-release **0.2.0 alpha 5** (`docs/release-notes-0.2.0-alpha.5.md`). Nobody has installed it by hand yet: install it once and look at **Insert**, **File** and AI help.
- [ ] **The line in your message about PrismQDA** (switch it to the core's `prismqda-stats` tag and drop its own copy) was not done here: this repository has no PrismQDA, and no PrismQDA folder is on this PC. It belongs to the PrismQDA session.
- [ ] **`CLAUDE.md` changed** in three places so it says what is now true: OpenExplainer builds on the shared core by tag (it used to say it ships nothing from OpenStage), the helper depends on the core's capture crates, and a third small Rust part keeps your AI keys (`keys.rs`, named in the AI plan you confirmed on 2026-10-21). Please read them.
- [ ] **A real run of the whole program.** The new windows were checked by tests and a type check and the front end builds, and the installed alpha 5 was then run by script on 2026-11-16 (the smoke test, rewritten to use the menus: 38 checks passed and the AI model step was skipped because the model is not downloaded; the MCP check: 29 passed; a menu check opened Import a recording's menu item, Send a guide to Studio and AI help, My own key, and Escape closed each). No person has used it yet: open it once and look at **Insert**, **File** and AI help. If **Help, About** shows alpha 4, the install I made went into the Claude app's private AppData store: run the setup yourself.
