# Your own key for a hosted AI service, and the assistant's draft tool

Written 2026-11-16. Item 4 of the OpenExplainer development list: *bring-your-own key, the assistant's draft tool, and the decision on a picture-reading model.* These are parts 7 and 8 of `docs/local-ai-plan.md`.
AI stays optional: with **No AI** chosen (how OpenExplainer starts) nothing is drafted and nothing is sent anywhere, and every feature works by hand.

## Part 7: My own key

**AI help, My own key for a hosted AI service.** The author chooses one of three services, names a model, pastes a key and saves it. The three are OpenAI, Anthropic and Google.
A key is made on the service's own developer pages; it is not the person's account password, and the window says so. The service may charge the author's account for the questions, and the window says that too.

**Where the key lives.** On this PC only, one file for each service in the app's data folder (`keys\<service>.key`), made unreadable to anyone but this Windows user by Windows' own protection (DPAPI, with a little extra of OpenExplainer's own mixed in).
It is not in a project, not in settings, not in a log and not in an export. The AI help window is told only "a key is saved, ending ...abcd", never the key. A copy of the file on another PC, or read by another Windows user, cannot be unlocked, and the window says so and asks for the key again.
The small Rust part is `src-tauri/src/keys.rs` (four commands, 5 tests, one of them a real DPAPI round trip); the others are TypeScript.
The four commands answer only the program's main window (a check in each, with a test): a helper window, such as the capture bar, cannot save, read or remove a key even if it were made to call them.

**When the program is uninstalled.** The saved keys live in the app's data folder, so they stay on the PC unless **Delete app data** is ticked on the uninstaller's page. They stay protected for this Windows user, but a person who does not want them left behind should remove each key in AI help first (**Remove the key**) or tick that box.

**What is sent, and when.** The key is read from the protected store at the moment of a question, put in that service's own header, and sent to that service's own address and no other (`api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`; the page's security policy
allows these three, and nothing else new). **Before the first question to a service each time OpenExplainer is opened, a window shows exactly what would be sent** (every message as written, the shape asked for, the address and the model), with **Do not send** first in the focus order and Escape meaning no. Only Send sends. Pictures are never sent:
the drafts are written from the words of the capture (the clicked item's name, kind and shortcut), as they are with the built-in model.

**What a person is told when something goes wrong, in words:** no key, no model named, the key refused, the model unknown, too many questions, the service down, no internet, too slow, stopped by the author. The key is removed from any message, every copy of it, even when the service quotes it back more than once.

**Models.** Anthropic starts at `claude-sonnet-5-5`. For OpenAI and Google no model is chosen for the author: names change, and a wrong guess would fail every question, so the window asks for the name as the service lists it for the key.

**What it drafts.** Everything the built-in model drafts (a sentence for each callout, chapter openers and summaries, suggested boxes), through the same checks and the same Drafts list: nothing goes into the book until the author accepts it. A draft records which service and model wrote it.

**Tried.** 12 tests in `tests/ai-cloud.test.ts` against a pretend network (each service's request and reply, the disclosure gate, every kind of failure, the key kept out of every message); Rust: the key store (a real Windows protection round trip, a damaged file, names that cannot name another file) and the settings.
**Not tried:** a real key against a real service (no key was used; a person with one should try *Test the AI*, see `TESTING-TODO.md`), the AI help window and the send window with a screen reader, and Anthropic's browser-origin header in the installed program (it is set; the service may change what it asks for).

## Part 8: the assistant's draft tool

**`draft_text`** (MCP): an assistant names a topic and a kind (`callouts`, `opener`, `summary` or `boxes`); OpenExplainer asks the **built-in model on this PC** and puts the drafts in the book's Drafts list, saved, and tells the assistant what was drafted and that **it cannot accept them**: only the author can.

- **Never a key.** With nobody at the keyboard nobody can see what would be sent, so the tool does not use the author's own key. If AI help is set to a key, it says so and drafts nothing.
- **Never an error for "no model".** With AI help off, the key chosen, or the built-in model not ready, nothing is drafted and the tool hands back the facts the model would have been given (each callout's clues; the chapter's or topic's material), so the assistant can write the text itself with `describe_picture` or `set_page`.
- Works through the same checks as the button in the program (a sentence is refused if it names something not in the capture, an opener must be two sentences, and so on).

**Tried:** 5 tests in `tests/mcp-draft.test.ts` (drafts made and saved with a pretend model, the facts when no model is ready, a key never used, an opener and boxes, the refusals).
**Not tried:** with the real model through the assistant server (`Test MCP.bat` does not draft; the model is not on this PC).

## The decision on a picture-reading model

Not made here, because it is Jason's: see `docs/picture-model-decision.md`.
