# Check for updates

OpenExplainer has **Help, Check for updates...**. It works the same way as in the other tools of the OpenStage suite. Added 2026-11-13.

## What it does

* **Only when asked.** Nothing is checked when the program starts or on a timer, and nothing runs in the background. The dialog says which release this copy is; pressing **Check now** asks once.
* **Notify only.** It says, in words in the dialog's status line, whether a newer version is published and, if so, offers a button that opens that release's page (what changed, the checksum and the signed setup) in the author's own browser. It downloads and installs nothing. Running the new setup updates the copy in place and keeps the projects, the settings and the downloaded AI model.
* **Where it looks.** One HTTPS request from the program to
  `https://api.github.com/repos/jasonswrench-beep/OpenExplainer/releases?per_page=30`, made with Windows' own HTTPS code (WinHTTP): no redirects followed, no cookies, at most 2 MB read, and 15 seconds for each step. Pre-releases count, because every release so far is one; drafts never do. The request carries only a plain name for the program (`OpenExplainer-update-check`); nothing about the author or their books is sent.
* **The window still cannot reach GitHub.** The request is made by the program's own code (`src-tauri/src/updates.rs`), not by the page, and the window's content security policy is unchanged (it allows only the app's own channel, the AI model's download and the AI program on this PC). No web library was added to the program.
* **What it compares.** The exact release this copy was built as, which the release build records in the program (`RELEASE` in `tools/build-installer.mjs`, passed as `OPENEXPLAINER_RELEASE`; raise it for every release), with the highest published tag (`vMAJOR.MINOR.PATCH`, or `-alpha.N`, `-beta.N` or `-rc.N` after it; a final release sorts after its pre-releases). A copy built another way (a development build) is told the newest published version instead.
* **Links.** Only a release page of this repository (`https://github.com/jasonswrench-beep/OpenExplainer/releases/tag/v...`) or the list of releases is ever offered, and the program's own command that opens it refuses any other address. It is opened with Windows' own way of opening a link.
* **Turning it off.** Whoever looks after the computer can set the environment variable `OPENSTAGE_UPDATE_CHECK=off` (the same switch as the other tools of the suite), or put a file called `update-check.txt` containing `off` in the program's folder. The dialog then says that checking is turned off on this computer and asks nothing.
* **Signing.** No separate update key is needed, because nothing is installed automatically. The setup itself is signed with the publisher's code-signing certificate, and the release page carries its SHA-256.

## Code and tests

* `src-tauri/src/updates.rs` (the versions, the request, the answers, the switch, which pages may be opened, and the commands `app_release`, `check_for_updates` and `open_release_page`); `src/updates.ts` (reading the answer, and which pages may be offered) and `src/updates-dialog.ts` (the dialog); the Help menu entry is `cmd-updates` in `src/ui/commands.ts`.
* Tests: `updates.rs` (sorting, the answers, drafts, the release pages, the switch) and `tests/updates.test.ts`. None of these reaches the network. One more test in `updates.rs` reads the real list from GitHub and shows that a redirect is refused, not followed; it runs only by hand (`cargo test -- --ignored` in `src-tauri`).
