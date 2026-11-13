# OpenExplainer 0.1.0 (release candidate)

OpenExplainer is a free, open-source (Apache 2.0) Windows program for making still-image tutorials and how-to books from screen captures. You capture a window, a rectangle or each click, write the steps, name what is in each picture, and make a PDF, a Word file, a help site, Markdown or JSON from the same project. Everything works by hand. The AI help (a small model that runs on your own PC) and the assistant access (MCP) are optional and off until you turn them on.

This is a **release candidate**, made so that it can be tried. It is not a finished first release.

## What is in this release

- `OpenExplainer_0.1.0_x64-setup.exe`: the installer for Windows on a 64-bit Intel or AMD PC. It installs for the person who runs it, with no administrator rights, in `%LOCALAPPDATA%\OpenExplainer`, adds a Start menu entry, a desktop shortcut and an entry in Windows' list of apps, and makes a file ending in `.openexplainer` open in the program. The built-in AI model (about 2.7 GB) is not in it: it downloads only if you turn the built-in model on.
- `OpenExplainer User Guide.pdf` (78 pages) and `OpenExplainer Quick Start.pdf` (18 pages). The guide was made with OpenExplainer itself.

Installing over an older copy keeps your projects, your settings and a downloaded AI model.

## Windows will probably warn you

The installer is **not signed yet**, so Windows SmartScreen may show a blue "Windows protected your PC" screen. Choose **More info**, then **Run anyway**, and only if you got the installer from this repository. Signing is planned.

## What has been tried

- On Windows 11 Home, 64-bit: installed by hand, silent install, upgrade over an older copy, uninstall, and the installed program started and used.
- Capturing made-up windows, a window built on a browser engine, and clicks (with and without another program's see-through window over the one being used). Making a whole book, its index and a short guide, and every kind of export.
- The two guides above, made with the program itself, which is how most of the faults fixed in this release were found.
- 453 of 455 automatic tests pass. The other 2 call `python3`, which many Windows PCs do not have under that name; they are about the test, not the program.

## What has not been tried

- A clean PC, or a second Windows user account.
- Windows on ARM (there is no ARM installer).
- A screen reader on the installed program, display scaling above 100 percent, and other monitor layouts.
- Capturing many real programs. Names of clicked items depend on what each program tells Windows.
- No person has read the User Guide from start to finish. It is marked as drafted.

## Known limits

- The choice "My own key" (for a hosted AI service) in AI help is switched off and says it is not built yet.
- The program that runs the AI model keeps going for about 25 seconds after OpenExplainer is closed.
- A project opens with a double-click only if Windows is not already set to open that kind of file with another program. Right-click the file, choose Open with, and choose OpenExplainer.
- A second double-click while OpenExplainer is open starts a second copy of the program.

See `docs/release.md` for the full notes and `docs/user-guide/README.md` for the guides.
