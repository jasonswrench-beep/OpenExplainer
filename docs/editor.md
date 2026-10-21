# The editor

The editor window has three panes: the chapters and topics on the left, the page in the middle, and the properties on the right. The
rules about what a page is are in `docs/format-spec.md` ("The page"); this file says what the editor does and what has been tried.

Status: the three panes, the block editor, the lettered callouts on pictures, the picture views and pointing at a picture with the mouse and the arrow keys are built
(Step 4, parts 2 to 7), comments on blocks, and the print and help site previews. The check tool is not built yet. See `docs/HANDOFF.md`.

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
- **Heading**: a one-line sub-heading.
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
  when there is room). The announcement says how many were made and that each needs a sentence.
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

Not tried: the previews, picture views and callouts with a screen reader, a book of 200 topics in the print preview (it draws the whole book each time), a view on a very small or very large picture by eye, and a callout on a very small or very large picture by eye; saving a project with pages through the app's own Save and Open (the format has unit tests, including packing and unpacking and every way a page file
can be wrong); a screen reader; keyboard-only use start to finish by a person; many blocks (a page of 200); and print or help site output, which is not built.
