# The editor

The editor window has three panes: the chapters and topics on the left, the page in the middle, and the properties on the right. The
rules about what a page is are in `docs/format-spec.md` ("The page"); this file says what the editor does and what has been tried.

Status: the three panes, the block editor, the lettered callouts on pictures, the picture views and pointing at a picture with the mouse and the arrow keys are built
(Step 4, parts 2 to 7), comments on blocks, the print and help site previews, the drawing marks of Step 5 and the book check. See `docs/HANDOFF.md`.

## The panes

- **Chapters and topics** (left): the tree and its buttons, as before. It stays in view while the page is scrolled.
- **Page** (middle): the page of the selected topic, then the list of the topic's pictures (import, capture, click circle settings).
- **Properties** (right): the selected topic (its number, title, how many pictures and blocks, and its status) and the block that has the keyboard (its
  kind, its position, a word count, the picture chosen, the kind of callout box). It also stays in view.
- **F6** moves to the next pane and **Shift+F6** to the one before, and the new pane is announced. Each pane is a labelled region. On a narrow window
  the panes stack one above the other.

## The block editor

Not a free-flowing word processor: every block is its own labelled box, so every part has a name a screen reader can say and can be reached with Tab.
A block is added after the block the keyboard was last in (or at the end), and the keyboard goes into its first box.

- **Paragraph**: a text box. Bold, Italic and Control name buttons put the marks round the selected words (`**bold**`, `*italic*`, `[[Control name]]`);
  the marks can also be typed. A preview under the box shows the result for eyes (it is hidden from a screen reader, which reads the box). With nothing
  selected a mark button says what to do. Spaces at the edges of the selection stay outside the markers.
- **Heading**: a one-line sub-heading. It is plain text: bold, italic and control name marks are not read in a heading, so typed there they print as they are (the box says so).
- **Picture**: a list of the topic's own pictures; the chosen one is shown with its description as its alternative text. With exactly one picture in the
  topic it is chosen already. A picture is only on the page where it is placed. A picture that is removed from the topic goes off the page.
- **Numbered procedure**: steps labelled "Step 1 of 3" and so on, each with the text of what to do, an optional picture, and an optional result line,
  and *Move step up*, *Move step down* and *Delete step*. *Add step* adds one at the end and puts the keyboard in it. The numbers follow the order.
- **Callout box**: a kind (Design Tip, Caution, Bright Idea, Power Tip, Time Saver, New in this version) and its text. The kind is in the block's name.

Every block has **Move up**, **Move down** and **Delete**. A button that cannot be used (the first block's Move up) is off, and the keyboard goes to the
other one. After a move the page says where the block is now; after a delete it says how many blocks are left and puts the keyboard on the next block.
Deleting a block or a step that has something in it asks first, and deleting an empty one does not.

Typing never redraws the page, so the keyboard is never taken from the box. The page is only drawn again when something that changes it happens: a block
is added, moved or deleted, another topic is chosen, or the topic's pictures or their descriptions change.

## Lettered callouts

The rules (what a callout is, how the letters, the marker place and the leader line are worked out, what is saved) are in `docs/format-spec.md`
("Lettered callouts") and `src/project/callouts.ts`. What the editor does:

- **Where they show.** On the thumbnail in the Pictures list, on a picture block and on a step's picture on the page, and in the sample in the Callouts
  dialog. Each is drawn over the picture, never into it: a thin red outline round the part, a leader line, and a red marker with a white letter. The
  drawing is hidden from a screen reader, which reads the entries instead (below), so nothing is shown by colour alone. The lines keep the same width at
  any size. The click circle, if the picture shows one, is drawn too, under the callouts (`src/picture-marks.ts`).
- **Entries.** Under a picture, one line for each callout: its letter, its name and its sentence, for example "A. Save: Saves your work." A missing name or
  sentence is said in words ("A. needs a name: needs a description.") and never hidden. The list is labelled "Callouts on this picture".
- **Made from the click.** When click pictures are added to a topic, each one that has an outline of the clicked item (and is not a password box) gets
  callout A by itself: the item's outline, its name when the name was kept, an empty sentence, and a marker just outside the item (above and to the left
  when there is room). When the click was on the window itself, or on a pane or a page that fills 40 percent or more of the picture (what Windows says when it
  cannot say more), an outline round all of that would cover the picture and say nothing, so the callout is a small box (5 percent of the picture's width, at
  least 40 pixels) round the click, with no name for the author to give (changed 2026-10-23; before, it covered the whole window). The announcement says how many were made and that each needs a sentence.
- **The Callouts dialog** (the **Callouts** button on each picture in the Pictures list). One group for each callout, named by its letter: its name, its
  sentence, six number boxes (the item's left, top, width and height, and the marker's across and down, in pixels from the picture's top left corner, with
  the picture's size said at the top), and the buttons **Place the marker for me**, **Move up**, **Move down** and **Delete**. Every control is named with
  its callout's letter, so a screen reader says which callout it belongs to. **Add a callout** adds one around the click (or the middle of the picture),
  and **Make a callout from the click** is on only when the clicked item has no callout yet, and says why when it is off. A sample of the picture with the
  callouts on it follows what is typed. A mistake (a word instead of a number, a number off the picture, an item reaching past the edge, a name or sentence
  over 300 letters) is explained next to the boxes, names the callout and the box, marks the box, and the dialog stays open. After a move or a delete the
  keyboard stays on a button of the same callout, or goes to Add a callout when none are left, and the change is said in words. Nothing is changed until
  **Save the callouts**; **Cancel** and Escape leave the callouts as they were.
- **Letters follow position.** A letter is never saved: moving a callout up or down, or deleting one, re-letters the others.

There is no limit on how many callouts a picture has (a test keeps 300; after Z the letters go AA, AB and on).

## Pointing at a picture

In the Callouts dialog and the Picture view dialog the sample picture can be pointed at, so an outline, a marker or a crop region can be placed by eye. The typed number
boxes stay as the exact record: everything done on the picture only fills them in, so the typed checks, the live sample and Cancel work as they always did, and
someone who cannot or does not want to use a mouse loses nothing. The rules (where a pointer is on the picture, drawing, moving, resizing, what a key means) are in
`src/pointing.ts`; the handles laid over the sample are `src/pointer-layer.ts`.

- **The callout being edited.** One callout at a time has handles on the sample: the one marked "selected on the picture" in its group's title (in words, not only
  a border). Putting the keyboard in a group selects it, Add a callout selects the new one, and pressing another callout's marker on the picture selects that one
  and puts the keyboard on its outline.
