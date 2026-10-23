# OpenExplainer project format

Read this before touching anything that reads or writes a project. Change it in the same commit as the code.

## Layout

A saved project is ONE file named after the project, such as `Test1.openexplainer`. It is a standard zip package
(stored without compression, so pictures are not compressed twice), written and read by `src/project/zip.ts` and
`src/project/package.ts`. Any zip program can open it for inspection. Inside it, the current format holds two files, a page file for each topic that has a page, a file of drafts when any are waiting, and a picture folder:

- `project.json`: `version`, `name`, `template`, `variables` (PRODUCT, VERSION, COMPANY and any others), `highlight` (the look of the click circle, see "The click highlight"), `zoom`, `styles`, `checks`, `guides` (see "Short guides") and `paper` (see "Paper settings") and `writingStyle` and `avoidWords` (see "Drafts and writing style"; each left out while empty).
- `structure.json`: `version` and `tree`, the chapters and topics (each with its status, pictures and, if it has any, its index terms, see "The book index").
- `topics/<topic id>.json`: the page of a topic, only for a topic that has something on its page (see "The page").
- `drafts.json`: the AI drafts waiting for the author, `{ version, drafts }`, only when there is at least one (see "Drafts and writing style").
- `images/`: one file per picture, named `images/<picture id>.png` or `.jpg`. Only pictures a topic still uses are saved.

All of these carry the same `version`. If they differ, the project is refused, because they come from different saves.

## The tree

`tree` is a list of chapters. Each node is `{ id, title, status, pictures, children }`, and children are topics (and topics of topics).

- `id` is permanent. Everything else points at a node by its id, never by its number.
- Numbers (1, 1.2, 1.2.3) are never stored. They are worked out from position, so they cannot go stale.
- `status` is one of `not-started`, `captured`, `drafted`, `reviewed`, `needs-recheck`. Each has a word, a symbol and a color on screen; color is never the only signal.

## Pictures

Each node holds a list of pictures: `{ id, file, width, height, altText, source }`, and a picture may also have `click` (a click-by-click capture, see "Click notes") `highlight` (its own choices about the click circle, see "The click highlight") `callouts` (see "Lettered callouts") and `view` (see "Picture views") and `shapes` (see "Marks drawn on a picture").

- `file` is the path inside the package. `width` and `height` are in pixels.
- `altText` says what the picture shows. It is always asked for and never filled in silently. Empty means it still needs one, and the app shows it as "Needs a description".
- `source` is `{ kind, capturedAt, originalName? }`. `kind` is `import` for a picture brought in from a file, `window` for a capture of one window and `region` for a capture of a rectangle of a screen (`click` for a picture made by a click-by-click capture). For `import`, `originalName` is the file's name. For `window`, it is the captured window's title. For `region`, it is words naming the screen and the place, such as "Screen 1, 800 by 600 pixels, 100 from the left and 50 from the top". For `click`, it is the click in words, such as "Click on the button "Save" (access key Alt+S)". Adding `window` and `region` needed no format change.
- Only PNG and JPEG are accepted, so no other format can get into a project.
- A click position is stored beside the picture as a click note, and annotation shapes will be too. Neither is ever burned into the picture file.
- If a listed picture file is missing from the package, the project still opens and the picture shows as missing.

## Click notes

A picture made by a click-by-click capture has `source.kind` `click` and a `click` note. A picture from any other source has no `click`.
`click` is `{ x, y, button, double?, target? }`:

- `x` and `y` are where the pointer was, in picture pixels from the picture's top left corner (whole numbers).
- `button` is `left`, `right` or `middle`. `double` is `true` for a double-click and is left out otherwise.
- `target` says what Windows reported under the pointer, from Windows UI Automation. Every part is optional, because Windows often cannot say:
  `name` (such as "Save"), `role` (such as "button"), `acceleratorKey` (such as "Ctrl+S"), `accessKey` (such as "Alt+F"), `description`,
  and `bounds`, the item's outline as `{ x, y, width, height }` in the same picture pixels.
