# Plan: the local AI (Step 7)

Written 2026-10-21, before any download and before any code. Jason said to begin with the plan in plain words and the
licence check on the exact files. Nothing here is built. Section 7 lists what Jason needs to confirm.

The rules this follows: everything in the app works by hand with no AI (design spec section 7); the AI drafts and the
author decides; nothing leaves the PC unless the author chose a cloud service; open model weights are audited file by
file before they are downloaded (`CLAUDE.md`).

## 1. What the author will see

- A toolbar button **AI help**. It opens a dialog with three choices: **No AI** (the starting choice), **Built-in model on this
  PC**, and **My own key** (ChatGPT, Claude or Gemini; built last).
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
| Still to check at build time | The contents of the zip I pick (every DLL and licence file it carries) and its SHA-256, which I will record in `NOTICE` and pin. I did not download it because you asked for the plan first. |
| Versions | llama.cpp publishes a new build many times a day and marks them all "pre-release". I will pin one tested build, not follow the newest. |

### 5.3 Result

On what I could read, the weights, their conversion and the runtime are all permissive (Apache 2.0, Apache 2.0, MIT).
Nothing is GPL, AGPL or restricted. The one thing I could not settle without downloading is the list of files inside the
llama.cpp zip, which is a step in part 3 below and will be recorded in `NOTICE` before the zip is committed or shipped.

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
7. **My own key**: ChatGPT, Claude, Gemini, with Windows key storage and the "this is what will be sent" box.
8. **The MCP draft tool**, so an assistant can ask for a draft; it hands back the structured details when no model is set up.

Parts 1 to 3 give a working "Test the AI". Parts 4 and 5 are where it starts to be useful.

## 7. What Jason needs to confirm

1. **The model file**: Unsloth's `Qwen3.5-4B-Q4_K_M.gguf` (the first row above), pinned by commit and fingerprint.
2. **The runtime travels inside the installer** (about 24 MB more for the x64 installer, 13 MB for ARM64, MIT licence), and
   only the model is downloaded. The other way is to download the runtime together with the model.
3. **When the model downloads**: the first time the author turns on the built-in model (not during the installer). `CLAUDE.md` says
   "during first install"; the installer does not exist yet and the design wants it small, so I am reading it this way.
4. **Drafts and writing-style notes are stored in the project** (format version 14, in part 4).
