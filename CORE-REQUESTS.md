# Requests to the shared core

Written 2026-11-16 by the OpenExplainer session, as `CORE-NOTES.md` asks: what OpenExplainer needs from `openstage-core` and does not build for itself. Each request says what is needed, why, what OpenExplainer already has or
did meanwhile, and what it will do once the core answers. Answered requests move to the bottom with the core's revision.

OpenExplainer used from the core so far: the capture crates, tag `capture-v0.1.0` (`openstage-capture-project`, `-render`, `-windows`), through the capture helper (`docs/recording-import.md`). Nothing was copied.

## 1. C1: how still-image steps travel to Author and Studio (the "send to" path)

**Needed.** A written way for a tool that holds *still steps* (a picture, the place that was clicked, what was clicked, the words) to hand them to OpenStage Author as a simulation and to OpenStage Studio as a script. Today C1 describes a
recording with a **video**; a guide made in OpenExplainer has none, so it cannot be a C1 take.

**What OpenExplainer holds for each step** (`guideTasks` in `src/project/guides.ts`): the step's words (plain, with marks), an optional result sentence, one picture (PNG, with its size), the click on it (`x`, `y` in picture pixels, `button`, `double`),
the clicked item (`role`, and `name` only for a button or menu), the callouts on the picture (lettered rectangles with a sentence each), the task (topic) it belongs to, and a stable step id.

**What Author needs, as far as its documents say.** Its format reserves `simulation` (`docs/format-spec.md` there, "Simulation": `stepIndex`, `interaction`, `correctTarget` as a rectangle, `expectedText`, `feedback`, `attemptsAllowed`, `mode` of
`demo`, `practice` or `assessment`) but nothing reads steps from another tool. So the question is which side defines the hand-over: a `steps` form of C1 (for example a folder with `steps.json` and `images/`, or a `kind: "still"` take), and a call or file
Author's import reads into a lesson with that block on each step.

**Asked of the core**
1. Define the still-step form (or say it is a different format and where it lives), with a version and a conformance example, like `.pstat`.
2. Define the **provenance link**: a step's stable id that survives re-capture, so that re-capturing one step updates every output (the core's C1 list says Author already keeps such links; OpenExplainer has the step ids and would write them).
3. Say how a receiving tool is told about a hand-over (a file the person opens, a folder it watches, or a call), so that OpenExplainer, Recorder and Capture Express all write it the same way.

