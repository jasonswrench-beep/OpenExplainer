# OpenExplainer project format

Read this before touching anything that reads or writes a project. Change it in the same commit as the code.

## Layout

A saved project is ONE file named after the project, such as `Test1.openexplainer`. It is a standard zip package
(stored without compression, so pictures are not compressed twice), written and read by `src/project/zip.ts` and
`src/project/package.ts`. Any zip program can open it for inspection. Inside it, format version 6 holds two files, a page file for each topic that has a page, and a picture folder:

- `project.json`: `version`, `name`, `template`, `variables` (PRODUCT, VERSION, COMPANY and any others) and `highlight` (the look of the click circle, see "The click highlight").
- `structure.json`: `version` and `tree`, the chapters and topics.
- `topics/<topic id>.json`: the page of a topic, only for a topic that has something on its page (see "The page").
- `images/`: one file per picture, named `images/<picture id>.png` or `.jpg`. Only pictures a topic still uses are saved.

All of these carry the same `version`. If they differ, the project is refused, because they come from different saves.

## The tree

`tree` is a list of chapters. Each node is `{ id, title, status, pictures, children }`, and children are topics (and topics of topics).

- `id` is permanent. Everything else points at a node by its id, never by its number.
- Numbers (1, 1.2, 1.2.3) are never stored. They are worked out from position, so they cannot go stale.
- `status` is one of `not-started`, `captured`, `drafted`, `reviewed`, `needs-recheck`. Each has a word, a symbol and a color on screen; color is never the only signal.

## Pictures

Each node holds a list of pictures: `{ id, file, width, height, altText, source }`, and a picture may also have `click` (a click-by-click capture, see "Click notes") `highlight` (its own choices about the click circle, see "The click highlight") `callouts` (see "Lettered callouts") and `view` (see "Picture views").

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
- Version 8: a page can have comments on its blocks, saved in the page's file. A version 7 project upgrades with none. A copy of OpenExplainer that only knows version 7 refuses a version 8 project, so it can never open one and save it without the comments.
- Version 7: a picture can have a view (cropped, or zoomed on the click), and the project keeps the zoom sizes (`zoom`). A version 6 project upgrades with the starting sizes and no views. A copy of OpenExplainer that only knows version 6 refuses a version 7 project, so it can never open one and save it without the views.
- Version 6: a picture can have lettered callouts. A version 5 project upgrades with none. A copy of OpenExplainer that only knows version 5 refuses a version 6 project, so it can never open one and save it without the callouts.
- Version 5: a topic can have a page, saved in its own file under `topics/`. A version 4 project upgrades with no pages. A copy of OpenExplainer that only knows version 4 refuses a version 5 project, so it can never open one and save it without the pages.
- Version 4: the project keeps the look of the click circle (`highlight`), and a picture can have its own choices about it. A version 3 project upgrades with the starting look. A copy of OpenExplainer that only knows version 3 refuses a version 4 project, so it can never open one and save it without the circle settings.
- Version 3: a picture can hold a click note. A version 2 project upgrades with nothing added. A copy of OpenExplainer that only knows version 2 refuses a version 3 project, so it can never open one and save it without the click notes.

## Coming in later steps

Picture views (full window, a cropped region, zoomed on the click), comments, annotation shapes stored beside
each picture (never burned in), styles, and export settings.
