# OpenExplainer 0.2.0 alpha 2

OpenExplainer is a free, open-source (Apache 2.0) Windows program for making still-image tutorials and how-to books from screen captures. You capture a window, a rectangle or each click, write the steps, name what is in each picture, and make a PDF, a Word file, a help site, an e-book, Markdown or JSON from the same project. Everything works by hand. The AI help (a small model that runs on your own PC) and the assistant access (MCP) are optional and off until you turn them on.

This is an **alpha**. Nobody has run this installer by hand yet. It is made so that it can be tried, and it is not a finished release.

## What changed since 0.2.0 alpha 1

The program now has the look the OpenStage programs share. Nothing it does changed: every command is still there under the same name, and every key works as before.

- **A navy bar** across the top: the icon, the name, the project and whether it is saved, a Search box (Ctrl+K), and Save, Capture, Check the book and Export.
- **Nine menus** (File, Chapters, Insert, Write, Book, View, Review, Tools, Help) hold all 51 commands, each with its icon and its keys. They take the place of the twenty buttons that were across the top.
- **The panes** keep one Add button and a "..." menu each (chapters and topics, the page, the pictures). Find and replace in titles waits until it is asked for.
- **Search for a command** with Ctrl+K, and see every key with Help, Keyboard keys (Ctrl+/).
- **Properties** are in sections that open and close.
- **Every dialog** has a Close button that does what Escape does, and its row of buttons stays in sight.

The icons are from the Lucide set (ISC licence; some are derived from Feather, MIT licence), kept in the program and never fetched. `NOTICE` credits them.

The project format is still version 21, the same as alpha 1, so a project moves between the two freely.

## What is in this release

- `OpenExplainer_0.2.0_x64-setup.exe`: the installer for Windows on a 64-bit Intel or AMD PC. It installs for the person who runs it, with no administrator rights, in `%LOCALAPPDATA%\OpenExplainer`, adds a Start menu entry, a desktop shortcut and an entry in Windows' list of apps, and makes a file ending in `.openexplainer` open in the program. The built-in AI model (about 2.7 GB) is not in it: it downloads only if you turn the built-in model on.
- `OpenExplainer_0.2.0_x64-setup.exe.sha256.txt`: the SHA-256 of the installer, so you can check your download.

Installing over an older copy keeps your projects, your settings and a downloaded AI model. The file name is the same as alpha 1's, because the version number is still 0.2.0.

## Windows will probably warn you

The installer is **not signed yet**, so Windows may say "unknown publisher" or show a blue "Windows protected your PC" screen. Choose **More info**, then **Run anyway**, and only if you got the installer from this repository.

## What has been tried

- 567 of 569 automatic tests pass (TypeScript). The other 2 call `python3`, which many Windows PCs do not have under that name; they are about the test, not the program.
- A 42-step check in a real browser, with a stand-in for the desktop window: the menus and the command search by keyboard and by mouse, narrow and short windows, a high-contrast theme, and an accessibility audit of the new parts, which found nothing.
- The Rust parts (the capture helper and the program's Windows shell) have not changed since alpha 1, where their 66 and 39 tests passed.
- The licence check passes: no GPL or AGPL package.

## What has not been tried

- A person running this installer by hand, and a person using the new menus in the program's own window. The checks above ran in a browser.
- A person using the editor with a screen reader. Only machine checks have been done.
- Everything listed as not tried for alpha 1: the Windows file choosers behind Import from Word, Bring in review comments, Import a translation and Replace the picture file; real comments coming back from a reviewer in Word; a translation tool reading the XLIFF; the e-book in a checker; the PDFs in a PDF accessibility checker; the installer's own wizard window; Windows on ARM; display scaling above 100 percent; and capturing many real programs.

## Known limits

- The choice "My own key" (ChatGPT, Claude or Gemini) in AI help is switched off and says it is not built yet.
- The program that runs the AI model keeps going for about 25 seconds after OpenExplainer is closed.
- A project opens with a double-click only if Windows is not already set to open that kind of file with another program. Right-click the file, choose Open with, and choose OpenExplainer.
- A second double-click while OpenExplainer is open starts a second copy of the program.

See `docs/release.md` for the full notes and `docs/format-spec.md` for the project format.
