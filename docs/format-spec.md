# OpenExplainer project format

Read this before touching anything that reads or writes a project. Change it in the same commit as the code.

## Layout

A saved project is ONE file named after the project, such as `Test1.openexplainer`. It is a standard zip package
(stored without compression, so pictures are not compressed twice), written and read by `src/project/zip.ts` and
`src/project/package.ts`. Any zip program can open it for inspection. Inside it, format version 1 holds two files:

- `project.json`: `version`, `name`, `template`, `variables` (PRODUCT, VERSION, COMPANY and any others).
- `structure.json`: `version` and `tree`, the chapters and topics.

Both files carry the same `version`. If they differ, the project is refused, because they come from different saves.

## The tree

`tree` is a list of chapters. Each node is `{ id, title, status, children }`, and children are topics (and topics of topics).

- `id` is permanent. Everything else points at a node by its id, never by its number.
- Numbers (1, 1.2, 1.2.3) are never stored. They are worked out from position, so they cannot go stale.
- `status` is one of `not-started`, `captured`, `drafted`, `reviewed`, `needs-recheck`. Each has a word, a symbol and a color on screen; color is never the only signal.

## Versions and migrations

`CURRENT_VERSION` is in `src/project/model.ts`. Every change to this format bumps it and adds a step in `src/project/migrate.ts`.
A project saved by a newer version is refused with a message asking the author to update.

## Coming in later steps

Topic content in `topics/<id>.json` inside the package, pictures in `images/`, annotation shapes and click positions stored beside each picture
(never burned in), callout boxes, styles, and export settings.