**Meanwhile.** Studio has its own written script format, so OpenExplainer writes that directly (`docs/send-to.md`, validated against Studio's own validator). For Author nothing is written.
**Once answered:** OpenExplainer writes the form from a guide (about a day: the data is already there), and reads it back to follow re-captures.

### Smaller C1 findings from reading a recording

These came up while building the reader (`docs/recording-import.md`). None blocks it.
- **The log never says a clicked box is a password box.** An `element` line has a `name` and a `role` (`edit` for a text box). A reader that must never keep a password's name has to drop every text box's name. Either write `password: true` on an `element`
  line (as the live click capture does) or say in section 6 that the name of an `edit` item is never written.
- **A window recording's take has `target` as "opaque".** A reader has to find out that the take was of one window from `sources: ["window:<process>"]` and then count clicks from the latest `window` line's `bounds`. Document that as the rule (it is written under "Positions" but not tied to `sources`).
- **The moment of the picture.** A reader that wants "the screen just before this click" takes the video's picture 100 ms before the click's `t`. The format does not say how the video's clock and the log's `t` line up, or how far a picture lags the screen. A sentence with a measured number would let every tool use the same one.
- **A supported way to ask for one still.** OpenExplainer cuts a still with `edit_from_take` and `export_frame` (an edit and a render job built for one picture). It works (a real MP4 is cut in a test) but those were built for exporting video. A named, documented function, "the screen of take N at time T, as a picture", would be a steadier thing to depend on.
- **Taking a still needs Windows' video decoder**, so `openstage-capture-windows` (a large crate) is linked into a helper that only reads. A small crate that only reads takes, and one that decodes, would keep a reader small.

## 2. C2: the accessibility rule engine, as OpenExplainer would use it

**Not in the core yet** (`CORE-NOTES.md`: not started, priority 3), so OpenExplainer builds no rule engine of its own and runs C2 on nothing today. The list's reason for item 3, "contrast is the only check today", is out of date: OpenExplainer already has the book check
(`src/project/checks.ts`, `book-checks.ts`: missing descriptions, colours too close, links, headings, empty parts, pictures too small for paper, and more) and machine checks of its own outputs (`tools/a11y/`, `docs/screen-reader-machine-checks.md`: help site and e-book pages, the PDF's tags). They are OpenExplainer's own rules and
stay until C2 exists; then they should be written as C2 rules, not run beside them.

**Needed from C2, so OpenExplainer can use it**
1. **A package with no runtime dependencies** that takes an output and returns findings. The outputs OpenExplainer makes: a **help site** (a folder of HTML, CSS, JavaScript and Markdown pages), an **EPUB 3**, a **tagged PDF** (and its tag tree), a **Word file**. The first two are web output and are the ones the list names; the PDF is where
  PDF Remediator's checks already live (the list says C2 reuses its contrast math and its status words).
2. **A finding** with: a rule id (stable, so a person can ignore one), the **WCAG 2.1 AA success criterion** it maps to, a status in the words **pass, fail, needs review, not tested** (always words and a symbol, never colour alone), where it is (file and element or selector, or PDF page and tag), a sentence in plain words,
  and what to do about it.
3. **Warn, never block**, as settled. And the opt-in: an author may turn chosen rules into publishing blockers **for their own project**, **off unless they turn it on**. The core should fix how a project stores that (a list of rule ids, empty by default) so every tool writes it the same way;
  OpenExplainer would keep it in `project.json` (a format version with a migration, as every format change here does) and would not block unless the list is non-empty.
4. The rules named in the list: alt text present and not weak, heading order, reading and focus order, keyboard reach, captions, contrast, link text, timed content. For OpenExplainer's outputs also: page language, a title, names on every control, a skip link that works, landmarks, ids used once, a PDF's tags and bookmarks.
5. A **conformance set** like the item-analysis one: small outputs with the findings expected, so OpenExplainer can prove it matches.

**What OpenExplainer checks today that C2 could take over (so the rule ids can be matched)** — from `docs/screen-reader-machine-checks.md`: page says its language (3.1.1) and has a title (2.4.2); every link, button and field has a name (4.1.2, 2.4.4); pictures have descriptions (1.1.1);
one level-1 heading and no skipped levels (1.3.1, 2.4.6); a main landmark and a named navigation (1.3.1, 2.4.1); ids used once (4.1.1); no empty links (2.4.4); contrast, 4.5 to 1 and 3 to 1 for large text (1.4.3) and for marks (1.4.11); the first Tab stop is a skip link that moves the keyboard (2.4.1);
every stop shows where it is (2.4.7); the PDF is tagged with a structure tree, headings, lists, figures with alternative text and a language and title (the PDF/UA checks). The WCAG numbers here are my reading, not checked by a person.

**Meanwhile.** Nothing is run through C2. The invariant it asks for is already true in OpenExplainer and is written down: the accessibility check before export is optional and never required, and every finding only warns (`CLAUDE.md`).

## 3. C8: where OpenExplainer's AI settings and keys go when there is one runtime

**Not scheduled** (`ROADMAP.md`): "one settings page for bring-your-own keys, so no tool keeps keys of its own". The OpenExplainer list asks for its own bring-your-own key now (item 4), so it is built **inside OpenExplainer**
(`src/ai/cloud.ts`, `src-tauri/src/keys.rs`, `docs/ai-keys.md`) and is meant to be lifted out whole when C8 exists. What C8 should take from it:

- **Key storage**: Windows' own protection for the current user (DPAPI), one file for each service, never in a project, never in a log, shown only as "a key is saved" and the last four characters.
- **The disclosure**: before the first send of a session to a service, the exact messages that would be sent and the service's address, with Send and Cancel. A model never sets an answer key and an AI suggestion is accepted by a person (the rules OpenAssess wrote for C8 are kept).
- **Unattended use**: an assistant working over MCP with nobody at the keyboard may use the **built-in model**, never a person's key, because nobody can confirm the disclosure. C8's "one pattern for each tool's assistant server" should say the same.

Once C8's contract is written, OpenExplainer moves its key store and settings onto it and deletes its own.

## Answered

(none yet)
