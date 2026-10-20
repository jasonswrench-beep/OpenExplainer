# The editor

The editor window has three panes: the chapters and topics on the left, the page in the middle, and the properties on the right. The
rules about what a page is are in `docs/format-spec.md` ("The page"); this file says what the editor does and what has been tried.

Status: the three panes, the block editor and the lettered callouts on pictures are built (Step 4, parts 2, 3 and 4). Moving a callout with the mouse,
picture views, comments, the check tool and the print and help site previews are not built yet. See `docs/HANDOFF.md`.

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

Moving the marker or the outline with the mouse is not built yet; it is typed numbers for now (Jason's choice, mouse dragging later).

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

Not tried: callouts with a screen reader, and a callout on a very small or very large picture by eye; saving a project with pages through the app's own Save and Open (the format has unit tests, including packing and unpacking and every way a page file
can be wrong); a screen reader; keyboard-only use start to finish by a person; many blocks (a page of 200); and print or help site output, which is not built.
