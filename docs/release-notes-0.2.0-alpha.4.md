# OpenExplainer 0.2.0 alpha 4

OpenExplainer is a free, open-source (Apache 2.0) Windows program for making still-image tutorials and how-to books from screen captures. Everything works by hand. The AI help (a small model that runs on your own PC) and the assistant access (MCP) are optional and off until you turn them on.

This is an **alpha**: a security release, after an outside review of the whole program (it found no high or medium problems), and the first with **Check for updates**.

## Check for updates

- **Help, Check for updates...** says which release this copy is, and its **Check now** button asks GitHub, once, whether a newer version is published, and says so in words. If there is one, a second button opens its page in your browser. It happens only when you press the button, it sends nothing about you or your books, and it downloads and installs nothing. Whoever looks after the computer can turn it off (`docs/update-check.md`).

## Security fixes

- **A project from someone else is checked when it is opened.** A picture whose name, file or size is not one OpenExplainer makes is left out (and you are told how many), and variable names are cleaned the way the Project variables dialog cleans them, so a crafted project cannot put markup into a dialog or an export, or a path into an exported file. The Project variables dialog shows each name as plain text.
- **Window titles stay out of exports.** A window capture is saved as "Window capture 1", "Window capture 2" and so on, never under the window's title, which can hold a path or a document's name. The JSON export leaves out when each picture was taken, its capture name and what was clicked, unless you tick **Include capture details**.
- **An assistant over MCP needs your permission to capture.** A new box in MCP access, **Let an assistant capture windows**, is off to begin with. Without it, an assistant sees no window titles and captures nothing. Capturing a whole screen stays a second box on top. A path an assistant names is also followed through links before it is checked against the folder you chose. **If you used MCP capture before, tick the new box in MCP access.**
- **The AI program's password is no longer on its command line**, where other programs can read it, and OpenExplainer checks that the program answering on the AI's port is the one it started, before any text of your book is sent there.
- **The AI program is updated** to llama.cpp build b12359 (the build behind its 1.0.0 release), which fixes several problems in its server.
- **The installer downloads nothing.** It carries the web view's signed setup, for the rare PC without the web view.
- **The programs no longer contain the folder names of the PC that built them**, and the build checks that.
- **Smaller hardening:** a project file cannot unpack to more than OpenExplainer will read; a PDF is made only in its own work folder; only a picture a capture made can be cropped; every page of an exported help site carries a content security policy, so no script written into a page can run.
- Generic names, instead of other companies' product names, in the program's words, the documents and the test scripts.

## Signed

The setup file and every program inside it are signed by **Jason Wrench**, and every signature carries a timestamp. To see it: right-click the downloaded file, Properties, Digital Signatures. Windows SmartScreen may still warn on the first downloads of a new signer; if it does, choose **More info**, then **Run anyway**, but only if the file came from this page and its checksum matches.

## What is in this release

- `OpenExplainer-0.2.0-alpha.4-Setup.exe`: the installer for Windows on a 64-bit Intel or AMD PC. It installs for the person who runs it, with no administrator rights, and updates an installed copy in place, keeping your projects, your settings and a downloaded AI model. The built-in AI model (about 2.7 GB) is not in it.
- `OpenExplainer-0.2.0-alpha.4-Setup.exe.sha256.txt`: its SHA-256.

The project format is still version 21, so a project moves between this and the earlier alphas freely.

## What has NOT been tried

- Nobody has installed this release by hand yet, or pressed Check for updates in the installed program.
- The AI help with the built-in model was not tried end to end with this build (the model is not on the PC it was built on). The new AI program was started with a small model of the same family: the password from its environment worked, a request without it was refused, and its command line held no password.
- No screen reader has been used with the new MCP box or the Check for updates dialog.
- Everything the earlier releases list as not tried still holds.
