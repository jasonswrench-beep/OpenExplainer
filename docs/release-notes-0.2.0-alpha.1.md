# OpenExplainer 0.2.0 alpha 1

OpenExplainer is a free, open-source (Apache 2.0) Windows program for making still-image tutorials and how-to books from screen captures. You capture a window, a rectangle or each click, write the steps, name what is in each picture, and make a PDF, a Word file, a help site, an e-book, Markdown or JSON from the same project. Everything works by hand. The AI help (a small model that runs on your own PC) and the assistant access (MCP) are optional and off until you turn them on.

This is an **alpha**. Nobody has run this installer by hand yet. It is made so that it can be tried, and it is not a finished release.

## What changed since 0.1.1

- **Links between topics.** Words in a topic can go to another topic. Each topic can have a "See also" list, and the book check finds links that no longer go anywhere.
- **The look of the book.** Fonts, an accent colour, a logo, a title page, a header and footer, and the paper size.
- **Reuse.** Snippets (a piece of a page written once and used in many topics), conditions (names for content that is only for some readers or versions) and targets (named outputs, such as "Guide for students", that leave out some conditions).
- **Import from Word.** A `.docx` file is read into drafted chapters and topics.
- **Snapshots.** A project keeps up to 20 earlier states you can go back to.
- **A Word copy for reviewers.** Reviewers add comments in Word and you bring them back in.
- **An e-book.** A new export makes an EPUB 3 file with contents, links, an index and pictures.
- **The help site** now also has a Markdown version of every page, plus `llms.txt` and `llms-full.txt`.
- **A bigger book check.** It now finds topics with no title, two topics with the same title in a chapter, pages with identical words, and vague link text such as "click here".
- **Translation.** Set the language of the book, export the words as XLIFF, bring a translation into a copy of the book, and replace a picture file.
- **A screen reader pass.** Machine checks, and a script for a person with NVDA. They found two faults, and both are fixed: the figures in the PDF had no alternative text, and the help site's skip link did not move the keyboard focus.
- **More assistant tools** for an AI assistant that makes a book without anyone at the keyboard: move a topic, bring in a picture, add and delete callouts, import a Word file, and start from a how-to book template that ends with an Appendix.
- **The project format is now version 21.** A project made with 0.1.1 or earlier is upgraded when you open it. A project saved by this version is refused by an older OpenExplainer, with a message asking the author to update. Keep a copy of important projects before you try this alpha.

## What is in this release

- `OpenExplainer_0.2.0_x64-setup.exe`: the installer for Windows on a 64-bit Intel or AMD PC. It installs for the person who runs it, with no administrator rights, in `%LOCALAPPDATA%\OpenExplainer`, adds a Start menu entry, a desktop shortcut and an entry in Windows' list of apps, and makes a file ending in `.openexplainer` open in the program. The built-in AI model (about 2.7 GB) is not in it: it downloads only if you turn the built-in model on.
- `OpenExplainer_0.2.0_x64-setup.exe.sha256.txt`: the SHA-256 of the installer, so you can check your download.

Installing over an older copy keeps your projects, your settings and a downloaded AI model.

The User Guide and Quick Start in `docs/user-guide` are the older ones, written for 0.1.0. They do not describe the features above yet, so they are not attached to this release.

## Windows will probably warn you

The installer is **not signed yet**, so Windows may say "unknown publisher" or show a blue "Windows protected your PC" screen. Choose **More info**, then **Run anyway**, and only if you got the installer from this repository. Signing is planned.

## What has been tried

- 541 of 543 automatic tests pass (TypeScript). The other 2 call `python3`, which many Windows PCs do not have under that name; they are about the test, not the program.
- 66 tests of the capture helper and 39 of the program's Windows shell pass (Rust).
- The licence check passes: no GPL or AGPL package.
- The earlier installers (0.1.0 and 0.1.1) were installed by hand on Windows 11 Home, 64-bit: installed, upgraded over an older copy, uninstalled, and used.

## What has not been tried

- A person running this installer by hand.
- A person using the editor with a screen reader. Only machine checks have been done.
- The Windows file choosers behind Import from Word, Bring in review comments, Import a translation and Replace the picture file.
- Real comments coming back from a reviewer in Word, Word opening the Word files, a translation tool reading the XLIFF, the e-book in a checker such as EPUBCheck, and the PDFs in a PDF accessibility checker.
- The installer's own wizard window.
- Windows on ARM (there is no ARM installer), display scaling above 100 percent, and other monitor layouts.
- Capturing many real programs. Names of clicked items depend on what each program tells Windows.

## Known limits

- The choice "My own key" (ChatGPT, Claude or Gemini) in AI help is switched off and says it is not built yet.
- The program that runs the AI model keeps going for about 25 seconds after OpenExplainer is closed.
- A project opens with a double-click only if Windows is not already set to open that kind of file with another program. Right-click the file, choose Open with, and choose OpenExplainer.
- A second double-click while OpenExplainer is open starts a second copy of the program.
- A translated book is a new project file, never a change to the first one. Only XLIFF 1.2 is read and written.

See `docs/release.md` for the full notes and `docs/format-spec.md` for the project format.
