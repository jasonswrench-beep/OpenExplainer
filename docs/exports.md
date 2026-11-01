# Exports

An export is made from the open project and never changes it. Each kind is saved as one file that the author chooses where to put (Export in the toolbar): a zip file, or for Word a single .docx file. The code is in `src/export/`;
the Export dialog is `src/export-dialog.ts`. Comments are working notes and are never in a help site or a Markdown export; the JSON export leaves them out unless the author ticks a box.

The book is exported as it prints: pictures use the book's click circle and zoom settings (`place: "book"`). The two outputs made for paper, Word and PDF, also apply the automatic zoom for print when the project
asks for it (see `docs/format-spec.md`, "Paper settings"): a picture that would print too small is made zoomed in on its click (`flattenPlaced(..., { paper: true })`). The help site, Markdown and JSON do not.

## Snippets and targets

Every output but JSON is made from the book as `expandOutput` (`src/project/snippets.ts`) gives it: each snippet block written out in place (the topics' own block ids and the snippet's, joined, so each is unique), and, for a target, everything that carries a condition the target hides left out (`docs/format-spec.md`, "Reuse"). A hidden topic is not in the contents, the index, the help site or the numbering: the topics after it are numbered as if it were not there. The Export window's **Make it for** and `export_book` with `target` choose the target; the previews have **Show the book for**. The JSON export is the whole book: the snippet blocks, the snippets, the conditions and the targets, so it can be imported back whole.

## The look

The fonts, accent colour, logo, title page, header and footer words and paper size in `project.look` (`docs/format-spec.md`, "The look of the outputs"; `docs/editor.md`, "Look of the book") reach every output from the same place. The print preview gets the fonts and accent as CSS variables on the book's wrapper, and the logo on the title page. The PDF's style sheet (`src/export/pdf-css.ts`) takes them: the page size, the fonts in place of Georgia and Segoe UI, the accent on headings, chapter numbers and links, the header words in the top margin of every page after the title page (all pages when there is no title page), and the footer words in the bottom left beside the centred page number. Word takes the fonts (every heading style, the contents heading and the text), the accent on headings and the Hyperlink style, the paper size, the header and footer parts, and the title page with the logo as a picture with its description. The help site's style sheet is the standard one followed by the look's choices: the accent for the header bar, links and headings, the fonts when some were chosen, and the logo as a decoration in the header and the footer words. A short guide uses the fonts, accent and paper size but has no title page or logo. The logo goes into an export as the file `images/logo.png` (or `.jpg`) next to the pictures; JSON and the project package carry it as the picture file the look names.

## Links between topics

A link in the text (format version 17, `docs/editor.md`, "Links between topics and See also") is written by `runsHtml` and the exporters from the topic's id, so it always goes to the topic as it is now: in the print preview and the PDF a link to the topic's heading (`href="#pv-topic-<id>"`) followed by `(4.2)`, and in a PDF `(4.2), page 31`: the pages are the same ones the contents uses, found by the same printing, and the first printing has stand-ins as wide as the real ones so nothing moves; in Word a link to the topic's heading (a bookmark numbered for every topic before the text is written, so a link can point forward) followed by `(4.2)`, with no page; on the help site a plain link to the topic's page, with no number; in Markdown the words followed by `(4.2)`; in a short guide only the words; in the JSON export the runs and each topic's `seeAlso` as they are. A topic's See also list is a short list of links with numbers under its page in the print preview, PDF, Word (a bold "See also" line and bullets), help site and Markdown (`**See also**` and a list). A link to a topic that is not in the book is only its words.

## The index

When any topic has index terms (see `docs/editor.md`, "The index"), every output made for reading has the index, worked out by `buildBookIndex` and written by the same code where it can be (`src/render/index-html.ts`):

- **Print preview and PDF**: an Index sheet after the last chapter, with a heading for each letter and the terms in two columns, and an Index entry at the end of the contents. In the preview each term lists the
  numbers of its topics as links. In the PDF it lists the **page numbers** of its topics (each page once, in order, linking to the first topic on it), found the same way as the contents' (the first printing has stand-in
  numbers, the links' named places are read from the PDF, and it is printed again): the index's own page is read from the named place `pv-index`.
- **Word**: an Index heading (Heading 1, on its own page, in the contents), a heading for each letter ("Index letter") and one "index 1" paragraph for each term, with the numbers of its topics as links to the topics'
  headings. Word's own page numbers are not used: only Word knows the pages, and the topic numbers are right as they are.
