# Accessibility checks

Scripts that check, without a person, what a screen reader and a keyboard user meet in OpenExplainer and in the things it makes. They are for whoever works on the program (they are run by Claude Code, not by hand), and they find faults; they cannot tell how anything sounds. The results and what they do not cover are in `docs/screen-reader-machine-checks.md`. The part that needs a person and NVDA is `docs/screen-reader-pass.md`.

They need a built program (`npm run tauri -- build --no-bundle`, then `src-tauri\target\release\openexplainer.exe`), Node 24, and Microsoft Edge (for the help site and e-book pages). They drive the program's page through its debugging port, on a **copy** of a project, in a browser profile of their own, so they never use the real mouse or keyboard and never touch the author's own files. Results are written to `tools/a11y/out/` (not kept in git).

| Script | What it checks |
| --- | --- |
| `a11y_editor.mjs` | The main window and every window the toolbar and a topic's page open: every control has a name, the accessibility tree has landmarks and headings, ids and label references are sound, text contrast, the order Tab visits things, that Tab never leaves a window or sticks, that every stop shows a focus outline, F6 and Shift+F6 between panes, arrow keys in the tree, Escape closes each window and the keyboard goes back to its button, the live region for messages, and (as information only) reflow at 320 pixels. |
| `ui_windows.mjs` | The windows added in November 2026 (Export's new kinds and language box, Look's language box, History, the picture button), in the real window. |
| `a11y_site.mjs` | Pages of an unpacked help site and an unpacked e-book, in Edge: language, title, one h1, landmarks, names, alt text, contrast, the skip link, the Markdown alternate link. |
| `pdf_tags.mjs` | A PDF the program made: tagged, structure tree, headings, lists, figures with alternative text, links, language, title shown, bookmarks. |

How to run them (the outputs of the guide are made with the assistant tools; see `docs/mcp.md`):

```
set OE_EXE=C:\Users\Jason\OpenExplainer\src-tauri\target\release\openexplainer.exe
node tools\a11y\a11y_editor.mjs
node tools\a11y\ui_windows.mjs
node tools\a11y\a11y_site.mjs <unpacked help site folder> <unpacked e-book OEBPS folder>
node tools\a11y\pdf_tags.mjs <book.pdf>
```

`OE_PROJECT` names the project to copy (it must have a topic 2.2 with a picture; the default is the OpenStage Author guide). `A11Y_OUT` changes where results go.
