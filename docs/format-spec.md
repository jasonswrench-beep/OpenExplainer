# OpenExplainer project format

Read this before touching anything that reads or writes a project. Change it in the same commit as the code.

## Layout

A saved project is ONE file named after the project, such as `Test1.openexplainer`. It is a standard zip package
(stored without compression, so pictures are not compressed twice), written and read by `src/project/zip.ts` and
`src/project/package.ts`. Any zip program can open it for inspection. Inside it, format version 2 holds two files and a picture folder:

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

Each node holds a list of pictures: `{ id, file, width, height, altText, source }`.

- `file` is the path inside the package. `width` and `height` are in pixels.
- `altText` says what the picture shows. It is always asked for and never filled in silently. Empty means it still needs one, and the app shows it as "Needs a description".
- `source` is `{ kind, capturedAt, originalName? }`. `kind` is `import` for a picture brought in from a file and `window` for a capture of one window (`region` and `click` come with later capture steps). For `import`, `originalName` is the file's name. For `window`, it is the captured window's title. No format change was needed for this: the version stays 2.
- Only PNG and JPEG are accepted, so no other format can get into a project.
- Click positions and annotation shapes will be stored beside each picture and never burned into the file.
- If a listed picture file is missing from the package, the project still opens and the picture shows as missing.

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

## Coming in later steps

Topic content in `topics/<id>.json` inside the package, annotation shapes and click positions stored beside each picture
(never burned in), callout boxes, styles, and export settings.