- **Help site**: `book-index.html`, a page like the others with the contents tree, linked as "Index" from the header of every page. Each term lists its topics by number and title, as links.
- **Markdown**: `## Index`, a `###` heading for each letter and a list item for each term with its topics' numbers and titles.
- **JSON**: each topic's `index` (its terms and which the software wrote), not the finished index, so an import gets the terms back.

A book with no terms has no index in any of them, and no contents entry for one.

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

## Guide (Word)

One short guide (chosen in the Export dialog; the choice is switched off, with the reason, when the project has no guides) as a single `.docx` file (`src/export/guide-docx.ts`). It shares the book's Word styles
(Title, Heading 1 and 2, Caption, the callout box styles, Control name), so a publisher can restyle both the same way, but it has no cover, no contents and no chapters:

- The guide's name is the Title at the top of the first page. Each task (a topic) is a Heading 1, and every task after the first starts a new page. Each step is a Heading 2 ("Step 3", numbered again from 1 for
  each numbered list, as in the book), then its picture, close-up and words in the step's layout. Boxed notes keep their kind in words and their coloured edge. Comments are never included.
- **Picture on top**: the picture across the page (6.5 inches at most), its callout entries as captions, the close-up centred under it (55 percent of the width), then the words and the result line.
- **Pictures on the left**: a table with two columns and no borders, the picture, its captions and its close-up stacked in the left one (2.7 inches) and the words in the right one. The table is kept in one
  piece, has a name ("Step 2") and says in its description that it is only layout. A step with no picture has no table.
- The pictures are made for this guide (`flattenGuide` in `src/export/pictures.ts`): one for each step, because it carries the step's number beside the clicked spot (a dark blue marker, 2.5 percent of the width shown in radius so
  it can still be read in the left column), and a close-up where the guide has one. They follow the quick-guide settings for the click circle and the zoom size. The description of a picture is its own, else the
  words of its step, and a close-up says it is a close-up. A picture whose file is missing or cannot be drawn is named after the export and is replaced by a sentence saying so.

Tried: the file was opened in the real Word (16.0) by automation, with a guide of two tasks, one step in each layout: it opened with no repair message, 6 pictures with their sizes and descriptions, 2 tables, the
header and the page number, and Word's own PDF of it was looked at page by page (the left layout puts the pictures left of the words, and the number on the clicked spot is large enough to read in the left column,
which a first try showed it was not). Not tried: LibreOffice, Word on a Mac, a screen reader.

## PDF (the book, and a guide)

