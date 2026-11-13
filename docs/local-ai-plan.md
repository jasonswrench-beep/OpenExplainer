# Plan: the local AI (Step 7)

Written 2026-10-21, before any download and before any code. Jason said to begin with the plan in plain words and the
licence check on the exact files.

## Status

**Confirmed by Jason, 2026-10-21 (section 7):** Unsloth's Q4_K_M file; the runtime travels inside the installer; the model
downloads the first time the author turns the built-in model on; drafts and writing-style notes are stored in the project
(format version 14, part 4).

| Part | State |
| --- | --- |
| 1. Settings and the connector | **Built 2026-10-21.** See below. |
| 2. The model download | **Built and tried 2026-10-21**, first against a stand-in download site, then for real with Jason's yes (below). The model is on this PC. |
| 3. The runtime and Test the AI | **Built 2026-10-21 and tried with the real model.** See below. |
| 4. Draft callout sentences, the review list, format 14 | **Built 2026-10-21 and tried with the real model.** Jason confirmed the five points. See below. |
| 5. Draft a procedure from the clicks | **Built 2026-10-22 and tried with real clicks.** Jason confirmed the five points. See below. |
| 6. Chapter text, suggested boxes, a consistency check | Jason confirmed the five points 2026-10-22. **Part 6 is built (2026-10-22), as three steps committed one at a time:** 6a opener and summary (format 16), 6b suggested boxes, 6c consistency check and Words to avoid. 6a and 6b were tried with the real model; 6c uses no model. |
| 7 to 8 | Not started. |

### What part 1 is

- `src/ai/settings.ts`: the choice (`none`, `builtin`, `key`), which starts at `none`, and the sentence that says where AI help stands.
- `src/ai/model-info.ts`: the one pinned model (repository, commit, file, size, SHA-256, licence and its pinned text). A test checks that this table and
  section 5 of this plan name the same file, so they cannot drift apart.
- `src/ai/types.ts`, `local.ts`, `connector.ts`: one question ("ask") with the answer, or an error in words with a code. The built-in
  answerer talks to `llama-server` in its "chat completions" language, turns thinking off, takes thinking out of an answer, says when an
  answer was cut short, has a time limit and a cancel, and **refuses any address that is not this PC** (the "local stays local" guard).
- `src-tauri/src/ai.rs` and `config.rs`: the choice is kept in `ai.json` in the app's config folder (not in a project); an unknown choice is refused.
- `src/ai-dialog.ts` and the **AI help** toolbar button: the dialog with the three choices (your own key is switched off and says "Not built yet"),
  the model's facts in words, and its state ("Not downloaded."). Keyboard operable, Escape closes without keeping anything, status in words.
- Tests: `tests/ai.test.ts` (12) against `tests/fake-llama.ts`, a stand-in for `llama-server` that can misbehave on purpose; Rust test for the settings file;
  scenario `ai` in the real window.

### What part 2 is

- `src/ai/download.ts`: the downloader. Asks for the one pinned file in pieces of about 4 MB, saves each piece to a half-finished file, and at the end checks the file's SHA-256 against the pinned value. A file that does not match is
  deleted and the author told; only a matching file is ever kept, with a small note (`.verified.json`) that it passed, so the dialog does not have to check 2.7 GB every time it opens.
  **Pause** keeps what arrived. **Resume** (or a closed app, or a dropped connection) carries on from the saved size with a "Range" request. A lost connection is tried again three times (after 2, 5 and 15 seconds; a try that got
  somewhere starts the count again), then the download stops with the place it got to and Resume ready. **Cancel** deletes the partial file (after asking). A server that ignores the request for the rest is handled (the file is taken from the start),
  and so are a file of the wrong size, one that is longer than it should be, a missing file, a sign-in request, a full disk and a piece that would land in the wrong place.
- The licence text (11 KB, pinned and checked by its own SHA-256) is fetched before the model, kept beside it, and shown by **Show the licence text**. If it is not the one that was checked, nothing is downloaded.
- `src-tauri/src/models.rs`: the shell part. Keeps the files in `models` inside the app's data folder (`%LOCALAPPDATA%\org.openexplainer.app\models`), only ever touches files named after the one model file with fixed endings, refuses a piece that does not start
  exactly where the saved file ends, flushes and renames the finished file, works out the SHA-256 (with progress), and reads the free disk space and the memory of the PC. The `sha2` crate was already in Tauri's build tools; the licence check passed before and after.
- `src/ai-dialog.ts`: Download, Resume, Pause, Cancel, Check the file, Delete the model and Show the licence text, a progress bar with the numbers in words and an estimate of the time left, and the facts about this PC in words. Disk space that cannot
  possibly hold the file stops the download (it says so with the numbers); little memory only warns. The keyboard moves to the button that takes the place of the one just pressed. Progress is announced to a screen reader at every tenth part and
  when something changes, not continuously. The download belongs to the app, so it carries on when the dialog is closed, and the main window says when it ends.
- Tests: `tests/ai-download.test.ts` (16) against `tests/fake-hub.ts` (a stand-in for the Hugging Face site with its redirect and Range answers, and ways to misbehave) and `tests/fake-model-files.ts`; 5 Rust tests for the file rules and the SHA-256;
  scenario `aidownload` in the real window (against the stand-in site, with the data folder pointed at a scratch folder by `OPENEXPLAINER_DATA_DIR`, which a development build honours).
- Checked against the real site with **headers only** (no model data): the address answers any web page's origin and redirects to a second address, which allows any origin, supports "Range" (answers 206 with a Content-Range) and exposes the headers
  the downloader reads. So a download straight from the app's page works. The second address is signed and expires after about an hour; every retry starts again from the first address, so a long or paused download is fine.
- **The first real download, 2026-10-21 (Jason said yes), in the dev app with the normal data folder** (`%LOCALAPPDATA%\org.openexplainer.app\models`): 2,740,937,888 bytes in about 50 seconds from
  Hugging Face in one request with no retry (35 to 69 MB a second by the growth of the file on disk, about 55 on average). The check at the end worked out the pinned SHA-256 and the file was accepted; Windows' own
  `Get-FileHash` gave the same fingerprint independently, and the licence copy matched its pinned fingerprint too. Nothing odd happened: no warning from the PC, no stalled progress, and the words ("Downloading: 1.3 GB of 2.7 GB (46%).
  About a minute left.", then "Checking that the file is the right one: 54%.") read as intended. One thing found: the check took 57 seconds because a development build does not optimise anything; with the `sha2` crate optimised
  even in development builds (a three-line change in `src-tauri/Cargo.toml`) it takes 2.4 seconds, in line with Windows' own 3.3 seconds. A release build was always fast.
  A freshly started app showed "Ready." for the model from the files and the note alone.
- **Resume against the real site, also 2026-10-21:** the half-finished file was made 5 MB short, and Resume made exactly one request, `Range: bytes=2735937888-`, through the real redirect to the signed second address, fetched the last
  5 MB, checked the whole file and finished in 3.4 seconds. The result was byte for byte the same file (matched the pinned fingerprint and the earlier copy).
- Not tried: the speed on a slow connection; a pause and resume in the middle of a long real download (the 5 MB resume used the same code); an antivirus program scanning the file as it grows (none interfered here); what happens when the PC
  sleeps mid-download; the signed address expiring during one very long download (every retry starts again from the first address, so it should cope).

### What part 3 is

- **The program**: llama.cpp's `llama-server`, build b11803 (MIT; updated on 2026-11-13 to b12359, see 5.2), pinned in `tools/ai-runtime.json` with the SHA-256 of both zips (they matched GitHub's published fingerprints). `Get AI Runtime.bat` (`tools/get-ai-runtime.mjs`) downloads the zip for this
  PC's kind of processor (or `x64` / `arm64` on the command line), checks the size and fingerprint, keeps only what the server needs (23 files, 45 MB unpacked for x64; the zip also holds benchmarking, quantizing and speech tools that are left out),
  adds the licence texts (also pinned), and puts them in `src-tauri/runtime/llama`. That folder is not in git (a note, `README.txt`, keeps it there) and is listed in `bundle.resources` of `src-tauri/tauri.conf.json`, so the installer carries it as a `llama` folder;
  a build copies it beside the program (checked: `target/release/llama` has all of it). The ARM64 zip was downloaded and its contents read, but nothing of it can be run on this PC.
