# Screen reader pass: what the machine checks found (2026-11-01)

This is the part of the screen reader pass that a program can do. It was run on 2026-11-01 against a build of the whole improve-build work (format 21), on a copy of the OpenStage Author User Guide (92 topics, 45 pictures). The scripts are in `tools/a11y/` and can be run again.

**What this is not.** Nobody listened to any of it. The checks use the browser's own accessibility tree (the same information NVDA gets from the browser), the keyboard, and the files' structure. They find things that are missing or broken. They cannot say whether a message sounds right, whether the order of a long page is tiring to hear, or whether a picture's description tells a listener what they need. That is what `docs/screen-reader-pass.md` is for, and until a person has done it the claim "works with a screen reader" is supported by these checks and the design only. The results of that pass go in `docs/screen-reader-results.md`.

## Results

| What was checked | Result |
| --- | --- |
| The editor: the main window and 21 windows (the 13 the toolbar opens, and the 8 a topic's page and pictures open: Link to a topic, Comments, Unresolved comments, Click circle settings, Describe the picture, Picture view, Callouts, Drawing) | 216 of 216 checks passed |
| The windows added in this work, in the real window (Export's new kinds and language box, Look's language box, History, the Replace the picture file button) | 34 of 34 passed |
| The help site: 8 pages of 94 (the first, the index and an even spread) | all passed |
| The e-book: its title page, contents, two chapters and index | all passed (118 of 118 with the help site) |
| The PDF of the guide | 12 of 12 passed |
| The Word file and the review copy | read back by the program's own Word reader (headings, 45 pictures, the 16 chapters in order); not examined by Word or by a checker |
| The e-book as a package | 21 XML files well-formed, 298 links all resolve; not run through EPUBCheck |

## What each check looked at

**The editor, in every window:** every button, field, list, tab and tree item has a name in the accessibility tree; each window has a title it is named by; the keyboard starts inside a window; Tab goes round inside it, never leaves it and never sticks; every stop shows an outline or a glow; Escape closes it and the keyboard goes back to the button that opened it; ids are used once and every label and description points at something that exists; every field has a label; text has enough contrast where the program can measure it (4.5 to 1, or 3 to 1 for large text). In the main window also: a main landmark and headings in order; the page's language; 90 presses of Tab visit 75 different things and never stick; F6 and Shift+F6 go round the three panes; the arrow keys move through the tree; results are spoken through a polite live region.

**The help site and the e-book's pages:** the page says its language and has a title; every link, button and field has a name; pictures have descriptions; exactly one level-1 heading and no jumps in heading levels; a main landmark and a navigation with a name (help site); no ids used twice; no empty links; contrast; the first Tab stop is the skip link and it moves the keyboard into the topic (help site); every stop shows where it is; each page points to its Markdown version.

**The PDF:** it is marked as tagged and has a structure tree; headings (285), lists (113 lists, 448 items), figures (45, each with alternative text), links (295); a language; a title that is shown instead of the file name; bookmarks.

## Faults the checks found, and fixed

1. **The PDF had two figure tags for every picture, and the outer one had no alternative text** (90 figure tags, 45 with a description). A checker that asks every figure for alternative text would have failed the book 45 times. The cause was the HTML `figure` element, which the PDF printer tags as a figure of its own around the picture's tag. Fixed by marking the figure as a group in the page that is printed (`src/export/pdf.ts`); the PDF now has 45 figures and 45 descriptions. The help site and the e-book keep the `figure` element, where it names the picture's caption.
2. **The help site's skip link ("Skip to the topic") did not always move the keyboard into the topic**, because the topic's area could not take focus. It can now (`tabindex="-1"`, with no outline drawn on it; `src/render/help.ts`, `src/export/site-assets.ts`). Checked: after the link, focus is on the topic.

Everything else the checks looked at was already in order. A few things the first runs reported were faults in the checking scripts and not in the program (focus resting on the page for a moment when Tab wraps round; a window with a single control; a link followed by the wrong key), and were corrected in the scripts.

## Information, not a failure

- **Reflow.** At a window 320 pixels wide the editor needs sideways scrolling (471 pixels of content in 305). WCAG 1.4.10 asks for none for ordinary pages. OpenExplainer is a three-pane desktop editor, so this is recorded, not required. The pages it makes (the help site and the e-book) are not the editor.

## What these checks did not cover

- **Anything spoken.** No screen reader was run. NVDA, Narrator, a paid Windows screen reader and the Mac's screen reader can differ from one another and from the browser's tree.
- **Word and PDF checkers.** The Word file's structure was read back by the program's own reader, not opened in Word with a screen reader or run through Word's accessibility checker. The PDF was read for its tags, not run through a desktop PDF accessibility checker or a PDF/UA validator, and its reading order was not examined.
- **The e-book in a reading app**, and EPUBCheck.
- **The click-capture windows** (the always-visible Cancel window and the selection overlay) and the operating system's own file choosers; the program cannot drive these through the page.
- **The Drawing window as a person would use it.** It opens, is named, and Tab and Escape work, but whether a person can place an arrow with the keyboard alone and understand what they are doing has not been tried.
- **Colour used alone.** Statuses and kinds of note are written as words with a symbol (a rule of the program); the checks measure contrast, not whether colour alone carries meaning.
- **Magnification, voice control, switch access and touch.**

## How to run them again

See `tools/a11y/README.md`.