- **With the mouse.** Drag on an empty place to draw the outline (the marker is placed beside it). Drag the outline to move it (its marker comes with it, so the
  line keeps its shape). Drag a corner to resize it, the opposite corner staying still. Drag the marker to move only the marker. A click that is not a drag does
  nothing. Nothing can be put off the picture, and an outline cannot be made smaller than 4 pixels. **Escape during a drag** puts everything back and does not close
  the dialog.
- **With the keyboard.** The outline and the marker are two Tab stops on the sample, named "Item of callout A" and "Marker of callout A", with a spoken hint. An
  arrow key moves by 1 pixel and Shift with an arrow by 10; on the outline, Control with an arrow makes it wider or taller (Right or Down) or narrower or shorter
  (Left or Up), by 1 or, with Shift, by 10. After a pause the new place is said in words ("Item of callout A: starts 201 across and 210 down, 291 wide and 70 high.").
  The keys stop at the edge of the picture.
- **The crop.** In the Picture view dialog, choosing "A region I choose" puts the same handles on the sample for the region ("Region to show"), with a line of
  pointing help; choosing the whole picture or zoom takes them away. The sample dims everything outside the region.


## Picture views

The rules (what a view is, how a zoom is worked out, what is saved) are in `docs/format-spec.md` ("Picture views") and `src/project/views.ts`. The picture file is
never cut: a view only says which part of it is shown where it is used. What the editor does:

- **Where it shows.** The thumbnail in the Pictures list and the picture on the page (a picture block or a step's picture) show only the part chosen, in the
  shape of that part, with the click circle and the callouts laid over it so they line up (`pictureBox` in `src/picture-marks.ts`, using `shownPart`). Markers
  keep the same size on the screen whether a picture is whole or zoomed. A callout wholly outside the part shown is not drawn, and its entry says "(Outside the
  part of the picture that is shown.)" so nothing is hidden silently. A line under the picture says the view in words ("Picture view: cropped to 800 by 300
  pixels, starting 100 across and 300 down.").