A letter-size PDF made for paper (`src/export/pdf.ts`, `pdf-css.ts`, `pdf-make.ts`, `pdf-job.ts`, and the shell's `src-tauri/src/pdf.rs`). Choose **PDF** for the book or **Guide (PDF)** for one guide in the Export
dialog. It is made by the browser engine that already shows the app (WebView2, which is Chromium), asked to print a page, so the PDF has real text, real page breaks and:

- **Tags** for a screen reader (a structure tree, headings, lists, links and figures), the **language** (English) and the **title**, and a **bookmark for each heading**. A picture's alternative text is its
  description with its marks, as everywhere else.
- A **running header** (the book's or guide's name) and a **page number** in the margins, written as CSS page margin boxes. A book's title page has neither. Chapters start on a new page; a guide's tasks do.
- A **contents list with page numbers and dotted leaders** (a book). The page numbers are found by printing twice: the first printing has stand-in numbers of the same width, every contents entry links to its
  topic, and a PDF keeps the target of each link as a named place with its page, which `anchorPages` reads (the table of where each object is, the page list, the table of names). The second printing has the real
  numbers; if they moved anything, it prints again (at most four times). If the pages cannot be read out of the PDF, the contents is left without numbers, never with wrong ones, and the export says so.
- The pictures are the flat pictures (cut to the part shown, marks and callouts drawn in), put beside the page in a work folder; a guide's are made for each step, with the step's number beside the clicked spot and
  a close-up, as for Word. Pictures never split across pages, and a step with a picture is kept together where there is room. Printed width follows the print size rule (`PRINT_TEXT_WIDTH`).
- Comments and notes for the writer are never in it. The page that is printed allows no script and nothing from the network (a content security policy), and everything from the project is escaped, including the
  header, which is written as a CSS string.

**The shell part** (`src-tauri/src/pdf.rs`, the only Rust besides the capture code; Jason agreed to it on 2026-10-21). Three commands: `pdf_workspace` (a fresh folder in the PC's temporary folder, `openexplainer-pdf`),
`print_pdf(page, pdf, options)` and `pdf_workspace_remove`. `print_pdf` opens the page in a hidden window of its own that has no permission to use any of the app's commands, waits for it to load (and for fonts and
pictures), asks the browser engine for `Page.printToPDF` (the options are tagged PDF, a document outline, the page's own size and margins, and backgrounds), writes the file, and always closes the window. It
refuses a page outside the work folder, a file name that does not end in `.pdf`, and options that are not a JSON object; only one PDF is made at a time and a second is told so; everything has a three minute limit
(it runs on a background thread, so the app never freezes). The work folder is cleared away after each export and any leftover is cleared the next time. The Rust crates added are `webview2-com` (MIT) and `windows`
(MIT or Apache-2.0), which Tauri already uses, and `base64` (MIT or Apache-2.0), also already used by Tauri; `Check Licences.bat` was run before and after.

Tried in the real window: a 13-page book (three chapters, pictures with marks, a procedure, a box, 120 paragraphs) printed twice in about 1.5 seconds, every chapter and topic found on its page, the contents list
looked at (numbers right-aligned with leaders), the PDF read for its tags, language, bookmarks, headings, figures and alternative text, and a guide with both layouts looked at page by page. Refusals and the
one-at-a-time rule were exercised against the real shell. Not tried: a screen reader on the PDF, a desktop PDF program's accessibility checker (PAC or a desktop PDF program), a very long book, a book with unusual fonts. The fonts
are Georgia (body) and Segoe UI (headings) as installed on the PC, falling back to Times New Roman and Arial, and the PDF embeds what it used.

## Import from Word

Added 2026-11-01 (from the comparison with help-authoring programs, which all read an existing Word manual). **Import from Word** (a toolbar button) and the assistant tool `import_word` read a `.docx` file into chapters and topics added at the end of the open book (`src/import/docx.ts`; the adding is `src/import/apply.ts`). It changes no part of the project format: what comes in is ordinary topics, pages and pictures. A person is told what will come in and what will be left out and must agree before anything is added; the tool says the same in its answer. A file that is not a `.docx` (a zip that is not a Word file, an old `.doc`, a damaged file) is refused in words and the book is not changed.

- **Headings.** The top level of heading used in the file becomes chapters and the next level topics; deeper headings become sub-headings (a heading block) inside their topic. A heading is a "Heading 1" to "Heading 9" style, a style based on one, or a paragraph or style with an outline level. A file with one level of heading makes each heading a topic in one chapter named after the document; a file with no headings makes one topic. Text before the first heading goes in a chapter named after the document's title (or the file). A number the author typed at the start of the headings ("1 Saving", "1.2 Printing", as OpenExplainer's own Word export writes them) is removed when most headings have one, because the book numbers its own topics.
- **Words.** Bold, italic and a "Control name" character style become the book's marks. Links keep their words (not the address), inserted text is kept, deleted text is not, tabs and line breaks become spaces.
- **Lists.** Numbered paragraphs (by direct numbering or through a style) become one numbered procedure for each list; a "Step continued" paragraph beginning "Result:" becomes the step's result. Bulleted paragraphs become paragraphs that start with "• ".
- **Boxes.** The paragraph styles OpenExplainer writes ("Callout box, Caution" and so on) and styles named Note, Tip, Caution, Warning, Important or Danger become a boxed note of the nearest kind (Note and Tip are a Design Tip; Warning and Important a Caution); a word such as "Note." at the start is dropped.
- **Pictures.** PNG and JPEG pictures come in, with the description Word holds (the alt text), as pictures of the topic and picture blocks on its page; a picture shown twice in one topic is one picture. Other kinds (GIF, EMF, a drawing) are counted in the report.
- **Tables** become one line for each row, the cells divided by " | ". **Left out, and counted in the report:** a title page, contents list, index and picture notes of a file OpenExplainer made, the running header and footer (the look of the book sets those), comments, footnotes and endnotes.
- Every topic that comes in is marked **Drafted**, because the words came from a file made for another tool and have not been read by the author in this one.

A round trip (export Word, import it) gives back the same chapters, topics, words, steps, boxes and pictures; the tests check it (`tests/word-import.test.ts`).

## Still to come

The book index, a guide as a help site, and the printed look matched more closely to the reference how-to book. See `docs/HANDOFF.md`.