- **The read-through of the zip** (section 5.2 said this was still to do): 52 files for x64 and 38 for ARM64; none is code-signed; the only licence file inside is the LLVM OpenMP one (Apache 2.0 with LLVM exceptions), so the llama.cpp MIT
  licence and nlohmann/json's are fetched from the repository at the same build, pinned, and copied beside the program. llama.cpp's own README lists what else is built in: cpp-httplib (MIT), stb, miniaudio and subprocess.h (public domain), plus small
  hashing code (public domain and BSD). All are permissive and `NOTICE` lists them.
- **`src-tauri/src/llama.rs`**: finds the program (beside OpenExplainer: `llama` in the resource folder or next to the exe; a development build also honours `OPENEXPLAINER_LLAMA_DIR` and the project's `src-tauri/runtime/llama`), starts it hidden with
  `--host 127.0.0.1`, a free port, `--api-key <fresh password>`, `--no-webui --no-slots --parallel 1 --reasoning off --cache-ram 256 --cors-headers authorization,content-type`, a context size and a thread count, writes its log to `llama-server.log` in the app's
  data folder, waits until it answers (up to 3 minutes) and says where it is. Starting it again while it runs with the same model hands back the same place. **It is tied to OpenExplainer with a Windows job, so it ends when OpenExplainer ends, even if
  OpenExplainer is killed outright** (tried).
- **`src/ai/runtime.ts`, `app.ts`**: starts the program the first time something is asked of the built-in model, shares it, stops it after ten minutes of nothing, stops it if the author cancels while it is loading, never starts it for a model that is not there and
  checked, and makes the password (32 random letters and digits). The connector now starts a program that has gone away once more before giving up. Threads are half the processor's, between 2 and 8 (a real test below).
- **Test the AI** in the AI help dialog: asks the model for one short sentence and shows it with the time it took ("The built-in model answered in 5.1 seconds: ... This was only a test; nothing was saved."). If No AI is chosen it says to choose the built-in model
  first and puts the keyboard on that choice. **Stop the test** appears with the keyboard on it while the model loads; closing the dialog also stops the test. The keyboard goes back to Test when it ends.
- **The page's security policy** (`app.security.csp`) now allows the page to reach the model site (`https://huggingface.co` and `https://*.hf.co`, where it is sent on to) and `http://127.0.0.1:*` (the model's program), and nothing else. This
  also fixes part 2 for the installed program: the policy had no `connect-src`, so a release build would have refused the download. Development builds do not apply the policy, which is why it was not seen before. Tried in a release build.
- Tests: `tests/ai-runtime.test.ts` (8) with the fake program; 4 Rust tests (the options, the password rule, a free port and the health check, the end of a log); scenarios `aitest` (the real model, the real program, in the real window) and `aikill`; a release-build
  check (`real_release.mjs`, scratch) of the policy and Test the AI.

**What the real program showed (this PC: 24 cores, 32 threads):**

- The model loads in about 13 seconds the first time (cold disk) and 2 to 3 seconds after that; the program uses about 4.3 GB of memory with an 8192-token context.
- It writes about 10 to 12 words (tokens) a second whatever the thread count (4 to 24 tried; 8 was best at 12): speed is limited by how fast memory can be read, not by the processor's cores. A one-sentence test takes 2 to 5 seconds, a four-step procedure about 5 seconds.
  A modest laptop will be slower, perhaps half as fast; this is a guess.