- Text is cut to 300 characters and extra white space is squeezed. A `bounds` with no width or height is dropped.

Rules that are enforced in code (`src/project/clicks.ts`), both when a project is opened and when it is saved:

- **A password box is never described.** If the item is a password box, `target` is exactly `{ "password": true }`. Its name, role, description
  and outline are dropped.
- **What was typed in a box is never kept.** Anything that is not on the list above is dropped, so even a note written by another
  program cannot smuggle a value in.
- A click note that is not valid (a missing position, an unknown button) is dropped and the picture, with its description, is kept.
- Saving works on a copy, so the project in memory is not changed by it.

The note is stored so that a click highlight can be drawn, moved, restyled or removed later without touching the picture.

## The page

A topic's page is what the reader sees under the topic's title: a list of **blocks**, in order. The title itself is not a block. A page is saved in
`topics/<topic id>.json` as `{ version, blocks, comments? }`, and only when it has at least one block, so a topic with nothing on its page has no file. The
page lives on the topic in memory (`TreeNode.page`), so it moves, indents and is deleted with the topic; `structure.json` holds no page text.

Every block has an `id` (permanent, like a node's) and a `type`:

- `heading`: `{ text }`, a sub-heading in plain text.
- `paragraph`: `{ text }`, text with marks (below).
- `picture`: `{ pictureId }`, one of the topic's own pictures, shown here. A picture is only on the page where it is placed.
- `procedure`: `{ steps }`, numbered steps. Each step is `{ id, text, pictureId?, result? }`: what to do (start with a verb and name the control exactly as
  it appears on screen), an optional picture of the topic, and an optional result line ("The Format pane opens."). **Step numbers are never stored**;
  they are worked out from the order.
- `callout`: `{ kind, text }`, a box. `kind` is `design-tip`, `caution`, `bright-idea`, `power-tip`, `time-saver` or `new-feature` ("New in this
  version"). Each has an icon, a label word and a coloured band in print and on the help site.

**Text with marks** is a list of runs, `{ text, mark? }`, where `mark` is `bold`, `italic` or `control` (a control name: the label of a button, menu
or box exactly as it appears on screen, shown in bold in print). A run has at most one mark and neighbours with the same mark are joined. Variables
such as `{{PRODUCT}}` are ordinary text and are filled in on export. In an edit box the same text is typed as `**bold**`, `*italic*` and
`[[Control name]]`; a backslash makes the next `*`, `[`, `]` or `\` an ordinary letter, and a marker with no partner, or with a space against it,
stays ordinary text (`src/project/text.ts`).

Rules enforced in code (`src/project/page.ts`), when a project is opened and when it is saved:
- Only blocks of the kinds above are kept; anything else is dropped. A callout of an unknown kind becomes `design-tip`. Two blocks with one id get
  their own ids.
- A picture block, or a step's picture, whose picture is not in the topic is dropped (a step only loses the picture). A picture block with no picture
  chosen yet is kept. Removing a picture from a topic takes it off the page too.
- A page file whose `version` differs from the project's is refused ("do not match"), and so is a damaged one, in plain words that name the topic,
  rather than being lost. A page file for a topic that is not in the project is ignored. A topic whose id is not a safe file name (letters, digits,
  `_` and `-`) has its page left out.

### Comments

A page can carry **comments**: working notes an author leaves on a block, to be resolved later. They are saved in the page's own file as `comments`, a list that is left out
until there is one, and are never part of what the reader sees (a preview or an export leaves them out). Each is `{ id, blockId, text, resolved, createdAt, resolvedAt? }`:

- `blockId`: the block it is on. A comment belongs to one block of any kind (for a numbered procedure, to the whole block, not a step). When a block is deleted, or a
  picture block goes because its picture was removed from the topic, its comments go with it.
- `text`: the words, at most 1000 letters, line breaks made plain and the edges trimmed. A comment with no words is not kept.
- `resolved`: true or false. `resolvedAt` is only kept while it is resolved. `createdAt` is an ISO date and time.

Cleaned when a project is opened and saved (`cleanComments` in `src/project/comments.ts`): a comment on a block that is not on the page, with no words, or that is not an
object is dropped, a repeated id gets a new one, and `resolved` is true only when it says true. The list of unresolved comments across the book is worked out from the pages
(`src/project/comment-list.ts`), never stored.

## Lettered callouts

A picture can have **callouts**: a small lettered marker with a leader line to the part of the picture it names, and an entry under the picture with its
letter, its name and a sentence about it. Callouts belong to the picture (not to a page, so the same picture shows the same callouts wherever it is used),
are stored beside it and are never burned into it. `callouts` is a list on the picture, in order. Each is `{ id, name, description, target, marker }`:

- `name`: what it names, such as "Save". Empty means it still needs a name. `description`: a sentence about it. Empty means it still needs one. Each is
  at most 300 letters, with white space squeezed.
- `target`: `{ x, y, width, height }`, the part of the picture it names, in picture pixels from the top left corner. It is cut to the picture.
- `marker`: `{ x, y }`, where the middle of the lettered marker sits, in picture pixels, kept on the picture.
- **The letters are never stored.** They are A, B, C ... Z, AA, AB ... by position in the list, so moving or deleting a callout re-letters the rest. Letters, not
  numbers, because numbers belong to the steps of a procedure.

A click picture gets its first callout automatically from the click note: the clicked item's `bounds` become the `target`, its `name` (when the name is
kept, see "Click notes") becomes the `name`, the sentence starts empty, and the marker is placed just outside the item, above and to the left when there is
room, and not on another marker (`placeMarker` in `src/project/callouts.ts`). A password box, a click with no outline and an outline that is off the picture
make none. The marker is a fixed share of the picture's width (a little over 1 percent, never under 10 pixels), so it looks the same at any picture size.
The leader line runs from the edge of the marker to the nearest part of the item, and there is none when the marker is on the item.

Cleaned when a project is opened and saved: a callout with no usable outline or marker, or whose outline is wholly off the picture, is dropped; a repeated id
gets a new one; and a picture with none has no `callouts`.

## Picture views

A picture can be shown **whole** (the default), **cropped** to a region the author chose, or **zoomed in on the click**. The picture file is never cut: the view is
kept beside it, so it can be changed or taken off at any time, and it is never burned in. `view` is on the picture, and is left out for a picture shown whole:

- `{ "kind": "crop", "x", "y", "width", "height" }`: the region, in picture pixels from the top left corner, cut to the picture when saved and opened.
- `{ "kind": "zoom" }`: the part around the click (the click note's `x` and `y`). It is as wide as the **zoom size** for where the picture is used says, keeps the
  picture's shape, is centred on the click, and slides along an edge rather than shrinking so it never shows beyond the picture. A zoom on a picture with no
  click shows the whole picture.

**The zoom sizes, for each place a picture is used.** `project.json` has `zoom: { book, guide }`, each `{ size }`: the width of the part shown, as a percent of the
picture's width (10 to 100; 100 shows the whole picture). Starting sizes: 50 for the book and 40 for a quick guide. They are project settings, like the circle's.

`shownPart` in `src/project/views.ts` is the ONE place that decides which part of the picture is shown for a place; the editor and every export must use it.
Callouts and the click circle stay in the whole picture's pixels whatever the view, so they line up in every view; a callout whose item is wholly outside the
shown part is still in the list and is said to be outside it.

## Marks drawn on a picture

A picture can have **marks**: arrows, text boxes, rectangles and numbered markers. They are stored beside the picture in `shapes`, a list in the picture's own pixels from the
bottom mark to the top one (a later mark is drawn over an earlier one), and are never burned into it, so they stay editable and the capture stays clean. They are drawn over the
click circle and under the lettered callouts. Every mark has an `id` and `alt` (alternative text, at most 300 letters, empty when there is none yet), and may have
`keptLowContrast: true`, set when its colours were saved with a contrast below the minimum so the choice is on record for the accessibility check. A `kind` says which:

- `arrow`: `{ from, to, color, thickness }`, a straight arrow from `from` to `to` with its head at `to`. `thickness` is in picture pixels (1 to 100). An arrow with no length is dropped.
- `text`: `{ box, text, fill, outline, textColor, size }`, a box with words in it. `fill` is a colour or `null` for none (white by default); `size` is the height of the letters in
  picture pixels (6 to 400). The words are wrapped to the width of the box when drawn (`wrapText` in `src/project/shapes.ts`); a box smaller than 4 pixels is dropped.
- `rectangle`: `{ box, outline, thickness, fill, seeThrough }`, an outline round an area, optionally filled (`fill` is a colour or `null`; `seeThrough` is how much shows through,
  0 to 100, starting at 70).
- `marker`: `{ at, label, color, size }`, a step number or a letter on a spot, one to three letters or digits (default `1`), `size` being the radius in picture pixels. The label is black
  or white, whichever reads better on `color`, so it is not stored.

A colour is six hex digits with a leading `#` in capital letters (`#C62828`); anything else becomes the starting red. Points are whole pixels kept on the picture; boxes are cut to it.
A new mark starts near the middle of the picture with sizes that follow its width (a line about 0.3 percent of the width across, letters about 1.2 percent high), so it looks the same at
any picture size.

**What a mark says for a reader who cannot see it** (`shapeWords`, `shapesDescription`): a text box says its words (and its description after them), a marker says its label (and its
description), an arrow or a rectangle says its description. They are added to the picture's description as "Marks: ...", after what the author wrote. An arrow or a rectangle with no
alternative text is said to need one.

**Contrast** (`src/project/contrast.ts`) is worked out as WCAG 2.2 says. Text must reach 4.5 to 1 against its fill, and the parts of a graphic (an arrow, an outline, a marker) 3 to 1 against
the picture behind them (an average of the picture under the mark, so the check says "about"). The checker is always on and only warns: a mark can keep any colour. It is cleaned and checked
every time, and `keptLowContrast` is the record of a kept choice. Ratios are said to one decimal place and rounded down, so 4.49 is never said to be 4.5.

Cleaned when a project is opened and saved: a mark of an unknown kind, with a point that is not a number, or too small is dropped; numbers are cut to the picture and kept in range; a colour
that is not one becomes the starting one; a repeated id gets a new one; and a picture with none has no `shapes`.

## Named styles

`project.json` has `styles`, a list of named sets of colours: `{ id, name, fill, outline, textColor }`. A red box with white lettering saved as "Warning" is one. A style is applied by
**copying** its colours onto a mark (an arrow takes the outline colour; a marker takes the fill, or the outline when there is none; a text box takes all three; a rectangle takes the fill and
the outline), so a mark never depends on a style and every picture is complete by itself. A name is at most 40 letters and no two styles have the same name, capitals aside. A style's own
colours get the same contrast check as a mark's (its words on its fill). Cleaned when a project is opened and saved.

## The book check

`project.json` has `checks: { ignored }`, the keys of the things in the book check that the author chose to ignore. A key is made so that it stays the same while the thing stays the same, such
as `picture-alt:<picture id>`, `empty-topic:<topic id>`, `callout-description:<picture id>:<callout id>`, `mark-alt:<picture id>:<mark id>` or `variable-empty:PRODUCT`. Ignoring all of a kind
adds the keys of the things of that kind found at that moment; a new one found later still shows. Cleaned when a project is opened and saved: only keys that are text, once each. The things the
check finds are worked out from the project every time (`src/project/checks.ts`), never stored.

## The book index

A topic can have `index: { terms, removed? }` in `structure.json` (format version 13), left out until it has something. `terms` is a list of `{ text, by }`: `text` is the term as it is printed (tidy spaces, no full stop, comma
or colon on the end, 2 to 60 letters with at least one letter in it, no unfilled `{{VARIABLE}}`) and `by` is `"software"` (the first pass or an update proposed it and the author has not changed it) or `"author"` (the author
added or retyped it). `removed` is a list of keys (lower case, one space between words) of software terms the author took out, so an update does not bring them back. The **index of the book is never stored**: it is
worked out from every topic's terms (`buildBookIndex` in `src/project/book-index.ts`). The same term (by its key, capitals and spacing aside) in two topics is one entry listing both topics in book order, each once;
the author's spelling wins over the software's, else the first one found; entries are in alphabetical order (a collator for English, ignoring capitals and accents) under a heading for each letter A to Z, with
"Symbols and numbers" first.

The **first pass** is worked out from the book with no AI (`suggestedTerms`): for a topic with something on its page, its title, every control name written in its text (paragraphs, steps, step
results and boxed notes), and the name of every callout on the pictures that are on its page. An **update** (`updateTopicIndex`) keeps the author's terms, does not bring back what the author took out, keeps software
terms the book still supports, drops software terms it no longer supports and adds new suggestions; the first pass for a topic is the same call. Editing a topic's terms as lines of text (`setTermLines`) keeps a
line the author left alone as the software's, makes any other line the author's, and remembers a software term whose line was deleted in `removed`; writing it again makes it the author's. Cleaned when a project is opened
and saved (`cleanTreeIndex`): terms that are text and usable, each key once, `by` known (else the software's), and `removed` keys that are text and not terms.

## Drafts and writing style

Formats 14, 15 and 16. **Drafts** are proposals kept apart from the real text until the author accepts them, one at a time. They are saved in `drafts.json` as `{ version, drafts }`, a file that exists only while at least one draft is waiting, and that carries the same
`version` as every other file of the save (a different one, or a damaged file, refuses the project in plain words). There are four kinds, told apart by `kind`; a kind this program does not know is dropped when a project is opened.

A **sentence** draft (`callout-sentence`, format 14) is a one-sentence explanation the AI wrote for a callout: `{ id, kind, pictureId, calloutId, text, clues, madeAt, model }`.

- `pictureId`, `calloutId`: the callout it is for. A draft for a picture or callout that is not in the project is dropped.
- `text`: the proposed sentence, white space squeezed, at most 300 letters, never empty.
- `clues`: what the model was given, one plain line each (at most 14 lines of 300 letters), so the reviewer can judge whether it had enough. `madeAt`: an ISO date and time. `model`: the model's file name.
- Only the newest draft for one callout is kept.

A **procedure** draft (`procedure`, format 15) is a numbered procedure made from a topic's click pictures, written by rules from the click notes (no AI; `src/project/procedure-draft.ts`): `{ id, kind, nodeId, steps, madeAt, by }`.

- `nodeId`: the topic it is for; a draft for a topic that is not there is dropped. Only the newest draft for one topic is kept.
- `steps`: a list of `{ pictureId, text, from, flag? }`, at most 60, in the order of the topic's pictures. `pictureId` is one of the topic's pictures (a step whose picture has gone is dropped); `text` is the step as the author edits it, with `[[Control name]]` marks, at most 300 letters, never empty;
  `from` says in plain words what the step was made from; `flag` is set (in words) when the step needs the author's attention, such as a control with no name. A draft with no usable step is dropped.
- `by`: `"rule"` for the wording written by the rules, or `"model"` if a later part has the model write it.
- **The rules**: one step for each click picture of the topic that is not already in a step on its page, in the order of the pictures. The wording follows the kind of item clicked (button "Click [[Save]].", menu item "Choose [[Save as...]].", menu "Open the [[File]] menu.", check box "Tick [[X]].",
  radio button "Select [[X]].", combo box "Open the [[X]] list.", text box "Click the [[X]] box.", tab "Click the [[X]] tab.", link "Click the [[X]] link.", list or tree item "Select [[X]].", a password box "Click the password box."); a double-click, right-click or middle-click changes the verb.
  The name is the name of the author's callout on the clicked item, else the name Windows gave (kept only for buttons, check boxes, combo boxes, menus, menu items, radio buttons, sliders, spin boxes and split buttons), else none: then the step says what kind of control it is ("Click the text box.") and is flagged.
  It never writes typing or keys (a click capture records none) and never writes a result line.

A **chapter text** draft (`chapter-text`, format 16) is the opener of a chapter or the summary of its topics, written by the AI from the chapter's own text: `{ id, kind, nodeId, role, text, clues, madeAt, model }`.

- `nodeId`: the chapter for an opener, the topic that is to hold the summary for a summary; a draft for a node that is not there is dropped. `role`: `"opener"` or `"summary"` (any other value drops the draft). Only the newest draft for one node and role is kept.
- `text`: plain sentences, white space squeezed, at most 1200 letters, never empty. `clues`, `madeAt`, `model` are as for a sentence draft.

A **box** draft (`box`, format 16) is a suggested Tip, Note, Caution or other boxed note resting on a sentence the topic already says: `{ id, kind, nodeId, boxKind, text, evidence, clues, madeAt, model }`.

- `nodeId`: the topic. `boxKind`: one of the callout kinds a box can have (a draft with any other value is dropped). `text`: the note, at most 300 letters, never empty. `evidence`: the sentence from the topic's page the note rests on, at most 400 letters; accepting the draft puts the box right after the block that holds it (at the end of the page if that text has since been changed).
- Only the newest draft for one topic and one evidence sentence is kept.

A draft is **not part of the tree**, so no preview, no check of the text, no index and no export reads it. It becomes real only through `acceptDraft` (`src/project/drafts.ts`). A sentence draft's words replace the callout's `description`. A procedure draft is added as a new `procedure` block
at the end of the topic's page, each step with its picture and its `[[marks]]` made into control runs. An opener is added as a paragraph at the top of the chapter's page, a summary as a paragraph at the end of the page of the topic that holds it (a chapter's own page prints before its topics, so a summary goes on a topic). A box is added as a box block of the chosen kind after the text it rests on. In every case the draft is removed and nothing else changes; `rejectDraft` removes it. There is no way to accept every draft at once. Drafts are never in any export (help site, JSON with images,
Markdown, Word, PDF, guides). The saved project file keeps them.

`project.json` has `writingStyle` (format version 14): the author's notes about voice and wording, which the AI reads before every sentence. Plain text, line breaks kept, trailing spaces taken off, at most 2000 letters, left out while empty. The JSON export carries it (an AI outside the app may
read it) and a JSON import brings it back.

`project.json` has `avoidWords` (format version 16): the author's list of words and phrases the book should not use, each `{ avoid, use }`, with `use` the word to say instead (it may be empty). Text only, white space squeezed, at most 60 letters each, an empty `avoid` or one with `[[` or `]]` left out, each `avoid` once (capitals aside), at most 100 pairs, left out of the file while empty. It is a list the author types, not something an AI works out, and the book check reads it (`src/project/consistency.ts`; the notes it makes are never stored). The JSON export carries it.

The book check notes each waiting draft (`ai-draft`, a note, not a problem). Cleaned when a project is opened and saved (`cleanDrafts`, `cleanWritingStyle`, `cleanAvoidWords`). How the sentences are drafted, which words the model is given and how its answer is checked, is in `docs/local-ai-plan.md`.

**Opening an older project.** The page files and the drafts file of a save carry the version that save had, and they are compared with the version in the project's own files, not with the version the project is upgraded to. (Before 2026-10-22 they were compared with the upgraded version, so a project with
page text saved by an older program was refused with "do not match each other". That was a fault, and it is fixed; `tests/procedure-draft.test.ts` opens projects saved as formats 5, 8, 12 and 14.)

## Paper settings

`project.json` has `paper: { autoZoom }` (format version 12), choices about the printed book. `autoZoom` is `false` to begin with (and for any older project), so nothing changes until the author turns it on in
Zoom settings. When it is on, a picture that would print too small is shown zoomed in on its click **on paper** instead of whole. On paper means the print preview, the PDF and Word; the editor, the help site,
Markdown, JSON and the guides are not affected. A picture is switched only when all of these hold (`switchedForPaper` in `src/project/views.ts`): the setting is on; the picture has a click to zoom on; the author
gave it **no view of its own** (a crop or a zoom the author chose always wins); the whole picture would print below half its size on screen (`MIN_PRINT_SCALE`, with the print text width `PRINT_TEXT_WIDTH`); and the book's
zoom size really is narrower than the picture. A picture with no click stays whole (the book check still flags it). The picture's own record is never changed: `forPaper` makes a copy with a zoom view, and the
outputs use it. The zoom size is the book's (`zoom.book`). Cleaned when a project is opened and saved: only `true` turns it on.

## Short guides

`project.json` has `guides`, a list of short step-by-step guides: `{ id, name, tasks, layout, stepLayouts?, zoomFocus }`. A guide holds **no text of its own**. It is made of topics that are already in
the book, so material is written once: `tasks` is a list of topic ids (one topic is one task, in the order they appear in the guide), and the guide takes each task's numbered steps, with their pictures
and results, and its boxed notes, in page order. A topic's paragraphs, headings and pictures that are not on a step belong to the book and are not in the guide. The numbers of the steps are worked
out and start again at 1 for each numbered list, as in the book. Editing a topic changes the book and every guide made from it. Building a guide from a chapter just fills `tasks` with the chapter's
topics that have steps.

- `layout` is `"top"` (one picture across the page with the step's words below it) or `"left"` (the picture and its zoomed focus stacked on the left, with the words beside them). `stepLayouts` maps a
  step's id to the other layout for just that step; a step that follows the guide is not listed, and an entry that says what the guide already says is dropped.
- `zoomFocus` (true unless turned off): show a zoomed focus on the clicked spot with each step picture that has a click and no crop or zoom of its own (the author's own view is respected).
- In a guide each step's picture carries a numbered marker beside the clicked spot (the step's number). The marker is drawn from the click when the guide is shown, never stored, so it is not a mark on the
  picture. The click circle and the zoom size follow the quick-guide settings (`highlight.guide`, `zoom.guide`).
- A guide's name is at most 200 letters. Cleaned when a project is opened and saved (`cleanGuides` in `src/project/guides.ts`): the guides must be a list of objects with a known layout and a text id
  of letters, digits, `_` and `-` (anything else gets a new id, and two guides never share one); a task must be a topic that is in the book, once; a step layout must be a known layout. A task whose topic is
  removed from the book leaves its guides the next time the project is saved or opened.

## The click highlight

A transparent circle can be drawn on the spot of a click, so the reader sees where to click. It is never burned into a picture: it is drawn from the
stored click position, so it can be turned on, off or moved later without capturing again. (Drawing in the editor is in `src/project/highlight.ts`;
export will use the same rules.)

**The look, for each place a picture is used.** `project.json` has `highlight: { book, guide }`. Each is `{ show, size, color, seeThrough }`:

- `show`: whether the circle is drawn on pictures there. The starting look is off for `book` and on for `guide` (a quick guide).
- `size`: the circle's width across, as a percent of the picture's width (1 to 20, starting at 3), so it scales with the picture.
- `color`: six hex digits with a leading #, such as `#FFD600` (the starting yellow).
- `seeThrough`: how much shows through, in percent: 0 is a solid circle and 100 cannot be seen (0 to 100, starting at 40).

**One picture's own choices.** A picture may have `highlight: { show?, x?, y? }`. `show` `true` always draws the circle, `false` never does, and without
it the picture follows the project's setting for where it is used. `x` and `y` (both or neither, in picture pixels from the top left) put the circle
somewhere other than on the click. A picture with no `highlight` follows the project, and a picture with neither a click nor an `x` and `y` has no
circle to draw. The recorded `click` is never changed by moving the circle.

Both are cleaned every time a project is opened and saved: a missing or wrong part gets the starting look, numbers are kept in their range, and a
picture's `highlight` with nothing valid in it is dropped.

## Variables

`variables` in `project.json` maps a name to a value. Names are capital letters, digits and underscores. PRODUCT, VERSION and
COMPANY always exist and cannot be removed. Text uses `{{NAME}}`; export replaces it with the value, and leaves `{{NAME}}`
visible if the value is empty.

## Versions and migrations

`CURRENT_VERSION` is in `src/project/model.ts`. Every change to this format bumps it and adds a step in `src/project/migrate.ts`.
A project saved by a newer version is refused with a message asking the author to update.

## History

- Version 1: chapters, topics, status, variables.
- Version 2: every node can hold pictures. A version 1 project upgrades with empty picture lists.
- Version 16: `drafts.json` can hold two more kinds of draft, the opener or summary of a chapter (`chapter-text`) and a suggested boxed note (`box`), and the project keeps a list of words to avoid (`avoidWords`). A version 15 project upgrades with an empty list. A copy of OpenExplainer that only knows version 15 refuses a version 16 project, so it can never open one and drop the drafts or the list.
- Version 15: `drafts.json` can hold a second kind of draft, a numbered procedure made from a topic's click pictures. A version 14 project upgrades unchanged. A copy of OpenExplainer that only knows version 14 refuses a version 15 project, so it can never open one and drop the procedure drafts.
- Version 14: the project keeps writing-style notes for the AI (`writingStyle`), and AI drafts wait in their own file (`drafts.json`). A version 13 project upgrades with no notes and no drafts. A copy of OpenExplainer that only knows version 13 refuses a version 14 project, so it can never open one and save it without the drafts.
- Version 13: a topic can have index terms (`index`), and the index of the book is worked out from them. A version 12 project upgrades with none. A copy of OpenExplainer that only knows version 12 refuses a version 13 project, so it can never open one and save it without the terms.
- Version 12: the project keeps choices about the printed book (`paper`), with an automatic zoom for pictures that would print too small, off to begin with. A version 11 project upgrades with it off. A copy of OpenExplainer that only knows version 11 refuses a version 12 project, so it can never open one and save it without the choice.
- Version 11: the project can hold short step-by-step guides made from topics (`guides`). A version 10 project upgrades with none. A copy of OpenExplainer that only knows version 10 refuses a version 11 project, so it can never open one and save it without the guides.
- Version 10: the project keeps what the author chose to ignore in the book check (`checks`). A version 9 project upgrades ignoring nothing. A copy of OpenExplainer that only knows version 9 refuses a version 10 project, so it can never open one and save it without those choices.
- Version 9: a picture can have marks drawn on it (`shapes`), and the project keeps named styles (`styles`). A version 8 project upgrades with none. A copy of OpenExplainer that only knows version 8 refuses a version 9 project, so it can never open one and save it without the marks.
- Version 8: a page can have comments on its blocks, saved in the page's file. A version 7 project upgrades with none. A copy of OpenExplainer that only knows version 7 refuses a version 8 project, so it can never open one and save it without the comments.
- Version 7: a picture can have a view (cropped, or zoomed on the click), and the project keeps the zoom sizes (`zoom`). A version 6 project upgrades with the starting sizes and no views. A copy of OpenExplainer that only knows version 6 refuses a version 7 project, so it can never open one and save it without the views.
- Version 6: a picture can have lettered callouts. A version 5 project upgrades with none. A copy of OpenExplainer that only knows version 5 refuses a version 6 project, so it can never open one and save it without the callouts.
- Version 5: a topic can have a page, saved in its own file under `topics/`. A version 4 project upgrades with no pages. A copy of OpenExplainer that only knows version 4 refuses a version 5 project, so it can never open one and save it without the pages.
- Version 4: the project keeps the look of the click circle (`highlight`), and a picture can have its own choices about it. A version 3 project upgrades with the starting look. A copy of OpenExplainer that only knows version 3 refuses a version 4 project, so it can never open one and save it without the circle settings.
- Version 3: a picture can hold a click note. A version 2 project upgrades with nothing added. A copy of OpenExplainer that only knows version 2 refuses a version 3 project, so it can never open one and save it without the click notes.

## Coming in later steps

Picture views (full window, a cropped region, zoomed on the click), comments, annotation shapes stored beside
each picture (never burned in), styles, and export settings.
