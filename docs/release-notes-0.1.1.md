# OpenExplainer 0.1.1 (release candidate)

OpenExplainer is a free, open-source (Apache 2.0) Windows program for making still-image tutorials and how-to books from screen captures. You capture a window, a rectangle or each click, write the steps, name what is in each picture, and make a PDF, a Word file, a help site, Markdown or JSON from the same project. Everything works by hand. The AI help (a small model that runs on your own PC) and the assistant access (MCP) are optional and off until you turn them on.

This is a **release candidate**, made so that it can be tried. It is not a finished first release.

## What changed since 0.1.0

- **The setup file now has the OpenExplainer icon.** In 0.1.0 the program had its icon but the setup file itself showed the plain icon every installer made with the same tool gets (a disk with an arrow). Nothing else in the program changed. The version number is now 0.1.1 everywhere (the program, the capture helper and the assistant access).

## What is in this release

- `OpenExplainer_0.1.1_x64-setup.exe`: the installer for Windows on a 64-bit Intel or AMD PC. It installs for the person who runs it, with no administrator rights, in `%LOCALAPPDATA%\OpenExplainer`, adds a Start menu entry, a desktop shortcut and an entry in Windows' list of apps, and makes a file ending in `.openexplainer` open in the program. The built-in AI model (about 2.7 GB) is not in it: it downloads only if you turn the built-in model on.
- `OpenExplainer User Guide.pdf` (78 pages) and `OpenExplainer Quick Start.pdf` (18 pages). The guide was made with OpenExplainer itself. It is unchanged from 0.1.0, and still matches the program, because nothing in the program changed.

Installing over an older copy (0.1.0 included) keeps your projects, your settings and a downloaded AI model.

## Windows will probably warn you

The installer is **not signed yet**, so Windows SmartScreen may show a blue "Windows protected your PC" screen. Choose **More info**, then **Run anyway**, and only if you got the installer from this repository. Signing is planned.

## What has been tried

- On Windows 11 Home, 64-bit: installed by hand, silent install, upgrade over an older copy, uninstall, and the installed program started and used (all of this on 0.1.0; the program itself is the same).
- The setup file built on GitHub's own computers (a by-hand run on the same code, before this version number was set) shows the OpenExplainer icon in File Explorer, checked by pulling the icon out of the downloaded file. The 0.1.0 setup file was installed on a second PC without problems; only the icon was missing.
- Capturing made-up windows, a window built on a browser engine, and clicks. Making a whole book, its index and a short guide, and every kind of export.
- 453 of 455 automatic tests pass. The other 2 call `python3`, which many Windows PCs do not have under that name; they are about the test, not the program.

## What has not been tried

- The installer's own wizard window with the new icon was not looked at (the file's icon was).
- Windows on ARM (there is no ARM installer).
- A screen reader on the installed program, display scaling above 100 percent, and other monitor layouts.
- Capturing many real programs. Names of clicked items depend on what each program tells Windows.
- No person has read the User Guide from start to finish. It is marked as drafted.

## Known limits

- The choice "My own key" (ChatGPT, Claude or Gemini) in AI help is switched off and says it is not built yet.
- The program that runs the AI model keeps going for about 25 seconds after OpenExplainer is closed.
- A project opens with a double-click only if Windows is not already set to open that kind of file with another program. Right-click the file, choose Open with, and choose OpenExplainer.
- A second double-click while OpenExplainer is open starts a second copy of the program.

See `docs/release.md` for the full notes and `docs/user-guide/README.md` for the guides.