- **The Picture view dialog** (the **Picture view** button on each picture). Three choices in one group, moved with the arrow keys: **The whole picture**, **A region
  I choose** (four boxes: how far across and down it starts, and its width and height, in pixels from the picture's top left corner, starting at the middle half)
  and **Zoomed in on the click** (off with a reason when the picture has no click). A sample of the whole picture shows the part that will be shown with the rest
  dimmed and a yellow outline, and a line of words says the same. A mistake in a box is explained next to the boxes, names the box, marks it and keeps the dialog
  open. Nothing changes until **Save the view**; **Cancel** and Escape leave the picture as it was. A zoom's own size is not set here but in Zoom settings.
- **Zoom settings** (the **Zoom settings** button beside Click circle settings). The width of a zoomed picture's part as a percent of the picture's width, 10 to
  100, one for the book (starting at 50) and one for a quick guide (starting at 40). They are project settings and apply to every picture set to zoom. The
  height keeps the picture's shape, the zoom is centred on the click and slides along an edge rather than shrinking.
- **Which place.** The choice *Show the pictures as in the* Book or Quick guide (above the picture list) now decides both whether the click circle shows and which
  zoom size is used, so the list and the page preview how the picture will look in that place.

The region can be typed or pointed at (see "Pointing at a picture").

## Comments

The rules (what a comment is, what is saved, how it is cleaned) are in `docs/format-spec.md` ("Comments") and `src/project/comments.ts`. A comment is a working note on a
block of a page: it is never put in a preview or an export. What the editor does:

- **A Comments button on every block**, next to Move up, Move down and Delete. It says how many comments are still open ("Comments (2 open)"), or that there are only
  resolved ones ("Comments (1 resolved)"), and is named for its block ("Comments (2 open), paragraph, block 1 of 3").
- **The Comments dialog.** It says which block it is for in a few words ("On this block: Paragraph: Press Save to keep your work safe on the disk and keep..."), gives
  the count in words, and lists the comments, open ones first, each titled in words ("Comment 1 of 2: open, written October 21, 2026" or "Comment 2 of 2: resolved
  October 21, 2026, written ..."), so a resolved comment is never shown by style alone. Each comment is a text box that can be reworded, with **Resolve** (or **Open it
  again**) and **Delete**. A new one is typed in the **New comment** box and added with **Add the comment**, which empties the box and keeps the keyboard there. Words left
  in that box when **Save the comments** is pressed are added too. An empty comment, one over 1000 letters, or an existing comment emptied by editing is explained next to
  the box (naming the comment), the box is marked and the dialog stays open. After a resolve or a delete the keyboard stays on that comment's button or goes to its
  neighbour, and each change is said in words. Nothing changes until Save; Cancel and Escape leave the comments as they were. The dialog says that comments are never put in
  the book or the help site.
- **Unresolved comments** (a button at the top of the page pane, with the count: "Unresolved comments (3)"). A dialog lists every open comment in the book in reading
  order (topic by its number, then block, then when written), each saying its topic and block, what the block is, when it was written and its words. **Resolve** takes
  it off the list and the keyboard stays on a Resolve button; **Go to the block** closes the dialog, selects the topic and puts the keyboard on that block's Comments
  button.
- **Properties.** The topic's part says "Open comments: 2 in this topic, 5 in the whole book."
- **Deleting a block** that has comments asks first, even if the block is empty, and says "Its 1 comment is deleted with it." Deleting an empty block with no comments still
  does not ask.

## The print preview and the help site preview

The middle pane has three tabs: **Edit**, **Print preview** and **Help site preview**. They are a tab list (the chosen tab is the only one in the Tab order; the Left and
Right arrows, Home and End move between them, wrapping round, choose the tab and keep the keyboard on it, and the change is announced). The preview shows in a panel named by
its tab, and the page is hidden while it shows (and drawn again, as it was, when Edit is chosen). The preview is real page content, not a picture, so a screen reader reads it,
and its region can be reached and scrolled by keyboard.

The pages are written as HTML text by `src/render/` (`html.ts` for the pieces, `print.ts` for the book, `help.ts` for a help page, `overlay.ts` for the drawing over a picture),
with no screen needed, so the preview and the exports (not built yet) are made by the same code and cannot drift apart. Everything from the project is escaped. A variable such as
`{{PRODUCT}}` is filled in from the project's variables, and stays visible when it has no value yet. Comments are never part of either preview. Pictures use the book's click circle
and zoom settings.

- **Print preview.** The whole book as sheets: a title page, a contents list (no page numbers, because those are made with the PDF), and each chapter on its own sheet with its
  number and an **In This Chapter** list, then the topics with numbered headings (a heading block is one level below its topic's), paragraphs with bold, italic and
  control names, numbered procedures with result lines and step pictures, callout boxes that say their kind in words and with a symbol, and pictures shown through their view with the
  circle and callouts over them and the callout entries under them (a callout wholly outside the part shown is left out of both, as in the editor). It is an approximation: real page
  breaks, running headers and page numbers wait for the PDF export, and the panel says so. A contents link jumps to that place and puts the keyboard there. The selected topic is
  scrolled into view when the preview is shown.
- **Notes for the writer.** Things to look at are listed above the preview ("2 notes for the writer (these are not part of the book)") and sit next to the picture they are about,
  marked as preview only (`data-preview-only`), each saying which topic: a picture whose writing will print too small ("about 33 percent of its size on screen"; the rule is that
  the writing in a picture shown across the 6.5 inch text width should stay above 50 percent, and a crop or zoom fixes it), a picture with no description, a callout that is
  outside the part shown, and a missing picture file. The design says the print layout switches to a crop or zoom when a full window would be too small; the preview only says so and
  leaves the choice to the writer. An export has no notes.
- **Help site preview.** One topic as a help page: the contents tree (the current topic marked with `aria-current`, in bold and underlined, and the tree named), breadcrumbs ending with
  the topic, the topic's title and blocks, a list of its topics when it has any, and Previous and Next links in reading order. A link opens that topic here (the tree follows) and puts
  the keyboard on the page that opened. Search, the index and the collapsible FAQ come with the export.

## Drawing marks

The rules (what a mark is, what is saved, the contrast rules, named styles) are in `docs/format-spec.md` ("Marks drawn on a picture", "Named styles") and `src/project/shapes.ts`,
`contrast.ts` and `styles.ts`. A mark is an **arrow**, a **text box**, a **rectangle** or a **numbered marker**, drawn over the picture and under the lettered callouts, never into it.
The **Drawing** button on each picture opens the Drawing dialog (`src/drawing-dialog.ts`):

- **Adding.** Four buttons: Add an arrow, a text box, a rectangle, a numbered marker. A new mark starts near the middle in the starting red, sized by the picture's width. A marker's label
  starts as the next number. Each mark is a group named "Mark 2: Text box", with the one being edited marked "(selected on the picture)" in words.
- **Boxes.** Every box says which mark it is for ("Tail: how far across, mark 1, arrow"). An arrow has a tail and a head (across and down) and a thickness; a text box has its words, its box,
  the height of its letters and three colours (fill, outline, text); a rectangle has its box, its outline and thickness and an optional fill with a see-through level; a marker has its place, a
  label of one to three letters or digits, a colour and a radius. A mistake is explained next to the box ("Type the color as six hex digits, such as C62828. "red" is not one."), names the
  mark, marks the box and keeps the dialog open. A text box says when its words do not fit and offers **Make the box tall enough**.
- **Pointing.** The sample picture shows the marks. The selected mark has handles: drag on an empty place to draw it again (an arrow is drawn from tail to head), drag a box to move it or a corner
  to resize it, drag an end of an arrow or a marker, or press another mark to select it. The arrow keys move a handle by 1 pixel (10 with Shift) and Control with an arrow resizes a box;
  Escape during a drag puts things back (the same handles as the Callouts and Picture view dialogs).
- **Colours and contrast.** Each colour is a list of ten swatches (Red, Orange, Yellow, Green, Blue, Purple, Black, White, Dark gray, Light gray; a fill can also be None), a code box and a small
  chip. As soon as a colour is chosen its contrast is shown in words, with a symbol so it is not colour alone: "✓ Text on its fill: 5.6 to 1, which meets the 4.5 to 1 minimum." or
  "⚠ Arrow against the picture behind it: about 2.6 to 1, which is below the 3.0 to 1 minimum (WCAG 2.2 AA). Choose colours that are further apart, or keep these if you mean to." A
  warning is announced. Text is compared with its fill (4.5 to 1); an arrow, an outline and a marker are compared with the picture behind them (3 to 1), an average of the picture's pixels under
  the mark read through a small canvas (`src/backdrop.ts`), so it says "about". It only ever warns. Saving a mark while it fails records `keptLowContrast`, for the accessibility check.
- **Alternative text.** Every mark has a box for it. An arrow or a rectangle with none says so under its boxes. The words of a text box and the labels of markers are added to the picture's
  description ("Marks: Arrow: Points at the Save button. Text box: "Press Save"."), in the editor's alternative text for a picture and in both previews.
- **Named styles.** In each mark's group: choose a named style and **Apply the style** (it copies the colours; the mark is not linked), or type a name and **Save these colors as a style**
  (a name nobody else has, capitals aside, up to 40 letters; a mistake is explained). A section lists the project's styles, each with its colours, its own contrast check and a Delete (marks that
  used its colours keep them).
- **Order.** Move towards the top or the bottom, and Delete, each saying the result in words and keeping the keyboard on that mark's button. Nothing changes until **Save the drawing**; Cancel and
  Escape leave the marks and the styles as they were.
- **Where it shows.** The picture list says "Drawing: 3 marks: 1 arrow, 1 text box and 1 rectangle. 1 still needs alternative text."; the thumbnail, the page and both previews draw the marks.
  The print preview adds notes for the writer about marks with no alternative text and colours below the minimum (saying when they were kept on purpose); it cannot read the picture behind a mark,
  so it leaves that check to the dialog.

## The book check

**Check the book** (a button beside Project variables) opens an optional check, and says so: nothing in it stops saving or exporting. The rules (`src/project/checks.ts`) work out what is
worth fixing from the project alone, in reading order. The dialog (`src/check-dialog.ts`) groups the things under **Accessibility** and **The book**, by kind, each in plain words with what
to do about it. What it finds:

- Accessibility: a picture on a page with no description; an arrow or a rectangle with no alternative text; a mark whose colours are too close (text on its fill under 4.5 to 1) or were kept
  with low contrast on purpose (the check cannot read the picture behind a mark, so the Drawing dialog does that and records the choice); a callout with no name or no sentence; and, as a
  note, a picture that will print too small to read (the same rule as the print preview).
- The book: a topic with nothing on its page; an empty block, or a step with no text; a picture whose file is missing from the project; a variable used in the book that has no value (it
  would print as `{{NAME}}`); and, as notes, a picture that is in a topic but not on its page, and a variable with a value that nothing uses (PRODUCT, VERSION and COMPANY are never listed as unused, because the title page prints them).
- Consistency notes (format version 16, no AI, `src/project/consistency.ts`), all notes: a control written between double square brackets that differs from the name the program showed when it was clicked (`[[Save as]]` where the program says "Save as..."); a step that starts with a verb that does not suit the kind of control (Press for a button, Click for a menu item); and a word or phrase from the
  **Words to avoid** list in the Writing style box (not inside a control name). They only look at controls the book has a click picture of, and each shows the exact words and where it is.
- A bigger book (2026-11-01, `src/project/book-checks.ts`, no AI): a topic with **no title** (a problem); and, as notes, topics **in one chapter with the same title** (an Overview in another chapter is not a copy), topics whose **pages say exactly the same words** (at least eight words; capitals, spaces and variables do not hide a match; the fix suggested is a snippet from Reuse), and, under Accessibility, **links whose words say nothing about where they go** ("here", "click here", "read more", "this page"; a screen reader user who goes through the links on their own hears only those words). Links to a topic that is not in the book, snippets that nothing uses, conditions that nothing carries, and pictures that are not on their page were already checked.
- Not checked, because the book cannot have them yet: skipped heading levels (headings are levelled by the tree) and tables.

For each thing: **Go to it** closes the check, selects the topic and puts the keyboard on the control that fixes it (Edit description, Drawing, Callouts, Picture view, a block, or the Project
variables dialog); **Ignore this**; and, when a kind has several things, **Ignore all N of these**. What is ignored moves to an **Ignored** list with **Stop ignoring**, and is saved with the
project (format version 10, `docs/format-spec.md` "The book check"). The summary says in words how many things there are to fix and how many are notes, and how many are ignored. After an
ignore the keyboard stays on the same place in the list (or goes to Close when none are left), and each change is announced.

## Export and import

**Export** (a toolbar button) opens a dialog: Help site, JSON with images, Markdown, Word, Word review copy, E-book (EPUB), PDF, Guide (Word) or Guide (PDF), each described in words, with a box for the working comments when JSON is chosen (off to begin with) and an optional
**Check the book first** button that opens the book check on top (the dialog says the check is optional and only advises; it also says how many unresolved comments there are). It then asks where to save a zip
file (a .docx file for Word), makes the export without changing the project, saves it, and says what was saved and anything that could not be included (a picture file that is missing or could not be drawn). **Import an export**
reads a JSON export back into a project (asking first if there are unsaved changes), as an unsaved project. **Import from Word** chooses a `.docx` file, reads it, and shows what will come in (chapters, topics, pictures) and what will be left out;
**Add them to the book** puts the chapters at the end of the open book, each topic marked Drafted, **Cancel** changes nothing, and a file that is not a Word file is refused in words (the dialogs close by keyboard and the result is announced). What it reads is in `docs/exports.md` ("Import from Word"). The formats are in `docs/exports.md`; the code is in `src/export/`, with `src/render/flatten.ts`
drawing each picture's marks into a PNG on a canvas.

## Guides

A **guide** is a few pages for one task, or for several (the quick, step-by-step handout, as opposed to the book). **Guides** (a toolbar button) opens a dialog to make, change and delete them; **Guide preview**
(a fourth tab next to Edit, Print preview and Help site preview, with a picker for which guide) shows one. The format and the rules are in `docs/format-spec.md` ("Short guides") and `src/project/guides.ts`.

- A guide holds **no text of its own**. It is a list of topics already in the book (a task each), a layout, and a few choices, so material is written once: editing a topic changes the book and every guide
  made from it. Deleting a guide deletes no topic and no picture. The guide takes each task's numbered steps (with their pictures and result lines) and its boxed notes, in page order; the topic's
  paragraphs, headings and loose pictures belong to the book and are not in the guide.
- The dialog: the guide list (with "2 tasks, 7 steps" in words), New guide, Delete this guide (asks first, and nothing is final until Save), and **Make a guide from a chapter** (the chapter's topics that have
  numbered steps become the tasks, and the chapter's name the guide's name). For the chosen guide: its name (it needs one, said in words), the layout, whether to show a zoomed close-up, the tasks (Move up, Move
  down, Remove, and an Add task list of the topics with steps that are not tasks yet) and, for every step, a choice between following the guide's layout and the other layout. Save keeps the changes and
  Cancel throws them away.
- Two layouts, per guide and per step. **Picture on top**: the picture across the page, a close-up under it, the words below. **Pictures on the left**: the picture and its close-up stacked on the left, the
  words beside them. Each step is a heading ("Step 3", numbered again from 1 for each numbered list, as in the book), its picture, its words and its result line.
- Each step picture has the **step's number beside the clicked spot** (a dark blue numbered marker, just above the spot and to its left, or below and to the right when the click is near the top or left edge, so the spot and what was clicked stay readable; changed 2026-10-23, before it sat on the spot and covered the button's label; drawn from the click when the guide is shown and never stored on the picture), where the click is in the part
  shown. The click circle and the zoom size follow the quick-guide settings. A **close-up** is the same picture zoomed in on the click, shown with a whole picture that has a click; a picture the author has
  cropped or zoomed, or one with no click, gets none, and the dialog can turn close-ups off for a guide. The close-up's description says it is a close-up.
