# The editor

The editor window has three panes: the chapters and topics on the left, the page in the middle, and the properties on the right. The
rules about what a page is are in `docs/format-spec.md` ("The page"); this file says what the editor does and what has been tried.

Status: the three panes and the block editor are built (Step 4, parts 2 and 3). Lettered callouts on pictures, picture views, comments, the
check tool and the print and help site previews are not built yet. See `docs/HANDOFF.md`.

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

## What has been tried

In the real window (a development build driven through its debugging port, with real key presses and clicks): the three panes side by side, each a
labelled region with a heading that names the topic; an empty page saying what to add; each kind of block added, typed into and given marks (a typed
control name showing in the preview, a mark with nothing selected explaining what to do); the order of blocks and of steps, Move up and Move down at the
ends, Delete with and without the question, and the announcements; the properties pane following the block that has the keyboard and what is typed in it;
F6 and Shift+F6 all the way round; a callout's kind changing the block's name, the properties and an announcement; a real picture captured and then offered
in the picture list and in a step's list, shown with its description, chosen for a block and a step; removing that picture taking its block off the page and
the step's picture away; and each topic keeping its own page when another is chosen and chosen again. The layout was looked at as a picture.

Not tried: saving a project with pages through the app's own Save and Open (the format has unit tests, including packing and unpacking and every way a page file
can be wrong); a screen reader; keyboard-only use start to finish by a person; many blocks (a page of 200); and print or help site output, which is not built.
