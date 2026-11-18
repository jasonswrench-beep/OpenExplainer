# Sending a guide to other OpenStage tools

Written 2026-11-16. Item 2 of the OpenExplainer development list: *Send a guide's steps to Author as a simulation and to Studio as a script.*

## To OpenStage Studio: done

**File, Send a guide to Studio...** (or Ctrl+K, "studio"; the `export_studio_script` tool for an assistant) makes a script file, `<guide name>.studio-script.json`, in Studio's own format
(`openstage-studio-script`, version 3: Studio's `docs/script-format.md` and `docs/accessibility-driver.md`). Studio's player performs each step in the real program and narrates it, so the same
task becomes a video. Nothing is changed in the book.

What each part of the guide becomes:

| In the guide | In the script |
| --- | --- |
| The guide's name | `title` (at most 100 characters) |
| A task (a topic) | A chapter of the video, on the task's first step |
| A numbered step's words | `narration`, as plain words: marks are dropped, a control name is just its words, the book's variables are filled in. A step with no words is `silent` |
| A step's result line ("The file is saved.") | `expect`, which is what Studio's rehearsal checks |
| A click on a button, menu or similar item | `click`, found by its kind and name (`fallback: {role, name}`, with Studio's own role words: `check box` is `checkbox`, `menu item` is `menuitem`), using Studio's accessibility driver, which needs no hook in the program |
| A step with no click, or a click on an item whose name is not kept (a text box, a list item, a tab, a link) | A one second `wait` that is only spoken, and counted in the notes. Studio can only click what it can find by name |
| A right-click or double-click | A click, and counted |

What only the author knows is asked for and never made up: **the program** (its name on the title card, and its version if known), **the demo project** the video starts from (a name in the program's demo library; a
path is refused, as Studio refuses it) and **the goal** (one line). A guide with no steps, more than 200 steps (Studio's limit) or a name over 100 characters is refused in words.

**Tried:** 8 tests in `tests/studio-script.test.ts`, including one that runs **Studio's own validator** (`validateScript` from its repository, when it sits beside this one) over a script made from a book with every kind of step:
no errors. (It found one fault while it was being written: a click found only by its place in the picture is not valid for Studio, so such a click is now spoken and counted, not written by place.)
`tests/mcp.test.ts` covers the assistant tool and what it refuses.

**Not tried:** opening the script in Studio and recording it (that needs a demo project of the real program); the dialog with a screen reader; Windows' Save window.

## To OpenStage Author as a simulation: waiting on the core

Author has no way to receive a list of still steps. Its format reserves a `simulation` block (`stepIndex`, `interaction`, `correctTarget`, `expectedText`, `feedback`, `attemptsAllowed`,
`mode` of `demo`, `practice` or `assessment`; `docs/format-spec.md` there, "Simulation") but marks it "Reserved in v0.1", and no part of Author reads steps from another tool. Writing Author's whole
project file from here would be reimplementing a format that is Author's, and a different way of writing it into every tool is exactly what C1's "send to" path is meant to end. So it is not built:
it is written as a request in `CORE-REQUESTS.md` (request 1), with what OpenExplainer can hand over (each step's words, picture, click place and size, the item's kind and name, the callouts, a result sentence)
and what Author's block needs (the clicked item's rectangle, a mode). The moment the core says how still steps travel, OpenExplainer writes them: the data is all in a guide already (`guideTasks` in `src/project/guides.ts`).

Until then an assistant can bridge the two with each program's own tools (OpenExplainer's `export_book` as JSON with pictures, Author's assistant server), and Studio can read the book directly (it already reads `.openexplainer` files).