- A picture with no description of its own takes the words of its step as its description (so every picture in a guide has one), and the preview's note about a missing description is not shown for it.
- A guide can be exported to Word or PDF: choose **Guide (Word)** or **Guide (PDF)** in the Export dialog (see `docs/exports.md`). The step number marker is 2.5 percent of the width shown in radius, so it can be read when a picture is small on the page.
- Not built yet: the third picture of the left layout (a step holds one picture today, so the left layout shows the picture and its close-up), exporting a guide as a help site, and book check rules for
  guides (a task whose topic has lost its steps shows a note for the writer in the preview).

## Reuse: snippets, conditions and targets

Format version 19 (2026-11-01, from the comparison with help-authoring programs: all three have snippets and conditions, and the book had only variables). **Reuse** (a toolbar button) opens one window for all three:

- **Snippets.** A snippet is a piece of a page you write once: a heading, a paragraph, a boxed note or a numbered procedure (no pictures). Choose or make one, give it a name, and write what it says in the box (blocks separated by a blank line; `# words` is a heading, `> Caution: words` a boxed note, `1. words` lines the steps of a procedure, a line `Result: words` after a step its result; the window says this and counts the blocks and the places that use the snippet). In a topic, **Snippet** (beside Paragraph, Heading and the others under Add to the page) adds a block with a list of the snippets; the words that will be written there are shown under it. Change the snippet and every topic that uses it changes, in the preview and in every output. Deleting a snippet keeps its words where it was used, as ordinary blocks.
- **Conditions.** A condition is a name for content that is only for some readers or versions, such as Administrators or Version 2. A list of boxes, one for each, with Add a condition and Remove.
- **Targets.** A target is a named output, such as Guide for students, with a tick box for each condition it hides.
- **Putting a condition on content.** Every block has a **Conditions** button (when the book has conditions) and a line saying which it carries; a topic has **Choose conditions for this topic** in its Properties. A step can carry conditions too, which an assistant sets (the page editor does not show them). An output made for a target that hides any of them leaves that block, step or topic out, with the topics under a topic.
- **Seeing a target.** When the book has targets, the print, help site and guide previews have **Show the book for**, and Export has **Make it for**. JSON always holds the whole book. Without a target nothing is left out.
- The window and the Conditions buttons work by keyboard alone; names that are empty or repeated are said in words before anything is kept; nothing changes until **Save** / **Keep these**. The book check notes snippets that nothing uses and conditions nothing carries.