- Thinking is off two ways (the program's `--reasoning off` and `chat_template_kwargs: {"enable_thinking": false}` in each request); with thinking on, the model spends its whole allowance thinking and returns an empty answer, which the connector reports as unusable.
- Its answers use `**bold**` for control names, which is the same mark the editor uses. No password gives 401 and `/health` needs none. The web page at `/` is off (404). The slot list is off (501).
- Until the model is loaded the program does not listen at all (a connection is refused, not a 503), so the app waits by trying `/health`.
- The page may call it: the preflight shows `Access-Control-Allow-Headers: *`, which browsers do not accept for the `Authorization` header, so the program is started with `--cors-headers authorization,content-type`. Tried in the dev app and a release build: it works.
- Windows briefly shows a second, empty `llama-server.exe` (no command line, no threads, the same memory) a few seconds after the model loads. It disappears by itself within a minute and holds no port; it looks like a memory snapshot taken by Windows security software.
  The tests count only processes that have their options.
- **Not tried:** the program on an ARM64 PC; a PC with much less memory (the program would likely fail to load and say why in its log; the dialog only warns); an installer (none exists yet); security software that might quarantine unsigned DLLs; speed on an ordinary laptop.

### What part 4 is

Built as planned below; Jason confirmed the five points (words only, `drafts.json`, accept or reject each one with no accept-all, the button places, no name drafting).

- **Format 14**: `project.writingStyle` and `drafts.json`; `docs/format-spec.md` "AI drafts and writing style"; a version 13 project opens with neither. `src/project/drafts.ts` holds the rules (clean, add, list, accept, reject, count), `src/project/files.ts` and `migrate.ts` the saving and upgrading.
- **The drafting** (`src/ai/drafting.ts`): the clues for a callout (`cluesFor`), the thin-clues rule (`isRealName`), the messages for the model (`buildMessages`), the check of every answer (`checkSentence`), and the job (`draftCallouts`, one request per callout, Stop between and during, a
  report in plain words). The clues about the clicked item (kind, shortcut, access key, Windows' description) go only to the callout that is on that item; another callout on the picture gets its name and the picture's other names.
- **The screens**: `src/drafts-dialog.ts` (AI drafts: where it is, Now, an editable Draft sentence, a fold-out of what the AI was given, Accept, Reject, Go to the picture; the keyboard moves to the next entry; the number left is said in words; Escape closes),
  `src/drafting-ui.ts` (checks AI help is on with the built-in model ready, then a small window with Stop and a report), `src/style-dialog.ts` (Writing style, up to 2000 letters), and in `src/main.ts` the toolbar buttons **AI drafts (n waiting)** and **Writing style**,
  **Draft callout text** on each picture that has callouts, and **Draft callout text for this topic**. The book check lists each waiting draft as a note, and Go to opens the list.
- **Tests**: `tests/drafts.test.ts` (12: the rules, format 14 round trip, version 13 opens, damaged or mismatched file refused, never in the JSON export, the book check note), `tests/drafting.test.ts` (12: names, clues, thin clues, password box, the messages, the answer checks, the job with a fake model
  including bad answers, a problem, Stop, drafts already waiting, one picture); scenario `drafts` in the real window (28 checks, by keyboard, no model needed) and `draftreal` with the **real model**. A development build has a small hook (`__oe_test`, left out of a real build) so a test can put a made-up project into the window.
- **Real run (this PC, the real model, 2026-10-21)**: a click picture with five callouts (Save with its click details, Cancel, File name, one with no name, one called "Button1") and the style note "Speak to the reader as you. Say click for buttons. Keep sentences short."
  Three drafts in about 9 seconds including the model starting: "Clicking this Save button saves your current document using the keyboard shortcut Ctrl+S." / "Clicking Cancel stops saving your current file." / "Clicking this text box lets you type a name for your file."
  The two with nothing to go on were left alone and named in the report. Accepting the first made it the callout's sentence; the others stayed drafts. Stop in the middle ended the run and said so. The sentences are plausible but plain; a 4-billion-parameter model reading words only will not
  know what a control does beyond its name and what Windows said, so the author's review is the point. They vary a little from run to run.
- **Not tried**: drafting for a whole book at once (a topic is the largest unit); a long run on a slow PC; many callouts (the job is one request each, so 30 callouts is about a minute on this PC); the picture as a clue (not built, by decision); a screen reader pass.

### Part 4: the plan (2026-10-21, before any code)

**What the author will be able to do.** Capture clicks in a program as now. Each click picture already gets its first callout automatically (a marker on the clicked item, named from what Windows said, with the sentence empty).
Press **Draft callout text with AI** (on a picture, or on a whole topic) and the built-in model writes a one-sentence explanation for each callout that has none ("Click Save to keep your work in a file."). Nothing goes
into the book yet. The sentences wait in a list, **AI drafts**, where the author reads each one, can change the words, and presses **Accept** or **Reject**. Only an accepted sentence becomes the callout's real sentence. Until then it is not in
the editor's text, the previews, the book check or any export, because it is not stored where the text is.

**What I tried first (the real model, this PC, 2026-10-21).** I gave the built-in model seven made-up click notes with a rule sheet and a style note, and read what it wrote. Each took 1.3 to 3.4 seconds.
It writes fluent, short, correct-sounding sentences when the clues are good:

- Save button with Ctrl+S and "Saves the active document": "Click the Save button to store your current work file."
- Combo box named "Font size": "Choose a font size from this combo box to change your text appearance."
- Edit box named "Search" described as "Type the words to look for.": "Type the words you want to find in this search box."

But when the clues are thin it **makes things up instead of saying so**, even though it was told to answer NEEDS INFO: a pane with no name became "Choose the text in this pane to change its formatting", and a button named "Button1" became "Click Button1 to
print your document now." So the guard that stops a made-up sentence cannot be an instruction to the model. It is in code (below), and the author also sees what the model was given.

**How a draft is made (words only, nothing else).**

1. For each callout on the picture whose sentence is empty, the program collects the clues in words: the callout's name; if it is the callout made from the click, the clicked item's kind ("button", "menu item"), keyboard shortcut,
   access key and the description Windows gave; the names of the other callouts on the same picture; the sentences already written for them (so the new one matches); the topic's title and its chapter's title; and the project's writing-style notes.
   No picture, no typed text (a click capture never keeps any), and nothing at all for a password box.
2. **The thin-clues rule, in code**: a callout is drafted only if it has a real name (not empty, not just a number, not a placeholder such as "Button1", "pane" or "unknown") or Windows gave a description of at least three words.
   Otherwise no draft is made and the list says "Needs a name: there is nothing in the capture to write from." The program never asks the model to guess.
3. One request per callout, with a progress line ("Drafting 2 of 5") and a Stop button, so a slow PC can be stopped and nothing is half-written. On this PC about 2 seconds each.
4. **The answer is checked in code before it is kept**: one sentence, 3 to 30 words, no line breaks, no quotation marks, only the marks the editor knows (**bold** for a control name), and any bold control name in it must be a name from the capture
   (the callout's own or another callout's on the picture). A sentence that fails is thrown away and counted ("1 draft was thrown away because it mentioned a control that is not in the capture").
5. Each kept draft remembers what it was given and which model wrote it, and the review list shows both, so the author can judge whether the clues were enough.

**The review list (AI drafts).** A toolbar button **AI drafts** with the count in words ("AI drafts: 3 waiting"). It opens a list. Each entry says where it is ("1.2 Saving your work, picture 1, callout A: Save"), shows
**Now:** (the sentence there at the moment, or "nothing yet") and **Draft:** (an editable box with the sentence), has a fold-out "What the AI was given", and three buttons: **Accept**, **Reject** and **Go to the picture**. One at a time; there is no
"accept all", because the design says the author accepts or rejects each one. After Accept or Reject the keyboard moves to the next entry and the count is announced. Escape closes the list and gives the keyboard back to the button. A draft whose callout has
been deleted, or whose picture has gone, disappears by itself. If the author has written their own sentence since, the entry shows it under **Now:** so replacing it is a choice, not an accident. The book check gains one note, "N AI drafts are waiting for review".

**The writing-style notes.** A **Writing style** button beside Project variables opens a box (up to 2000 letters) for the project: the voice, the words to use ("Say click for buttons, choose for menu items"), how a step reads. The model reads it before every draft.
It is empty to begin with. It is stored in the project, so it travels with the book and with an MCP assistant.

**What changes in the saved project (format version 14).** `project.json` gains `writingStyle` (a text, left out when empty). A new file `drafts.json` holds the waiting drafts, `{ version, drafts }`, and exists only when there are drafts. A draft is
`{ id, kind, pictureId, calloutId, text, clues, madeAt, model }`; `kind` is `callout-sentence` now and leaves room for the procedure drafts of part 5. Cleaning, as for everything else: a draft for a callout or picture that is not there, with no text, or of an unknown kind is dropped,
text is cut to 300 letters, and only the newest draft for one callout is kept. Version 13 projects open unchanged (the migration only adds the empty values). `docs/format-spec.md` is updated in the same commit. **Drafts are never in an export**
(help site, JSON with images, Markdown, Word, PDF, guides): they are not part of the tree the exports read. The project file itself keeps them.

**Where the code goes.** `src/project/drafts.ts` (the rules: add, accept, reject, clean, list, count), `src/ai/drafting.ts` (the clues, the thin-clues rule, the messages for the model, the checks, the job), `src/drafts-dialog.ts` (the review list),
`src/style-dialog.ts` (writing style), buttons in `src/main.ts` and the picture list. All of the logic has no screen in it, so it is tried with a fake model.

**How I will try it.** Unit tests for the rules and the clues and checks (thin clues make no draft; a password box makes none; a made-up control name is thrown away; a long or two-sentence answer is thrown away), for drafting with the fake model (good answer, bad
answers, Stop in the middle), for format 14 (round trip, version 13 opens, drafts cleaned, never in an export, opened and saved by the MCP server without loss). In the real window: the review list by keyboard with drafts put in directly (Accept, Reject, edit then Accept, a deleted callout,
Tab with no trap, Escape), and once with the real model on a made-up click picture. The result is shown to Jason as real sentences before it is called done.

**What it will not do yet.** It does not look at the picture (see the first point below), does not write names (a thin name is "needs a name", not a guess), does not write procedures (part 5), and does not draft a whole book in one go (the MCP draft tool, part 8).

**Five points for Jason to confirm** (my defaults in bold):

1. **Words only for now.** The model Qwen 3.5 can also read pictures, but that needs a second download (about 672 MB) and is slower; I would add it later as an option that is off to begin with, and only for pictures the author chooses. **Yes, words only now.**
2. **Drafts live in their own file, `drafts.json`**, not beside each topic as the first outline said. It is simpler to list, to keep out of every export, and it leaves room for other kinds of draft. **Yes.**
3. **The author accepts or rejects each draft, can change its words first, and there is no "accept all".** **Yes.**
4. **The buttons**: Draft callout text on each picture and on each topic; AI drafts (with the count) and Writing style in the toolbar. **Yes.**
5. **Names are not drafted** when Windows gave none: they are marked "needs a name". **Yes.**

### What part 5 is

Built as planned below; Jason confirmed the five points (steps written by rules, the list renamed Drafts, one step per click picture with the name rules, Accept adds a procedure to the end of the page with format 15, and the model reading pictures as a separate later part).

- **The rules** (`src/project/procedure-draft.ts`, no screen and no AI; a test checks it imports nothing from `src/ai`): `stepFor` writes a step from a click picture's note, `controlName` finds the name (the author's callout on the clicked item first, then Windows' name), `planProcedure` picks the click pictures that are not already in a step
  on the page, in order, and `draftProcedure` puts the draft in the project (refusing, in words, if one is already waiting for the topic or there is nothing to make it from). `src/project/click-item.ts` now holds the two rules the sentences and the steps share (`isRealName`, `isClickItem`).
- **Format 15**: `drafts.json` gains the `procedure` kind (`docs/format-spec.md` "Drafts and writing style"). `acceptDraft` adds a numbered procedure block at the end of the topic's page, each step with its picture and control marks; the (possibly edited) words of every step are used, an empty step is refused in words.
- **The screens**: the button **Draft a procedure from the clicks** (in Pictures, on if the topic has a click picture) makes the draft at once and opens the list on it. The list is now **Drafts** (the toolbar button reads "Drafts (n waiting)"). A procedure entry says who made it ("Made by rules from the click notes, with no AI") and where it will go, shows each step in its own box
  labelled with its picture ("Step 2 (picture 2)"), what the step was made from, and "Needs your attention: ..." on a step with no name; Accept reads "Add the 3 steps to the page of ...". A sentence entry says "Written by the AI". The book check notes a waiting procedure draft.
- **A fault found and fixed on the way**: a project saved by an older program with page text could not be opened by a newer one ("the project files do not match each other"), because the page files were compared with the upgraded version instead of the version the project was saved with. It existed since pages were
  introduced and showed up when the format number moved. Fixed in `src/project/files.ts` and tested (`tests/procedure-draft.test.ts` opens projects saved as formats 5, 8, 12 and 14; the same fix makes a JSON export from an older version import). If any project of yours was refused with that message after 2026-10-21, it is fine in the file: open it again.
- **Tests**: `tests/procedure-draft.test.ts` (14: every kind of item, names, flags, password, special characters, the plan, drafting, accepting and refusing, cleaning, format 15 and old projects, the book check, no export, no AI); the older drafts tests follow the two kinds; scenarios `procedure` (the entry by keyboard, edit, Accept, Reject, both refusals, Tab, Go to) and `procedurereal`
  (real clicks on a made-up window).
- **Real run (real clicks on a made-up window, 2026-10-22)**: three clicks gave "1. Click [[Save]]. 2. Tick [[Remember me]]. 3. Click the window." The first two were named by the callouts made from the click (taken from Windows' names); the third, a click on the empty part of the window, has no name and is flagged. Accepting put one numbered
  procedure of three steps, each with its picture, at the end of the page.
- **Not tried**: a procedure of dozens of steps; a screen reader; the model writing or polishing steps (decided against, above) and the model reading the pictures (point 5, a separate optional part).

### Part 5: the plan (2026-10-22, before any code)

**What the author will be able to do.** Capture clicks in a program as now. Then press **Draft a procedure from the clicks** on the topic. A numbered procedure is proposed, one step for each click picture in the order they were taken, such as
"1. Choose File. 2. Choose Save as. 3. Click the File name box. 4. Click Save." with each step's picture attached and each control name marked the way the editor marks control names. It waits in the list of drafts, where the author can change the words of any step
and then presses **Accept**, which adds the numbered procedure to the end of the topic's page, or **Reject**.

**What I found by trying the real model first (2026-10-22).** I gave the built-in model six made-up clicks (a File menu item, Save as, the File name box, the Save as type list, Save, a check box) and the plain wording a rule would give for each, and asked for the step.
Four of the six came back word for word the same as the plain wording. One was made worse (it changed "Choose Save as" to "Click Save as" and added a purpose the clues did not give). One list step changed from "Open the list" to "Click the list". When I asked
for the whole procedure in one go, it **invented steps that were never captured**: "Type a name in File name" and "Select a type from Save as type". A click capture never records typing, so the model was guessing, and plausibly, which is the dangerous kind.
Reading only words, the model adds very little to a step that a rule can already write exactly.

So the plan is built around that: **the steps are written by rules from the click notes**, which are exact, instant and need no AI (the button works with AI help off), and the model is not asked to reword them. Where the model could really help is by *seeing* the picture
(to write what happens next, such as "The Save as window opens", and to name a control Windows would not name). That is a separate, optional part (see point 5).

**The rules for a step.** Each click picture of the topic that is not already in a step on its page gives one step, in the order of the pictures. The wording follows the kind of item that was clicked:

| Item | Step |
| --- | --- |
| button, or an unknown kind | Click [[Save]]. |
| menu item | Choose [[Save as...]]. |
| menu | Open the [[File]] menu. |
| check box | Tick [[Remember me]]. |
| radio button | Select [[Landscape]]. |
| combo box | Open the [[Save as type]] list. |
| text box | Click the [[File name]] box. |
| tab | Click the [[Layout]] tab. |
| link | Click the [[Learn more]] link. |
| list item, tree item | Select [[Report.docx]]. |
| a double-click, a right-click | Double-click [[Open]]. / Right-click [[Open]]. |
| a password box | Click the password box. |

**Where the control's name comes from.** First the name of the callout on that picture that sits on the clicked item (the author's own name for it, if they have changed it), then the name Windows gave. Windows keeps a name only for buttons, check boxes, combo boxes, menus,
menu items, radio buttons, sliders, spin boxes and split buttons (a privacy rule in the capture helper), so a text box, a link, a tab or a list item arrives with its kind only. A step with no name says what it can: "Click the text box." The review list flags those steps
("no name was available; type it in") so the author fills the name in. A click with neither a name nor a kind becomes "Click the item shown." and is flagged the same way.

**What it will not do.** It never writes about typing or keys that were pressed (a click capture does not record them; the author adds "Type a name" by hand), never writes the result lines ("The Format pane opens.") because it cannot know what happened, and never merges several clicks into one step
(a step holds one picture). Pictures that are not click pictures are left out, and so are click pictures that are already used in a step on the page.

**The review list.** The list becomes **Drafts** (the button reads "Drafts (n waiting)") because this kind of draft is not written by the AI, and every entry says who wrote it: "Written by rule from the click notes" or "Written by the built-in model". A procedure entry says
where it will go ("Will be added as a numbered procedure at the end of the page of 1.1 Saving your work"), and shows each step with its picture number in its own editable box, a line under each saying what it was made from ("Click on the button Save, access key Alt+S" or
"callout A: File name"), and a flag on steps with no name. The buttons are **Accept** (adds the procedure to the page, with each step's picture, and the draft goes), **Reject** and **Go to the topic**. The steps cannot be added to or removed in the list; the author does that in the editor after accepting.
If a draft is already waiting for the topic, drafting again says so and does nothing. The book check notes a waiting procedure draft like it does a sentence draft.

**What changes in the saved project (format version 15).** `drafts.json` gains a second kind of draft, `procedure`: `{ id, kind: "procedure", nodeId, steps, madeAt, by }`, where `steps` is a list of `{ pictureId, text, from, flag? }` (`text` is the step as the author types it, with `[[Control]]` marks;
`from` the plain line it was made from; `flag` set when the step has no name) and `by` is `"rule"` (or `"model"` if a later part writes one). A sentence draft keeps its shape. Cleaning, as before: a draft for a topic that is not there, with no steps, or whose pictures have gone is dropped; a step whose picture has gone is dropped;
steps are limited to 60, each at most 300 letters; only the newest draft for one topic is kept. Because a kind this program does not know would be dropped silently by an older copy, the version is bumped to 15 (a version 14 project upgrades unchanged), and `docs/format-spec.md` is updated in the same commit. Drafts are still in no export.

**Where the code goes.** `src/project/procedure-draft.ts` (the rules: which pictures, the wording by kind, where each name comes from, the flags; no screen, no AI), `src/project/drafts.ts` (the new kind: clean, accept into the page, list), `src/drafts-dialog.ts` (the procedure entry),
`src/main.ts` (the button on the topic and the rename to Drafts), tests, and the format spec.

**How I will try it.** Unit tests for every row of the table, the order, names from callouts before Windows' names, the flags, a password box, pictures already in a step, the draft's cleaning and round trip (and a version 14 project opening as 15), accepting into the page (the procedure block, each step's picture and marks, the page's other blocks untouched), and
that it works with AI help off. In the real window by keyboard: the button with no click pictures (says so), a real draft with several steps, editing a step, Accept (the page now has the procedure with its pictures), Reject, a second press while one waits. Then I show you the real steps from a real capture before calling it done.

**Five points for Jason to confirm** (my defaults in bold):

1. **The steps are written by rules, not by the model**, because the real try showed the model adds little from words alone, can make a step worse, and invents typing. The button works with AI help off. (The other ways: let the model reword each step with strict checks, which I tried and do not recommend; or go straight to the model reading the pictures, which is point 5.) **Rules.**
2. **The list is renamed Drafts**, with who wrote each one on every entry. **Yes.**
3. **One step per click picture, in order; names from the author's callouts first, then Windows' name where it is kept, else the kind only; no typing, no result lines; steps with no name are flagged.** **Yes.**
4. **Accept adds a new numbered procedure at the end of the topic's page, each step with its picture; format version 15.** **Yes.**
5. **The model reading the pictures is a separate, optional next part, not part of this one.** It would need a second download from the same Apache 2.0 repository (the picture reader, 672 MB, pinned like the model; I have its size and fingerprint), would only ever read pictures on this PC, and could write the result lines and name controls Windows leaves unnamed. It would be slower (each picture adds seconds on this PC, more on a laptop), and a 4-billion-parameter model's reading of small screen text is unproven, so I would try it on real captures and show you before building any screens. **Decide after you have seen this part.**

### What part 6a is

Built as planned below (Jason confirmed all five points of part 6); the first of three steps, committed on its own.

- **Format 16** (`docs/format-spec.md`, "Drafts and writing style"): `drafts.json` gains the `chapter-text` kind (`nodeId`, `role` opener or summary, `text`) and the `box` kind (`nodeId`, `boxKind`, `text`, `evidence`; used from 6b), and `project.json` gains `avoidWords` (used from 6c, `src/project/avoid-words.ts`). The box draft differs from the plan in one way: it keeps the evidence sentence and finds its block again when it is accepted,
  instead of storing a block number, so a page that was edited in between still works (the box goes to the end of the page if the sentence is gone). A version 15 project upgrades with an empty list.
- **The job** (`src/ai/chapter-text.ts`; no screen): `chapterMaterial` picks what the model reads (for an opener the chapter's own text and all its topics; for a summary the chapter's topics except the one that is to hold it; long topics are cut at the end of a sentence to fit about 7000 letters), `buildChapterMessages` writes the question,
  `checkProse` decides whether the answer may be kept, `draftChapterText` makes at most one draft after at most two tries. `src/project/page-text.ts` turns a topic's page into plain words for the model (steps as "Steps: 1. ... 2. ...").
- **The checks in code**: plain sentences only (an opener of 2 or 3 sentences up to 70 words, a summary of 3 to 5 up to 120 words, at least 8 words), no quotation marks, list, paragraph break or formatting, no capitalised word in mid-sentence that is not in the chapter's text, its titles or the style notes, and a summary may not say
  "you will learn", "this chapter", "in conclusion", "in summary" or "to summarize" (the model's habit when it is asked for a summary in the wrong words, below).
- **The screens**: two buttons above the page editor, **Draft an opener for this chapter** and **Draft a chapter summary here**, on when something is selected. On a topic the opener button says to select a chapter; on a chapter the summary button says to make a Summary topic. Each opens the same small window as the other drafting jobs (progress, Stop, Escape stops, a report in words, Open Drafts).
  A draft with nothing to work from says so before it starts. **Drafts** shows the entry with "Written by the AI", where it will go ("Will be added as the first paragraph of the page of 1 Working with documents"), an editable box and a fold-out of what the AI was given; Accept reads "Add the opener to the top of the page of ..." or "Add the summary to the end of the page of ...".
- **Tests**: `tests/chapter-text.test.ts` (9: the material, what the model is asked, every refusal, the job, the two tries, being stopped, no change to the book) and `tests/drafts16.test.ts` (10: format 16 and a version 15 project opening, the two new kinds cleaned, accepted into the page, the entry order, the avoid-word list, the book check note, no export);
  scenarios `chapters` (by keyboard with a stand-in model) and `chapterreal` (the real model).
- **Real run (real model, a made-up chapter "Working with documents" with the topics Saving your work, Printing a page and Closing the program, 2026-10-22).** The first wordings ("restate the key points") made a summary that read as a second introduction ("You will learn how to..."). Trying several wordings on the real model, the ones that worked best were: for the opener, naming the tasks the topics teach and not describing the steps; for the summary, one fact from the text in each sentence, in the present tense.
  With those two wordings, two runs each (about 10 s for an opener, 8 to 13 s for a summary on this PC):
  - Opener, run 1: "After this chapter, you will be able to save your work, print a page, and close the program. You can keep multiple versions of your file by using Save as, select your printer and copy count in the Print window, and safely exit the application while managing unsaved changes." (The first sentence is right; the second describes how, which it was asked not to do, and says "file" and "application". It needs a reader, or a Words to avoid list in 6c.)
  - Opener, run 2: "After this chapter, you will be able to save your work, print a page, and close the program. You will learn how to choose File menu items and click buttons to complete these tasks." (True, and plain.)
  - Summary, run 1: "Saving over a document replaces it, so use Save as to keep both versions. You can select your printer and copy count in the Print window before sending the page. Printing a long document may take a few minutes. Closing the program with the X button asks if you want to save unsaved changes, and choosing Do not save loses those changes." (Every sentence is a fact the text states.)
  - Summary, run 2: "You choose File menu items and click buttons to save, print, or close the program. Saving over an existing file replaces it, so you use Save as to keep both versions. You choose Print to send a page to your printer and can pick the printer and number of copies in the window. Printing a long document takes a few minutes, and you must click OK after choosing Print. The X button closes the program, but if you have unsaved changes, you lose them if you choose Do not save." (The facts are in the text, but "you must click OK" turns a step into a rule; it is a draft for a reader to judge.)
  Accepting the opener put it first on the chapter's page and the summary at the end of the Summary topic's page. Nothing was added to the book without Accept.
- **Not tried**: a chapter of dozens of topics (the material is cut, and the entry says so in its "given" lines); a screen reader; a different model.

### What part 6b is

Built as planned below; the second of three steps, committed on its own. No format change (the `box` draft kind came with format 16 in 6a).

- **The job** (`src/ai/boxes.ts`; no screen): `topicMaterial` gives the model one topic's words and finds the sentences of its paragraphs a box could rest on (5 to 60 words; not steps, headings or boxes), `buildBoxMessages` writes the question, `checkBoxes` decides which boxes may be kept, `draftBoxes` makes the drafts after at most two tries.
  The model is asked for JSON in an exact shape (a new `jsonSchema` option on the question, sent to the model program as `response_format`; the real server returned valid JSON every time, and the program checks it again). `evidence` comes first in each box so the model copies the sentence before it writes the note.
- **The checks in code**: the evidence must be one whole sentence of a paragraph of the topic, word for word (white space aside), so a box cannot be made up; it must not already be inside a box on the page; the note is one or two plain sentences of 4 to 45 words with no quotation marks, that do not just repeat the evidence, and with no
  capitalised word in mid-sentence that is not in the topic, its title or the style notes; the same sentence is suggested once; at most three, in page order; a sentence that already has a suggestion waiting is not suggested again.
- **The kind of box**: a rule makes it a **Caution** when the sentence or the note says work can be lost, replaced, overwritten or deleted, or cannot be undone (`warnsOfLoss`). Otherwise the model's kind is a starting choice, except that a Caution the rule does not back starts as a **Design Tip**, because the real model called nearly every sentence a Caution
  ("Printing a long document can take a few minutes"). The entry in Drafts says which it was ("because the sentence says work can be lost or replaced (a rule, not the model)", "the model's suggestion", or "The model said Caution, but the sentence does not say work can be lost, so it starts as Design Tip") and the author chooses the kind in the list.
- **The screens**: the button **Suggest boxed notes for this topic** above the page editor. It says why first if it cannot go ahead (suggestions already waiting for the topic, no paragraph text to rest on, AI help off or the model not on this PC), then opens the same small window as the other jobs. In Drafts each suggestion says **Suggested**, shows the sentence it rests on and where the box will go (right after the block that holds it),
  has a kind menu and an editable box; Accept reads "Add this box to the page of ...". These entries and their Accept came with 6a and are unchanged.
- **Tests**: `tests/boxes.test.ts` (11: the loss rule, the sentences a box can rest on, what is possible, the message, a good answer, every refusal, well-formedness and the limit of three, the job, two tries, an honest empty answer, a stop, duplicates) and an added check in `tests/ai.test.ts` that the schema reaches the model program as asked and nowhere else; scenario `chapters` now also checks the three refusals of the button
  (a suggestion waiting, AI off, no paragraphs), and `boxesreal` runs the real model.
- **Real run (real model, the made-up chapter "Working with documents", 2026-10-22).** The first wording ("say what the evidence says in the way that helps the reader most") let the model add things the topic never says: for "Printing a long document can take a few minutes." it wrote "Do not worry if your screen goes blank; the printer is likely still working in the background." The wording now asks for the sentence said again in other words, adding nothing, with two small examples.
  With it, two full runs of three topics each (6 to 16 s a topic on this PC):
  - Saving your work, both runs: "Overwriting a file with Save deletes the old version, so choose Save as to keep both copies." resting on "Saving over an existing file replaces it, so use Save as to keep both versions." Kind: Caution, by the rule. ("deletes" is a little stronger than "replaces".)
  - Printing a page, run 1: "Your printer may need several minutes to finish printing a long document." (Design Tip; the model said Caution) and "You can select which printer to use and how many copies to print from this window." (Design Tip). Run 2: the first of those only.
  - Closing the program, run 1: "Choosing Do not save causes your unsaved changes to disappear." Run 2: "...to be lost." Both Caution, by the rule, resting on "If you choose Do not save, those changes are lost."
  Accepting the first suggestion of each topic put a box of the chosen kind right after the paragraph it rests on (`paragraph, callout:caution, procedure`). Nothing was added to a page without Accept.
- **Not tried**: a topic with dozens of paragraphs (the text given to the model is cut at about 6000 letters and the entry says so); a topic where the model finds nothing (tested with a stand-in model only).

### What part 6c is

Built as planned below; the third of three steps, committed on its own. No AI and no format change (`avoidWords` came with format 16 in 6a). Everything works with AI help off.

- **The rules** (`src/project/consistency.ts`; no screen, no AI, a test checks the notes are exact): three new notes in the book check, worked out from the book every time and never stored, each ignorable like the others (they are notes, not problems, so a book can be exported with them):
  1. **A control written differently from the name the program showed.** For each control named between double square brackets in a paragraph, a box, a step or a result line, the book's click pictures are searched for a control with the same name (capitals, a closing "..." or colon and the access-key mark & aside). If the program showed
     "Save as..." and the page says [[Save as]], the note says: `Block 1 (paragraph) of "1.1 Saving your work" writes the control as "Save as", but the program showed "Save as..." when it was clicked.` A control the book has no click picture of is never judged, and a name that matches one of the names the program showed is right.
  2. **A step whose first word does not suit the kind of control.** `SUITS` lists, for each kind of item (button, menu item, check box and so on), the action verbs that suit it; the first is the one the Drafts procedure writes (a test keeps the two in step). A step that starts with another action verb (click, choose, select, press, tick, check, open, tap, hit, push, pick) for a control whose kind the book knows without doubt is a note: `Step 1 of block 2 (procedure) of "1.1 Saving your work" starts with "Press" for the button "OK". The usual word for a button is "Click".`
     The kind comes from the click pictures with that control name, or from the step's own click picture; a name the book knows under two kinds is not judged. "Double-click" and "Right-click" are deliberate and never judged, and neither is a step that starts with anything else ("In the window, click Save.").
  3. **A word or phrase on the Words to avoid list.** The list is in the **Writing style** box (a second box beneath the notes: one line each, `file => document`, or just `file`). It is found as a whole word or phrase, whatever the capitals, in titles, headings, paragraphs, boxes, steps, result lines, picture descriptions and callout sentences, but not inside a control name and not in callout names. One note for each word in each place:
     `Block 1 (paragraph) of "1.1 Saving your work" uses "file", a word on your Words to avoid list: ...keep the file and its old version.` with the fix `Use "document" instead, or ignore this if it is right here.`
- **The screens**: the Writing style box gains **Words to avoid, one on each line (word => use instead)** with a count in words that also says how many lines will be left out ("nothing before the arrow, a word that is already there, or more than 100 lines"). Tab goes notes, words to avoid, Save, Cancel. Save keeps both and announces "Words to avoid saved: 2 words and phrases."; Escape keeps nothing and returns the keyboard to the button.
  The book check lists the three kinds under **The book** as notes ("Control names that differ from the name the program showed", "Steps that start with a verb that does not suit the control", "Words from your Words to avoid list"). **Go to it** selects the topic and puts the keyboard on the block (for a word in a picture description or a callout sentence, on that button; for a title, on Rename).
- **Why rules**: the real-model try that shaped part 6 (above) found the small model wrong 4 times in 6 when judging text against the style notes, and missing 2 real problems. These rules find exactly the places they name and nothing else. They know nothing of tense or voice; that was dropped (point 4 of the plan).
- **Tests**: `tests/consistency.test.ts` (14: name comparison, the known controls, each rule with its exact words and fixes, the cases left alone, the verb table kept in step with the procedure drafts, the word list in the check, cleaning and the lines format, the count sentence); scenario `consistency` in the real window by keyboard (no model, no mouse): the notes found, the Writing style box, Save and Escape, the check showing the new word,
  Go to it landing in the page editor, Ignore this and clearing the list.
- **Real run (2026-10-22)**, on a made-up chapter with the click records of a menu item "Save as..." and a button "OK": the three notes above appeared with exactly those words, a step written the usual way ("Choose [[Save as...]].") was left alone, "save as" on the Words to avoid list was not found inside the control name, and with the list cleared the word notes were gone.
- **Not tried**: a book of many topics (the rules read each topic once and the control names once, so they are fast); the notes on a book made from real captures (the real-mouse capture scenarios could not run this session, see HANDOFF).

### Part 6: the plan (2026-10-22, before any code)

**What the author will be able to do.** Three things, each its own small step, tried and committed one at a time:

1. **A chapter opener and a chapter summary (6a).** On a chapter, **Draft an opener** writes two or three sentences for the top of the chapter ("After this chapter, you will be able to save your work, print a page and close the program."). On a topic the author has made for the purpose
   (called Summary, last in the chapter), **Draft a chapter summary** writes a short paragraph restating what the chapter's other topics say. Both wait in Drafts. Accept adds the opener as the first paragraph of the chapter's page, and the summary as a paragraph on the Summary topic's page.
2. **Suggested boxes (6b).** On a topic, **Suggest boxed notes** proposes up to three Caution, Design Tip, Power Tip, Time Saver or Bright Idea boxes, each resting on one sentence the topic's own text already says. The list shows that sentence, lets the author choose the kind and change the words, and says
   **Suggested** on every entry. Accept adds the box right after the block that holds the sentence.
3. **A consistency check with no AI (6c).** In the book check, new notes (ignorable like the others): a control name written in a step or paragraph that does not match the name captured for it ("Save as" against "Save as..."); a step whose verb does not suit the kind of control ("Press the OK button" when OK is a button and the book says Click);
   and a word the author asked to avoid. A **Words to avoid** list joins the writing-style notes ("file", use "document").

**What I found by trying the real model first (2026-10-22).** I wrote a made-up chapter of three topics with paragraphs and steps, gave the built-in model the writing-style notes "Say click for buttons and choose for menu items. Call the thing the reader works on a document, never a file. Keep sentences short.", and asked for each job twice.

- **An opener** took 3.5 and 7.8 seconds and read well: "After this chapter, you will be able to save your work, print a page, and close the program. You can choose File to access saving or printing options, and you can click buttons to complete these tasks." One of the two said "you will click buttons like Save as and Close", which is
  wrong (Save as is a menu item), so a draft needs reading, but it never added a feature the text lacks.
- **A summary** took 5.4 and 8.0 seconds and restated the text correctly both times (it even copied the text's "press the OK button").
- **Suggested boxes**: asked to return JSON in which each box carries the exact sentence it rests on, the real server returned valid JSON every time (it can be forced to; it is a feature of the program, `response_format`), and **every sentence was found word for word in the topic's text**. So a box cannot be invented: the program can check it. But the model chose the *kind* badly:
  it called a warning that work is lost a Design Tip once (a Caution the second time), called "The Print window lets you pick the printer" a Power Tip, and called "Printing can take a few minutes" a Time Saver. Each run took 17 to 19 seconds for three boxes.
- **A consistency pass** is where it failed. Shown the same text and notes, it listed six problems: four were wrong (it said "Choose File" should be "Click File", the opposite of the notes, which say to choose menu items), one real problem was found ("Press the OK button" should be "Click"), and it **missed** two real ones
  (the text says "existing file" although the notes say never a file, and "Save" against "the Save button"). The second run was wrong in the same ways. Each run took about 20 seconds. Every quote it gave was word for word in the text, so the places were right; the judgments were not.

So the plan follows what the model is good at (writing from text it is given) and keeps it away from what it is not good at (judging text against rules):

- The opener, summary and box wording come from the model, checked in code and read by the author.
- The kind of box is for the author to choose, with a rule that makes it a Caution when the sentence says work can be lost, replaced, overwritten, deleted or cannot be undone.
- The consistency check is rules, which are exact, instant and need no AI (so it works with AI help off), and it shows the exact words and place, like the rest of the book check.
- Matching **tense and voice** to the style notes is **dropped**: neither a rule nor this model can do it reliably. The style notes still steer the opener, summary and boxes.

**The guards.** The model is given words only: the chapter's or topic's own text (paragraphs, headings, steps, boxes), the titles, and the writing-style notes. Nothing else, and it all stays on this PC. Every answer is checked in code before it is kept:

- **Opener and summary**: plain sentences only (an opener of 2 to 3 sentences up to 70 words, a summary of 3 to 5 sentences up to 120 words), no quotation marks, lists or formatting, and no capitalised name that is not in the chapter's own text (the same check the callout sentences have).
- **Boxes**: valid JSON of the expected shape; the "evidence" sentence found word for word in the topic's text; the box text one or two short sentences with no capitalised name that is not in the topic's text; at most three; none that repeats a box already on the page.
- Each draft remembers what it was made from, and the list says who wrote it, as now.

**What changes in the saved project (format version 16, once, at the start of 6a).** `drafts.json` gains two kinds: `chapter-text` (`{ nodeId, role: "opener" | "summary", text }`, one per topic and role) and `box` (`{ nodeId, kind, text, evidence, blockId }`, a handful per topic). `project.json` gains `avoidWords`, a list of
`{ avoid, use }` pairs (each at most 60 letters, at most 100 pairs, left out while empty), edited in the Writing style box. A version 15 project upgrades unchanged; `docs/format-spec.md` is updated in the same commit. The consistency notes are worked out from the book every time and never stored.

**Where the code goes.** `src/ai/chapter-text.ts` (the messages, the checks and the job for openers and summaries), `src/ai/boxes.ts` (the same for boxes, with the evidence check and the caution rule), `src/project/consistency.ts` (the three rules), `src/project/drafts.ts` (the new kinds and their Accept), `src/drafts-dialog.ts` (the entries), `src/style-dialog.ts` (the word list),
`src/project/checks.ts` (the new notes), buttons in `src/main.ts`, tests, and the format spec.

**How I will try it.** Unit tests for every check (a good answer; a made-up name; a box whose evidence is not in the text; a long answer; two sentences), the caution rule, the three consistency rules on made-up books, accepting each kind into the page (the opener first, the summary last, a box right after its block), format 16 and a version 15 project opening, and nothing in any export. In the real
window by keyboard for each new entry, and once for each job with the real model on a made-up chapter and then on the real pages I make from real clicks. I show you the real sentences before calling any step done.

**Cost.** On this PC an opener or summary takes about 4 to 8 seconds and a topic's boxes about 6 to 7 seconds; a slower PC takes longer, so each job has a progress line and a Stop button.

**Five points for Jason to confirm** (my defaults in bold):

1. **The opener goes on the chapter's page and the summary goes on a topic the author makes called Summary**, because a chapter's own page prints before its topics, so a summary there would come first. (The other way is a new place on the chapter after its topics, which is a bigger change to the book layout.) **Summary topic.**
2. **Suggested boxes rest on a sentence the topic already says, the author chooses the kind in the list, and a rule makes it a Caution when work can be lost.** **Yes.**
3. **The consistency check is rules, not the model**, as new ignorable notes in the book check, plus a **Words to avoid** list in Writing style. The try showed the model gets it wrong more often than right. **Yes.**
4. **Tense and voice matching is dropped.** **Yes.**
5. **One format change (version 16) at the start of 6a covers the two new kinds of draft and the word list.** **Yes.**

## 1. What the author will see

- A toolbar button **AI help**. It opens a dialog with three choices: **No AI** (the starting choice), **Built-in model on this
  PC**, and **My own key** (for a hosted AI service; built last).
- Under "Built-in model" the dialog says in words what is needed and where it comes from: the name, the size (about 2.7 GB),
  the web address it comes from, the licence (Apache 2.0) with a button that shows the licence text, and how much free disk
  space and memory the PC has. It then offers **Download**. While it downloads there is a progress bar with the numbers in
  words ("1.2 GB of 2.7 GB"), **Pause**, **Resume** and **Cancel**. A broken connection or a closed app continues where
  it stopped. When the file is complete the app checks it against a fixed fingerprint (SHA-256) and says "Ready" or
  "The file is damaged; download it again". **Delete the model** removes it and frees the space.
- A **Test the AI** button asks the model for one sentence and shows it, so the author knows it works.
- Where drafting helps, a **Draft with AI** button. Drafts never go straight into the book. They appear in a review
  list marked **Draft** (in words, not only colour), and the author presses **Accept** or **Reject** on each, or edits
  first. Only accepted text becomes real text. Exports never contain a pending draft.

All of it is keyboard operable, every dialog closes with Escape, progress is announced to a screen reader every few
seconds (not every moment), and status is always words. Screen reader pass is Jason's, as before.

## 2. How it runs

- **The runtime** is `llama-server` from llama.cpp (MIT licence), started by the app on this PC only, listening on
  `127.0.0.1` (the PC itself, not the network), on a free port, with a random password made for that run so no other
  program can use it. It starts when a draft is asked for and stops after a few idle minutes or when the app closes.
  No Python, nothing to install.
- **The model** is downloaded, not shipped in the installer, so the installer stays small (the design spec's goal).
  Stored in the app's own data folder (`%LOCALAPPDATA%`), not in any project.
- **The connector** is one piece of TypeScript with one question ("draft this") and three possible answerers: the
  built-in model, a cloud service with the author's own key, or none. The rest of the app does not care which.
- **Cloud keys** (later part): kept on the PC, protected with Windows' own key storage, never sent anywhere except the service
  they are for. Before the first send the app shows exactly what would be sent.

## 3. What it drafts, in the order I would build it

1. A name and one sentence for each callout, from the clicked item's name, kind, shortcut and description (words only).
2. A numbered procedure from a click-by-click capture ("Click **File**, then click **Save**.").
3. Chapter opener and summary; suggested Tip, Caution and Power Tip boxes (labelled as suggestions); a consistency pass.
   (Index terms: the software's own first pass already works without AI; the AI could add suggestions.)

I would stop after 1 and 2 and ask Jason how they read before doing 3.

## 4. The guards (kept in code, not only in the instructions to the model)

- **Words only to begin with.** A draft request is built from a fixed short list of fields of the click note (item name,
  kind, shortcut, access key, description) plus the page's own text and the writing-style notes. It cannot contain a
  picture, typed text or a password box's contents (those are never kept in a project anyway). Pictures are a later,
  separate decision, and then only the ones the author selects, after the app says so.
- **Never invent a control.** Every control named in a drafted step must be one of the captured items. The check is
  in code; a step that names something not in the capture is held back and marked "not in the capture".
- **Unclear label means "needs a name".** If the captured label is empty or generic, the draft says so instead of guessing.
- **The model's answer is checked.** It is asked for a fixed shape; an answer that does not fit is discarded with a
  plain message, never half-used.
- **Local stays local.** The built-in model has no way to reach the internet: the program is told to listen on the PC only.

## 5. The licence check on the exact files (looked up 2026-10-21)

No model file or runtime has been downloaded. I read the model cards and licence files from the web addresses
below and the sizes and fingerprints from Hugging Face's own listing. The same listing is what the app will pin.

### 5.1 The model (weights)

| Item | What I found |
| --- | --- |
| Original model | `Qwen/Qwen3.5-4B` on Hugging Face (commit `851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a`, 2026-03-02). Card says `apache-2.0`; not gated (no sign-in needed). 4 billion parameters, 262,144-token context, reads pictures as well as text. |
| Its licence file | `LICENSE` in that repository is the standard Apache License 2.0 text, "Copyright 2026 Alibaba Cloud", 11,544 bytes, SHA-256 `bbedc3fda3305820b977265f01b8619d87570a6739de3a5582c3464840f1e57a`. I read the whole file. |
| It was made from | `Qwen/Qwen3.5-4B-Base`, also `apache-2.0`, not gated. |
| The file the app would download | `Qwen3.5-4B-Q4_K_M.gguf` from `unsloth/Qwen3.5-4B-GGUF` at commit `e87f176479d0855a907a41277aca2f8ee7a09523` (2026-03-02): **2,740,937,888 bytes, SHA-256 `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`**. A GGUF is the same model squeezed into a smaller file (a "quantized" copy), made by Unsloth with llama.cpp. |
| Its stated licence | Card says `apache-2.0`, names `Qwen/Qwen3.5-4B` as the base (relation: quantized), and links to the Qwen LICENSE above. No extra terms, no "non-commercial", no use restriction anywhere in the card (I searched it). |
| What Apache 2.0 asks of us | Pass on a copy of the licence and keep the copyright and attribution notices. The app will download Qwen's `LICENSE` next to the model, show it from the AI dialog, and `NOTICE` will credit Alibaba Cloud (Qwen), Unsloth and llama.cpp when the model is first shipped. It does not restrict what the model's output is used for. |
| Not downloaded | `mmproj-*.gguf` (the picture reader, 672 MB) is the same licence but is not needed while drafts use words only. The other quantizations and `imatrix_unsloth.gguf_file` are not used. |

Other publishers carry the same model with the same licence statement, so the choice of file is about convenience, not
licence:

| Publisher and file | Size in bytes | SHA-256 |
| --- | --- | --- |
| `unsloth/Qwen3.5-4B-GGUF`, `Qwen3.5-4B-Q4_K_M.gguf` (recommended) | 2,740,937,888 | `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4` |
| `lmstudio-community/Qwen3.5-4B-GGUF`, `Qwen3.5-4B-Q4_K_M.gguf` | 2,707,513,696 | `25082a7dd3776cc3c741c6347d3bd04523f05796607b3fbc32fa3a25dfa1418c` |
| `bartowski/Qwen_Qwen3.5-4B-GGUF`, `Qwen_Qwen3.5-4B-Q4_K_M.gguf` (made with an importance matrix; bigger) | 3,013,027,808 | `13c16f426047e2de38cd075bdade4a7bcbc8c774384876f677740cda65f8a983` |

There is no official Qwen GGUF repository for this size (Hugging Face answers "not found" for `Qwen/Qwen3.5-4B-GGUF`), which
is why a quantized copy from a known publisher is needed. Because a copy is made by someone else, the app pins the
exact commit and the exact SHA-256 above, so it can only ever accept the file that was audited.

Quality differences between these three Q4_K_M files I cannot judge without downloading them, and I will not download
three 3 GB files to compare. If the first real test reads badly, swapping is a one-line change to the pinned table.

### 5.2 The runtime

| Item | What I found |
| --- | --- |
| Program | `llama-server` from llama.cpp, `github.com/ggml-org/llama.cpp`, licence **MIT** (repository `LICENSE`). Its own third-party notice folder `licenses/` holds `LICENSE-jsonhpp`. |
| Builds | Prebuilt Windows zips exist for both our targets: `llama-bNNNNN-bin-win-cpu-x64.zip` (about 24 MB) and `llama-bNNNNN-bin-win-cpu-arm64.zip` (about 12.7 MB). Today's newest build is `b11803`. Graphics-card builds (Vulkan, CUDA) also exist and are left for later. |
| The zip, read in part 3 | Build `b11803`: the x64 zip holds 52 files (62 MB unpacked), the ARM64 zip 38 (28 MB). Both fingerprints matched what GitHub publishes and are pinned in `tools/ai-runtime.json`. Nothing in them is signed. The only licence file inside is the LLVM OpenMP one (Apache 2.0 with LLVM exceptions); the llama.cpp MIT licence and nlohmann/json's are fetched from the repository at the same build and shipped beside the program. The server needs 23 of the files (45 MB); the rest are benchmark, quantizing, speech and command-line tools. `NOTICE` lists all of it. |
| Versions | llama.cpp publishes a new build many times a day and marks them all "pre-release". One tested build is pinned (`b11803`), not the newest. |
| Update, 2026-11-13 | The pin moved to `b12359`, the build behind llama.cpp's first numbered release (v1.0.0, which carries no files of its own), after the security review of that day: its server fixes include SSRF in the CORS proxy and media addresses, `--cors-origins`, and DNS rebinding. The x64 zip now holds 52 files and the ARM64 zip 38; the files the server needs have the same names, so the list of what is kept did not change, and the two licence texts are the same, byte for byte. Both fingerprints matched what GitHub publishes. The server now gets its password from the LLAMA_API_KEY environment variable instead of its command line. |

### 5.3 Result

On what I could read, the weights, their conversion and the runtime are all permissive (Apache 2.0, Apache 2.0, MIT).
Nothing is GPL, AGPL or restricted. The files inside the llama.cpp zip were read in part 3 (above) and are recorded in `NOTICE`;
they are permissive too (MIT, Apache 2.0 with LLVM exceptions, public domain, BSD).

Sources: [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B), [its LICENSE](https://huggingface.co/Qwen/Qwen3.5-4B/blob/main/LICENSE),
[unsloth GGUF](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF), [lmstudio-community GGUF](https://huggingface.co/lmstudio-community/Qwen3.5-4B-GGUF),
[bartowski GGUF](https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF), [llama.cpp](https://github.com/ggml-org/llama.cpp).

## 6. The parts, each tried and committed on its own

Memory and speed: the model file is 2.7 GB and needs roughly 4 GB of memory while running. On an ordinary laptop
processor it writes maybe 5 to 10 words a second, so a one-sentence description takes a few seconds and a ten-step
procedure about half a minute. Drafts therefore run with a visible Cancel and a progress line while the app stays usable.
The app checks free disk space and memory before the download and warns in words; it does not block (the same stance as
the contrast checker). This PC (24 cores, 128 GB, an NVIDIA card) is far faster than a typical author's, so the real
speed on a modest PC is untried.

1. **Settings and the connector**: the AI help dialog, the choice saved in the app's settings (not in the project), the
   connector with a "no AI" answerer and a "built-in" answerer, tested against a tiny fake server that speaks the same
   language as llama-server. No download.
2. **The model download**: progress, pause, resume, cancel, disk and memory checks, the fingerprint check, delete, the
   licence button. Tested with a fake server first (resume after a cut, a damaged file, a full disk, cancel). **I will ask
   before the first real 2.7 GB download.**
3. **The runtime**: a double-click `Get AI Runtime.bat` that downloads one pinned llama.cpp build, checks its fingerprint and
   unpacks it for the app to carry; the shell starts and stops it (random port and password, stops with the app); the
   **Test the AI** button; `NOTICE` updated.
4. **Draft callout names and sentences**, with the review list and the Accept and Reject buttons. This needs a project
   format change (version 14): drafts are kept in the topic beside the thing they would change, apart from accepted text,
   plus a plain "writing style notes" box for the project that the AI reads before each draft. A migration and
   `docs/format-spec.md` come in the same commit.
5. **Draft a procedure from a click capture.**
6. **Chapter openers and summaries, suggested boxes, the consistency pass**, if the first two read well.
7. **My own key** for a hosted AI service, with Windows key storage and the "this is what will be sent" box.
8. **The MCP draft tool**, so an assistant can ask for a draft; it hands back the structured details when no model is set up.

Parts 1 to 3 give a working "Test the AI". Parts 4 and 5 are where it starts to be useful.

## 7. What Jason needs to confirm

1. **The model file**: Unsloth's `Qwen3.5-4B-Q4_K_M.gguf` (the first row above), pinned by commit and fingerprint.
2. **The runtime travels inside the installer** (about 24 MB more for the x64 installer, 13 MB for ARM64, MIT licence), and
   only the model is downloaded. The other way is to download the runtime together with the model.
3. **When the model downloads**: the first time the author turns on the built-in model (not during the installer). `CLAUDE.md` says
   "during first install"; the installer does not exist yet and the design wants it small, so I am reading it this way.
4. **Drafts and writing-style notes are stored in the project** (format version 14, in part 4).
