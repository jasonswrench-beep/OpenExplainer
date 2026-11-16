# Decision: should AI help be able to read pictures?

Written 2026-11-16, for Jason to decide. Item 4 of the development list names "the decision on a picture-reading model". It is open in `docs/local-ai-plan.md` (point 1 of the part 4 questions: "Words only for now", and the part 5 plan's "the model reading pictures as a separate later part").
Nothing was built or downloaded for it, because a choice like this should not be made by default.

## What it would be

The built-in model, Qwen 3.5, can read pictures too, but that needs a second file, `mmproj-*.gguf`, about **672 MB** more (the model is 2.7 GB today), under the same licence as the model (Apache 2.0, already audited for the model; the file would be audited on its own before it is added, as
the plan says for every weight). It is slower than words alone. Today every draft is written from **words**: the clicked item's name, kind and shortcut. That is why drafts say "needs a name" for a click on a text box or a list item, and why nothing visual ever leaves the PC, even with an own key.

## What reading pictures could do (each one a draft the author accepts, never an automatic change)

1. A **description** for a picture with none, the thing the book check flags most (alternative text, a legal duty for the author). 
2. A **name** for a clicked item Windows gave none (a text box, a list item), which words cannot do.
3. A check that a callout's rectangle really sits on what its name says.

## What it would cost, and the risks

- A **672 MB** second download, with the same progress, Resume, Cancel and fingerprint check as the first. Slower drafts on a PC without a good graphics card.
- A model that sees a picture can **say what is not there**, with a confident voice. For alternative text that matters: a wrong description is worse than none, and the person who needs it cannot check it. The words-only drafts are checked against the capture (a draft that names something not in the capture is refused); a picture has no such check.
- **Privacy.** With the built-in model a picture stays on the PC. With an own key a picture would go to a service: that needs its own "this picture will be sent" window, per picture, and I would not allow it by default.
- There is **no evidence yet** of how well this size of model reads software screens. Nobody has tried: that is a test to make before any code.

## The options

| | What happens | Cost |
| --- | --- | --- |
| **A. Words only (recommended for now)** | Nothing changes. Alternative text for pictures stays the author's own (the book check flags it, and the assistant tool `describe_picture` lets an assistant write one). | None. |
| **B. A local picture reader, off until asked** | A second download, a "Describe this picture" draft for one picture the author chooses, local only, never with an own key. First as a **test only**: try it on twenty real pictures of the guide and read what comes back, before any button exists. | About a week, plus the 672 MB. |
| **C. Pictures with an own key as well** | B, plus sending the picture to the chosen service after a per-picture window. | B, plus a privacy review. Not recommended before B has been judged on real pictures. |

**My recommendation: A now, and B as a test first** (download the file by hand on one PC, ask it about twenty pictures from the OpenStage guides, and keep it only if the descriptions are better than nothing and almost never wrong). If you say yes to the test, say so and I will write the script and the audit of the file.