## Translation: sending the words out and bringing them back

Format version 21 added the **language of the book**, a field in **Look of the book** (a code such as en, fr or pt-BR; the window says the language's name and warns in words if the code is not one). The PDF, Word file, e-book and help site say it, so a screen reader chooses its voice.

- **Export**, kind **Translation file (XLIFF)**: a field asks which language to translate into (a code; the dialog says its name, and will not go on with a code that is not one). It saves an `.xlf` file for a translation program.
- **Import a translation** (a toolbar button): chooses the returned file, shows how many pieces were translated and what was not (and what was wrong with the file), and after a question saves a **copy** of the book in the new language as a new project file you name. The book you have open is not changed; choose Open project to work on the copy.
- **Replace the picture file** (a button under each picture): chooses a PNG or JPEG of the **same size** and puts it in the place of the picture, keeping its description, callouts, marks and click. A file of another size is refused in words, with both sizes. Use it in the copy to show the translated program. The details are in `docs/exports.md` ("Translation").
- The dialogs close by keyboard alone; every result is announced.

## History: snapshots of the book

Format version 20 (2026-11-01, from the comparison with help-authoring programs: a help-authoring program keeps a full history; before this the program had no way back from a bad edit). **History** (a toolbar button) opens a window with a list box of the book's snapshots, oldest first, each with its name, whether you or the program took it, and when. A snapshot is a dated copy of the whole book kept inside the project file. The window has:

- **Take a snapshot now.** Asks for a name (empty: named from the date). The book keeps up to 20; at the limit the button is off and the window says to delete one.
- **Compare with the book now.** Lists, in words, what is different: topics added, removed and changed (title, status, place, words, pictures, links), and settings of the book. It is a second list box.
- **Restore the whole book** and **Restore the chosen topic** (from the comparison list; a topic that was added since cannot be restored). Each first asks a question that says what will be replaced and that the book as it is now is kept first as a snapshot called Before restoring "...", so a restore can be undone by restoring that one. A deleted topic is put back where it was.
- **Rename** and **Delete** (a question first; the book itself is not changed).
- Everything is done by keyboard; the lists are list boxes with labels, every result is said in a status line that is announced, and Esc or Close closes the window. The pictures a snapshot names are kept in the file, so the file grows with them.
- A snapshot is not an autosave: take one before a big change (a restructure, an import from Word, a review round). Nothing takes one by itself except a restore.

## Review round: a Word review copy

**Export**, kind **Word review copy**, makes the book as a Word document for reviewers: the author's open comments are real Word comments, a line at the top says it is a review copy, and every block and topic heading is tied to the book by a hidden bookmark. Reviewers add comments in Word and send the file back. **Bring in review comments** (a toolbar button) reads that file, says how many comments can be brought in and how many cannot be placed, and after a question adds each to the block it was made on as an open comment that starts with the reviewer's name (for example "Pat Reviewer: Which Save?"). A comment on a heading goes to the topic's first block. The words of the book never change; a comment already in the book is not added twice; the author's own comments coming back are left as they are. The comments are then worked through in the Comments list as before. The details are in `docs/exports.md`.

## Look of the book

Format version 18 (2026-11-01, from the comparison with help-authoring programs: they all have a way to give a book a house style). **Look of the book** (a toolbar button) sets, for the whole project: the **font of the text** and the **font of the headings**, an **accent colour**, a **logo**, whether the book **starts with a title page**, the **words at the top** of every page after the first and the **words at the bottom** beside the page number, and the **paper size** (Letter or A4). They are used by the print preview, the PDF, the Word file and the help site, so the book looks the same everywhere. Until the author chooses, each output keeps the look it always had.

- The accent colour is a list of dark ready-made colours or any six hex digits. A line under it says, in words and with a tick or a warning sign (never by colour alone), how readable the colour is as text on white. A colour that is too light is still used; the book check lists it as a problem to look at. The check only warns.
- **Choose a logo picture** opens the usual file window for a PNG or JPEG, asks what it shows (a screen reader reads that on the title page) and brings the window back. **Remove the logo** takes it off. The logo is on the title page and, as decoration beside the book's name, in the help site's header. A logo with no description is listed by the book check.
- The window works by keyboard alone (Tab, the arrow keys in the lists, Space, Enter, Escape). Nothing is kept until **Save**.
- An assistant sets the same things with `set_book_settings` (`look`) and `set_logo`.

## Links between topics and See also

Format version 17 (2026-11-01, from the comparison with help-authoring programs: a chapter move had broken typed references such as "topic 6.1"). Words in a paragraph, a boxed note or a step can **go to another topic**, and a topic can have a **See also** list.

- **Link to a topic** is a button beside Bold, Italic and Control name in every text box. It opens a window with every chapter and topic of the book, numbered, and a box that narrows the list by what is typed. Choose one and press **Link to this topic**: the selected words become the link (with nothing selected, the topic's title is used). The text box then holds `[words](#topic-id)`, which can also be typed. The link holds the topic itself, not its number, so it stays right when chapters move.
- **See also for this topic** is a box in a topic's Properties, with a list of the topics in it and a button **Choose See also topics**. The window has a tick box for each topic, the same narrowing box, and holds up to 12. Nothing changes until **Keep these topics**.
- Both windows work by keyboard alone: Tab to the list, the arrow keys and Space to choose, the buttons to keep, Escape to cancel. A screen reader hears the number and title of each topic, how many are shown, and how many are chosen.
- **Deleting a topic** says first how many links in the text will become plain words and how many See also entries will be taken off, and does exactly that. The book check lists any link or entry that goes nowhere.
- In the print preview and the PDF a link is followed by the topic's number in brackets, and in a PDF by `, page N`. Word adds the number. The help site just links. A short guide shows the words only. See `docs/exports.md`.

## The index

Jason's choice (2026-10-21): **the software writes the first pass of the index, the author edits it, and can update it.** Each topic keeps its own index terms (format version 13, see `docs/format-spec.md`,
"The book index"); the index of the book is worked out from them. It needs no AI.

- **In a topic's Properties**, a box **Index terms, one on each line** and a button **Suggest terms**. Suggest terms makes the first pass for the topic from the book itself (the topic's title, every control name written in its
  text, and the names of the callouts on the pictures that are on its page; the headings on its page are **not** terms, since a sub-heading is rarely something a reader looks up, changed 2026-10-23) and, the next time, brings in what is new. The author changes, adds or removes any line; the box
  keeps it when the author moves out of it and shows what was kept (blank lines, repeats and lines that cannot be a term, such as one with no letter or longer than 60 characters, are left out, and it says how many).
  The line under the box says how many terms the software proposed and how many the author wrote or changed. An update keeps the author's terms, does not bring back a term the author took out, keeps software terms
  the book still supports and drops software terms it no longer supports.
