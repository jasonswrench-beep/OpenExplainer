# Exports

An export is made from the open project and never changes it. Each kind is saved as one file that the author chooses where to put (Export in the toolbar): a zip file, or for Word a single .docx file. The code is in `src/export/`;
the Export dialog is `src/export-dialog.ts`. Comments are working notes and are never in a help site or a Markdown export; the JSON export leaves them out unless the author ticks a box.

The book is exported as it prints: pictures use the book's click circle and zoom settings (`place: "book"`).

## Pictures with their marks drawn in

The project keeps each picture as it was captured, with the click circle, the callouts and the marks stored beside it. An output that cannot lay a drawing over a picture (a help site that must
open anywhere, a Markdown file, and later Word) gets **flat pictures**: for each picture that is on a page, a PNG of the part that is shown (its crop or zoom) at the picture's own resolution, with
the click circle, the marks and the callouts drawn in from the same shapes the editor uses (`src/render/overlay.ts`, drawn onto a canvas by `src/render/flatten.ts`). They are named
`images/<picture id>.png`. A picture whose file is missing, or that cannot be drawn, is named for the author after the export and is left out (its page says the file is missing). A picture that is in
a topic but not on its page is not in the book and is not exported.

## Help site

A folder of web pages (a zip to unzip): one page for each topic, named from its number and title (`2-1-saving-your-work.html`), `index.html` (the first topic), `assets/site.css`, `assets/site.js`,
`assets/search-index.js` and `images/`. Each page is a complete HTML document (`lang="en"`, a title of the topic and the book) with a skip link, a header with the book's name and a search box, the contents
tree (the current topic marked with `aria-current`), breadcrumbs, the topic (headings, paragraphs, numbered procedures with their pictures and results, callout boxes that say their kind in words and with a
symbol, pictures with their descriptions and callout entries), a list of the topics under it, Previous and Next links, and a Print this page button. Links between pages are ordinary links to files, so the
site works with no script. The pages are made by the same code as the help site preview (`src/render/help.ts`, `html.ts`).

The only script is `assets/site.js`: search and the Print this page button. The search index is a script (`window.SEARCH_INDEX = [...]`) rather than a JSON file, so search also works when the pages are opened
straight from a folder, where a browser will not fetch a JSON file. It finds every word typed (in the title, the number or the text of a topic, including the entries under pictures, with variables filled in),
ranks title matches first, shows each hit with a snippet, says in words how many topics match and puts the keyboard on the results. Colours meet WCAG 2.2 AA (`tests/export.test.ts` checks them), every
control has a visible focus outline, and printing hides the navigation. Not built: the book index, the collapsible FAQ (there is no FAQ content yet), and a check of the finished site by a screen reader.

## JSON with images

A zip holding `book.json` and `images/` (the project's own picture files, not flattened). For another program or an AI assistant to read, and it can be imported back (Import an export). `book.json`:

- `format: "openexplainer-export"`, `exportVersion` (1; changes when the layout changes in a way a reader would notice), `projectVersion` (the project format it was made from), optionally `exportedAt`.
- `name`, `template`, `variables`, `highlight` (the click circle settings), `zoom`, `styles`.
- `tree`: the chapters and topics, each `{ id, number, title, status, page?, pictures, children }`. `number` is informational (worked out again on import). `page` is `{ blocks, comments? }` as in
  `docs/format-spec.md` ("The page"); `comments` only when asked for. `pictures` are the picture records (`docs/format-spec.md`: click notes, callouts, marks, views, circle choices).

**Importing.** An export is read back by turning it into the same files a saved project is made from and opening those, so it goes through the same upgrading and cleaning: a block of an unknown kind, a colour
that is not one, a mark off the picture and so on are put right or dropped. An export that has no `book.json`, is damaged, is not one, or was made by a newer export format is refused in plain words and nothing
is changed. The imported project replaces the open one after the author agrees to lose unsaved changes, and counts as unsaved until it is saved. Picture files that were not in the export are reported.

## Markdown

A zip holding `book.md` and `images/` (the flat pictures). The book title is a `#` heading, then a contents list, then each chapter as `##`, each topic one level deeper (to `######`), and a page's own
headings one level below their topic's. Paragraphs keep bold, italic and control names (control names as bold). A numbered procedure is a numbered list with its pictures indented under their step and its result
as "*Result:* ...". A callout box is a quotation (`> **Caution.** ...`). A picture is `![description with its marks](images/<id>.png)` with its callout entries as a list under it. Everything from the project is
escaped so it reads as text, not as Markdown (`*`, `_`, `` ` ``, `[`, `]`, `<`, and a `#`, `-`, `+`, `>` or `1.` at the start of a line), and variables are filled in.

## Word

One `.docx` file (`src/export/docx.ts`), made in TypeScript from the flat pictures. Nothing is sent anywhere and Word is not needed to make it. A `.docx` is itself a zip of XML parts, so it needs no zip to be unpacked.
It is meant to be edited and restyled, so everything is a real Word style rather than hand-made formatting:

- **Title page**: the book's name (Title), then the PRODUCT, VERSION and COMPANY variables where they have a value (Subtitle).
- **Contents**: Word's own table of contents field (`TOC \o "1-3" \h \z \u`) already holding the entries, each linked to its heading. There are no page numbers yet because only Word knows where the pages break:
  in Word, right-click the contents and choose Update Field to add them.
- **Headings**: a chapter is Heading 1 and starts a new page, each topic is one level deeper (to Heading 6), and a heading inside a page is one level below its topic, so the navigation pane and a contents list work.
  Chapters that have topics open with an "In This Chapter" list.
- **Steps**: a numbered list in the Step style. Each procedure has its own list, so each starts again at 1. A step's picture goes under it, indented (and kept on the same page as the step), then its result as "Result:".
- **Pictures**: inline, the flat PNG (cut to the part shown, marks drawn in), no wider than 6.5 inches (6 inches under a step), keeping their shape. The picture's description, with its marks, is the alternative text.
  A picture's callout entries follow it as Caption paragraphs ("A. Save: Saves your work.").
- **Callout boxes**: one style for each kind, named in words (such as "Callout box, Caution"), with a coloured left edge and a light fill. The kind is also written in the box, so it is never colour alone.
  The edge colours meet 3:1 against the fill (a test checks it).
- **Other styles**: Contents heading, Contents 1 to 3 (Word's own TOC 1 to 3), Chapter opener, List Bullet, Step continued, Caption, Control name (a character style for control names), Hyperlink, Header and Footer.
  Changing a style changes the whole book.
- A running header with the book's name, a page number field in the footer, the language set to English and the book's name in the document properties. Comments are never included. A picture that could not be made is
  replaced by an italic sentence saying so.
- Text that Word cannot hold (control characters) is dropped, and `&`, `<`, `>` and quotes are escaped, so no title or sentence can break the file (a test builds one with all of them).

Tried: the file was opened in the real Word (16.0) by automation, in its own hidden copy: it opened with no repair message, every style was recognised (Heading 1 to 3, TOC 1 and 2, Subtitle, the box styles), the steps
numbered 1, 2, 3 and then 1, 2, the pictures had their sizes and alternative text, the contents field was recognised and Word's own Update Field added the page numbers, and Word saved it to a PDF that was looked at.
Not tried yet: LibreOffice, Word on a Mac, Word's own accessibility checker, and a screen reader on the result.

## Still to come

Book PDF (tagged, with a contents list, running headers and page numbers), the short guides, the choice to switch a picture to a crop or zoom automatically when it would print too small,
and the book index. See `docs/HANDOFF.md`.
