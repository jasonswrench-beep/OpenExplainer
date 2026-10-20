# OpenExplainer project format

Read this before touching anything that reads or writes a project. Change it in the same commit as the code.

## Layout

A saved project is ONE file named after the project, such as `Test1.openexplainer`. It is a standard zip package
(stored without compression, so pictures are not compressed twice), written and read by `src/project/zip.ts` and
`src/project/package.ts`. Any zip program can open it for inspection. Inside it, format version 3 holds two files and a picture folder:

- `project.json`: `version`, `name`, `template`, `variables` (PRODUCT, VERSION, COMPANY and any others).
- `structure.json`: `version` and `tree`, the chapters and topics.
- `images/`: one file per picture, named `images/<picture id>.png` or `.jpg`. Only pictures a topic still uses are saved.

Both files carry the same `version`. If they differ, the project is refused, because they come from different saves.

## The tree

`tree` is a list of chapters. Each node is `{ id, title, status, pictures, children }`, and children are topics (and topics of topics).

- `id` is permanent. Everything else points at a node by its id, never by its number.
- Numbers (1, 1.2, 1.2.3) are never stored. They are worked out from position, so they cannot go stale.
- `status` is one of `not-started`, `captured`, `drafted`, `reviewed`, `needs-recheck`. Each has a word, a symbol and a color on screen; color is never the only signal.

## Pictures

Each node holds a list of pictures: `{ id, file, width, height, altText, source }`, and a picture made by a click-by-click capture also has `click` (see "Click notes").

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
- Version 3: a picture can hold a click note. A version 2 project upgrades with nothing added. A copy of OpenExplainer that only knows version 2 refuses a version 3 project, so it can never open one and save it without the click notes.

## Coming in later steps

Topic content in `topics/<id>.json` inside the package, annotation shapes stored beside each picture
(never burned in), callout boxes, styles, and export settings.