- **Index** (a toolbar button) opens the index of the whole book: a heading for each letter, each term once, with every topic it is in as a button that goes to that topic. A box filters the terms. **Update the
  index from the book** makes the first pass for every topic that has none and updates the rest, and says in words how many terms it added and took out. The terms themselves are edited in each topic's Properties.
- The index is in every output made for reading: the print preview and the PDF (an Index at the end and as the last entry of the contents; in the PDF each term has the **page numbers** of its topics, found
  as the contents' are), Word (an Index heading with a heading for each letter and "index 1" paragraphs whose topic numbers link to the topics, and a contents entry), the help site (an Index page linked from
  every page's header) and Markdown (an `## Index` list). The JSON export carries each topic's terms. A book with no terms has no index and no entry for one.

## Automatic zoom for print

**Zoom settings** (a button in Pictures) has, besides the zoom sizes for the book and for a quick guide, a box: **Zoom in on the click automatically when a picture would print too small**. It is **off to begin
with** (Jason's choice), so nothing changes until it is turned on. When it is on, the printed outputs (the print preview, the PDF and Word) show a picture that would print below half its size on screen zoomed
in on its click, at the book's zoom size, instead of whole. The author's own crop or zoom always wins, and a picture with no click stays whole. The print preview says so in a note for the writer ("Zoomed in on the
click for print..."), and the book check no longer calls such a picture too small (it still does for one with no click, and its advice mentions the setting for one that has a click). The editor, the help site, Markdown and
guides are not affected. The rules are `switchedForPaper` and `forPaper` in `src/project/views.ts` and the format is in `docs/format-spec.md` ("Paper settings").

## What has been tried

In the real window (a development build driven through its debugging port, with real key presses and clicks): the three panes side by side, each a
labelled region with a heading that names the topic; an empty page saying what to add; each kind of block added, typed into and given marks (a typed
control name showing in the preview, a mark with nothing selected explaining what to do); the order of blocks and of steps, Move up and Move down at the
ends, Delete with and without the question, and the announcements; the properties pane following the block that has the keyboard and what is typed in it;
F6 and Shift+F6 all the way round; a callout's kind changing the block's name, the properties and an announcement; a real picture captured and then offered
in the picture list and in a step's list, shown with its description, chosen for a block and a step; removing that picture taking its block off the page and
the step's picture away; and each topic keeping its own page when another is chosen and chosen again. The layout was looked at as a picture.

Lettered callouts, in the real window with real clicks on a made-up window: two click pictures each getting callout A by themselves, named by the click and
saying "needs a description"; the marker, outline and letter drawn on the thumbnail, on a picture block of the page and in the dialog sample (and looked at
as a picture, close up); the dialog opened by its button with the keyboard in the first name box; every control named with its callout's letter; typing a
sentence; a word, a number that is too big, and an outline past the edge each explained in words next to the boxes with the box marked and the dialog still
open; Add a callout, Move up and Move down (letters following the position and the keyboard staying with the button), Place the marker for me, Delete, and
the click button being off with its reason; Save updating the entry under the picture and on the page, being announced and returning the keyboard to the
button; Cancel and Escape changing nothing; deleting all callouts and making one again from the click; and a project with callouts packed, unpacked and read
by another program (the .NET zip reader) with no letters in the file.

Exports, in the real window: the Export dialog (three kinds each described, the keyboard on the first, the comments box only for JSON and off, the optional check opening on top and closing back to the dialog,
Cancel returning the keyboard); then, with a made-up book and a real picture, the canvas drawing both pictures (a whole picture at its own size and a cropped one cut to the part shown, the project's own file
untouched, the picture's pixels kept, a numbered marker with a white letter, a red text box with white words, a see-through yellow fill letting the block under it show, an arrow with its head and the
callout's marker and outline, and the result looked at); the help site as a zip (pages, assets and pictures, each page with a title, language, heading, its place in the tree, landmarks, pictures with
descriptions and sizes, real PNG files, no comment, every link going to a file that is there); the search script run over the real index (a callout's words found and the keyboard put on the results, a
variable's value found, no match said in words, an empty search closing the results); a JSON export read back into the same project; and the Markdown with its picture links. The native Save and Open file
dialogs were not driven (they cannot be automated safely), so saving the zip to a chosen place is for Jason to try. By keyboard alone: Tab through the Export dialog, the arrow keys between the kinds, Escape.

Guides, in the real window: a made-up book with a chapter whose first topic has three steps and a callout box, two real click pictures captured by real clicks on a stand-in window and given to the first two
steps, a second task of one step and a topic of only words. The Guides dialog with no guides (said in words, nothing to edit, the keyboard on New guide), a guide made from the chapter (named for it, the two
topics with steps as tasks and not the one with only words, every step listed with its words, picture on top and close-ups on to begin with), renaming as you type, the left layout, one step taking the other
layout, Move down (the keyboard goes to the other button when the task reaches the end, found and fixed by this test), Remove and Add, an empty name refused with the reason and the keyboard put in the name
box, Save, Cancel changing nothing, Delete asking first with the keyboard on Cancel; then the Guide preview: the picker, a title once and a sheet per task, the layouts as chosen, the step numbers
starting again, the numbers drawn beside the clicked spots, a close-up for each picture, the box with its kind in words, the book's own paragraphs left out, and (measured) the words beside the pictures in the
left layout and below them in the top layout. A picture of the preview was looked at. By keyboard alone: Enter on Guides, Tab through the dialog with no guides and with one (no trap), the arrow keys between
layouts, Space on the close-up box, Escape. Not tried: a screen reader.

A guide as Word, in the real window: the Export dialog with five kinds, the Guide (Word) choice switched off with the reason when there are no guides; then a made-up book with a guide of two tasks and real pictures drawn
by the real canvas (each step's picture and close-up with the step's number drawn on, checked by reading the pixel on the marker), built into a .docx, every XML part read by the browser's XML reader with no error. The real
Word opened it with no repair message (6 pictures, 2 tables, header and page number) and its PDF was looked at; that showed the number marker too small to read in the left column, so it was made larger. The native
Save dialog was not driven.

The index, in the real window: a chapter whose topic names controls and has a heading; the terms box empty and said so in words; Suggest terms filling it with the first pass and saying what it added; an edit
(a term taken out, one added, a blank, a repeat and a one-letter line) kept, with what was left out counted; an update not bringing back the term taken out and keeping the author's own; a new control name added by an
update; the Index dialog (the keyboard starts on the update button, a heading for each letter in alphabetical order, the whole-book update with its summary in words, the filter, no match said, Tab round the dialog
with no trap, each topic button naming where it goes and for which term, Escape closing and giving the keyboard back to the Index button, a topic button going to that topic). The Word file with an index was opened in the
real Word: it recognised the new styles (Index 1, Index letter), the Index heading and the contents entry, and its own Update Field gave the Index a page. The PDF's index page was drawn and looked at (two columns, letters,
page numbers) and its contents has the index's page. Not tried: a screen reader, and a book with hundreds of terms.

The automatic zoom for print, in the real window, with a real click picture (a whole screen, which prints small): the box in Zoom settings (described in words, off to begin with, Space turns it on, Escape closes
without saving and gives the keyboard back); with it off the print preview shows the picture whole; saved on, the print preview shows it zoomed on the click and says so in a note, the help site preview and the
editor still show it whole, and the book check does not call it small; turned off again it is whole again.

PDF, in the real window: the Export dialog with seven kinds, the guide choices switched off with the reason when there are no guides; then a made-up 13-page book and a two-task guide with real pictures drawn
by the real canvas, printed to PDF by the real shell, the pages drawn and looked at (title page without a header, the contents with page numbers and leaders, a chapter opener, a picture with its marks, both guide
layouts), every chapter and topic found on its page and in order, the file read for its structure tree, language, bookmarks, headings, figures and alternative text, and the shell's refusals (a page outside the work
folder, a name that is not .pdf, bad options, a second PDF at the same time). The native Save dialog was not driven, so saving to a chosen place is for Jason to try by hand.

Word, in the real window: the Export dialog with four kinds and Word described and tied to its radio button, the Down arrow moving to Word and keeping the JSON comments box hidden; then a made-up book with two real
pictures (one whole, one cropped) built into a .docx by the program's own code, every XML part read by the browser's own XML reader with no error, and the file saved. The real Word (16.0, in its own hidden copy, never
touching Jason's windows) opened it with no repair message, recognised the styles, numbered the steps 1, 2, 3 and then 1, 2, kept both pictures with their sizes and alternative text, found the table of contents field
and filled in page numbers when it updated it; the PDF Word saved from it was looked at page by page. That showed a step's words left alone on one page with its picture on the next, so a step with a picture now stays with
it. The native Save dialog was not driven, so saving the .docx to a chosen place is for Jason to try by hand.

The book check, in the real window with a chapter holding an empty topic and a topic with an empty heading, an empty callout box, a variable with no value and a click picture with a callout and
no description: the check opened by its button, saying it is optional and only advises; an Accessibility part and a Book part; the summary in words; an empty topic, an empty heading block, a
variable used with no value, a picture with no description, a callout with no sentence and a picture too small for paper each listed with a reason and what to do; every button saying which thing
it is for; Ignore this moving a thing to the Ignored list, the summary following, announcing it and marking the project as changed; Stop ignoring bringing it back and putting the keyboard on
Close; Ignore all N of these for a kind with several things (and no such button for a kind with one); Go to it selecting the topic and putting the keyboard on Edit description for that picture;
the choices still in place when the check is opened again; a variable going to the Project variables dialog; and Escape closing it. By keyboard alone: Tab reaching every control and never
leaving the dialog, and Escape giving the keyboard back.

The Drawing dialog, in the real window on a click picture of a made-up window, with a real mouse and real key presses: an empty dialog offering four Add buttons with the keyboard on the first and
saying contrast is only a warning; adding an arrow (selected, a handle at each end, named for a screen reader, every control named and saying which mark); drawing the arrow on an empty place from
tail to head; dragging its head and moving it 10 pixels with Shift and an arrow; its contrast against the picture shown with a symbol; yellow on the light window warned in plain words and announced;
black passing; a colour that is not one explained with the dialog kept open; the alternative-text reminder going once it is written; a text box (words, a red fill with white letters passing at 5.6 to 1,
colours too close warned, words that do not fit and Make the box tall enough); a named style saved (an empty name and a taken name explained), listed with its own contrast and applied by copying to a
rectangle; a numbered marker dragged to a place and a label that is too long explained; Move towards the bottom renumbering and Delete counting what is left; Save updating the picture list, the thumbnail
and announcing; reopening bringing the marks and the style back; Cancel and Escape changing nothing; and the print preview drawing the marks and describing them. By keyboard alone: Tab reaching every
control and never leaving the dialog (with no marks, an arrow, and a text box), and Escape giving the keyboard back. The pictures were looked at.

The previews, in the real window with a chapter, a topic with a heading, a procedure, a callout box and a click picture with a callout, and a comment: three tabs with only the chosen one
in the Tab order; the Right arrow choosing Print preview and keeping the keyboard on the tab, the panel named by its tab, and it announced; the preview being a named region the
keyboard can reach; the approximation said in words; the title page, the contents (chapter and topic by number), the chapter opener with its number and In This Chapter list, the
chapter's own paragraph with a control name in bold and an unfilled variable left visible, the topic's numbered heading and a heading block one level below, a numbered procedure, a
callout box saying "Design Tip", and the picture loaded with its marker (hidden from a screen reader) and its entry under it (a second stray "A." found and fixed from the first look at it);
the notes listed with where they are and also next to the picture; the comment's words not in the preview; a contents link jumping and focusing; a zoom set in Picture view being used
by the preview (half the width, no small-on-paper note); words typed in Edit being in the preview when it is shown again; the Right arrow moving on to Help site preview; the tree marking
the current topic and the breadcrumbs ending with it; the Previous link opening the chapter (the tree followed, the keyboard on the page, announced) and a link in its section list
opening the topic; and Home and the Left arrow going back to Edit and wrapping round. The pictures were looked at.

Comments, in the real window: every block with a Comments button named for its block; the dialog saying which block, an empty comment explained with the box marked, adding
two comments (the box emptied, the keyboard kept there, the count said in words and announced), resolving one (it goes below the open ones, says "resolved" in words and the
keyboard follows its button), opening it again, a comment emptied by editing explained with the dialog kept open, Save updating the button ("Comments (1 open)"),
announcing and putting the keyboard back on the button, Cancel after deleting changing nothing, words left in the new comment box added by Save, and a comment on a heading;
the properties line and the page button counting the whole book across two chapters; the Unresolved comments list in reading order with each one's topic and block, Resolve
from the list, and Go to selecting the topic and focusing that block's Comments button; and deleting a block with a comment asking and saying the comment goes too, an empty
block with no comment not asking, and an empty block with a comment asking. By keyboard alone: Enter on the Comments button and the Unresolved comments button, Tab reaching
every control and never leaving either dialog, and Escape closing each and giving the keyboard back.

Pointing, in the real window with a real mouse and real key presses (sent through the browser's own input channel) on a click picture: the handles on the sample named
for a screen reader with their hint; dragging the outline (the marker came along and the handle sat where the numbers said), the marker alone, a corner, and an empty
place to draw a new outline with the marker placed beside it; a click that is not a drag changing nothing; Escape during a drag putting everything back with the dialog
still open; typing in a number box moving the handle; arrow keys, Shift and Control moving and resizing the outline and moving the marker, stopping at the picture's
edge, with the new place said after a pause; Add a callout selecting the new one and pressing callout A's marker selecting A; Cancel changing nothing and Save keeping
what was pointed at. The same for the crop region in the Picture view dialog (move, corner, draw, keys, Escape, typing, handles going away for zoom, and Save). The
pictures were looked at.

Picture views, in the real window with real clicks on a made-up window: a click picture shown whole to begin with; the Picture view dialog opened by its button with the
keyboard on the chosen choice and every control named; a region typed (a word, a number too big and a region past the edge each explained next to the boxes and
the box marked), the summary following what is typed, the sample dimming the rest; Save showing only the region on the thumbnail (its shape, and the drawing
looking at the same part) and on a picture block of the page, said in words and announced; callout A inside the region drawn, and outside it not drawn with
its entry saying so; zoom centred on the click at the book's size, then the Zoom settings dialog (a word, a number too small, 25 and 60 saved), the zoomed picture
following the new size and the Quick guide preview using the quick guide's; Cancel and Escape changing nothing; and back to the whole picture. The pictures
were looked at (a cropped page picture close up and the dialog sample). By keyboard alone: Tab reaching every control and never leaving the Picture view, Zoom
settings and Callouts dialogs, the arrow keys moving through the three view choices, and Escape closing each and giving the keyboard back. That keyboard run found
and fixed a real fault: the four region boxes were still on the screen and in the Tab order while "whole picture" was chosen (a style rule overrode the hidden
attribute), so `[hidden]` now always hides.

Not tried: the Drawing dialog with a screen reader (it has about 90 controls with three marks, so it needs a person's judgement), picture views and callouts with a screen reader, a book of 200 topics in the print preview (it draws the whole book each time), a view on a very small or very large picture by eye, and a callout on a very small or very large picture by eye; saving a project with pages through the app's own Save and Open (the format has unit tests, including packing and unpacking and every way a page file
can be wrong); a screen reader; keyboard-only use start to finish by a person; many blocks (a page of 200); and print or help site output, which is not built.

## Drafts and writing style

All of this is optional; everything works by hand with no AI. **Writing style** (beside Project variables) opens a box for notes about how the book should read (up to 2000 letters); the AI reads them before it writes a sentence. Beneath it is a second box, **Words to avoid**: one word or phrase on each line with what to say instead after an arrow
(`file => document`, or just `file`). Check the book then lists each place the book uses one, as a note. It is a plain list that works with AI help off, and it does not look inside control names.

**Draft callout text** (on each picture that has callouts, and for the selected topic) asks the built-in model for a one-sentence explanation of each callout that has none. It needs AI help set to the built-in model and the model downloaded; if not, it says so. A callout is drafted only if there is something real to write from (a real name, or a description Windows gave);
the others are named in the report and left alone.

**Draft a procedure from the clicks** (in Pictures, for the selected topic) needs no AI. It makes one numbered step for each click picture of the topic that is not already in a step, in the order of the pictures, from what the click recorded: "Click Save.", "Choose Save as.", "Tick Remember me.", "Open the File menu." The control's name is the name of your callout
on it, or else the name Windows gave (Windows keeps a name only for buttons, check boxes, combo boxes, menus, menu items, radio buttons, sliders, spin boxes and split buttons). A step with no name says what kind of control it is ("Click the text box.") and is flagged so you can add the name. It never writes typing or key presses (a capture does not record them) or what happens next.

**Draft an opener for this chapter** and **Draft a chapter summary here** (the two buttons above the page) ask the built-in model to write from the text of the chapter's own topics. Select a chapter for the opener (two or three sentences, which Accept adds as the first paragraph of the chapter's page). Select a topic for the summary, such as a last topic called Summary
(three to five short sentences stating what the other topics say; Accept adds a paragraph at the end of that topic's page; a chapter's own page prints before its topics, so a summary does not go on the chapter). The model is given only the words of the book and your writing-style notes, never a picture. An answer that is a list, has quotation marks, names something not in the chapter, or is a summary that says "you will learn" is thrown away and tried once more.
Read what it writes: it can describe how to do a step when it should only name the task, and it can turn a step into a rule.

**Suggest boxed notes for this topic** (the third button above the page) asks the built-in model to point at up to three sentences in the topic's paragraphs that a reader could easily miss, and to write a short boxed note for each, such as "Choosing Do not save causes your unsaved changes to be lost." Each suggestion rests on a sentence the topic already says, and the list shows that sentence beside the note so you can compare them.
The program checks that the sentence is really in the topic, so a box cannot be made up, but the model can still say a little more or less than the sentence does, so read each one. The kind is a Caution when the sentence says work can be lost, replaced or deleted; otherwise it is the model's guess (a Design Tip, unless it chose another tip), and you choose the kind in the list. Accept puts the box right after the paragraph it rests on.

The drafts wait in **Drafts (n waiting)**. For each one you see where it is and who made it; a sentence shows the sentence now, an editable draft and a fold-out of what the AI was given; a procedure shows each step in its own box with its picture number, what it was made from, and a flag on a step with no name; an opener or summary shows where it will go and its words in an editable box. **Accept** makes the sentence the callout's sentence, adds the numbered procedure to the end
of the topic's page with each step's picture, or adds the opener or summary as a paragraph; **Reject** throws it away; **Go to the picture** (or topic) takes you there. Nothing is accepted for you and drafts are in no preview or export. Keyboard: Tab through the entries, Enter on a button; after Accept or Reject the keyboard moves to the next entry; Escape closes the list. See `docs/local-ai-plan.md` and `docs/format-spec.md`.
