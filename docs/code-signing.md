# Code signing and making a release

Rewritten 2026-11-13, after the security review of that day. The earlier version of this page planned a free signing route that was not used; it is in the repository's history.

## Code signing policy

**In force since 0.2.0 alpha 3 (2026-11-12).** Every published release of OpenExplainer is signed.

- **Who signs.** The setup file and every program in it (OpenExplainer itself, the capture helper, the AI program's files in `llama\`, the installer's plugins and the uninstaller) are signed by the publisher, **Jason Wrench**, with a code-signing certificate in the publisher's own name from a cloud code-signing service. That is the name Windows shows. The certificates last three days and are renewed daily, so every signature carries a timestamp, which keeps it valid after its certificate runs out.
- **What is signed.** Only what an OpenExplainer release carries. The AI program's files are a pinned, hash-checked build of llama.cpp (MIT licence, `tools/ai-runtime.json`), which its makers publish unsigned; they are signed as part of the installer so Windows can check every file. Files their makers have already signed, such as the web view's setup inside the installer, keep their makers' signatures.
- **Team roles.** Author, committer, reviewer and approver: the owner, Jason S. Wrench ([jasonswrench-beep](https://github.com/jasonswrench-beep)). Most changes are written with an AI coding assistant in sessions the owner starts; the owner decides what is committed and what is released. An independent security review is made before a release when one is asked for (the latest: 2026-11-13).
- **Privacy.** This program does not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. The AI model runs on the author's own PC, and its program listens only on this PC, behind a password made fresh each time. The network is used only when the author asks: to download the AI model (from Hugging Face, after the author turns the built-in model on and presses Download), and for Help, Check for updates (one request to GitHub's list of this project's releases, which sends nothing about the author or their books; `docs/update-check.md`). The installer carries the web view's setup and downloads nothing.

## How a release is made

The repository is public, so a release is seen by everyone. The owner is asked first, every time, and nothing is published without the owner's yes.

1. Raise `RELEASE` in `tools/build-installer.mjs` to the new version, such as `0.2.0-alpha.4`. Check for updates compares it with the published releases. (The version in `tauri.conf.json`, `package.json`, both `Cargo.toml` files and `src/mcp/main.ts` is the plain `0.2.0`; it changes only for a new version, not for a new alpha.)
2. Run the checks (`npm test`, `npm run typecheck`, `cargo test` in `src-tauri` and `capture-helper`, `Check Licences.bat`), commit, and push the commit to `main` first.
3. On the owner's computer, signed in to the signing service, with the account's details in the environment (the top of `tools/sign_windows.py` names them): `node tools/build-installer.mjs --sign`. It stops on any problem: an AI program that is not the pinned build, a program that names this computer's user folder, an installer that would download the web view's setup, or a program in the setup that is not signed and timestamped. It writes `src-tauri/target/release-files/OpenExplainer-<release>-Setup.exe` and its `.sha256.txt`.
4. Make the pre-release with exactly those two files, tagged at the pushed commit (the full hash), titled "OpenExplainer X.Y.Z alpha N", with notes in plain words and no em dashes: what changed, who signed it, the SHA-256, what has NOT been tried, and the commit. Pushing the tag starts the GitHub workflow, which only builds an unsigned copy for checking; it makes no draft and cannot publish.
5. Check the release: the tag points at the commit, GitHub's own SHA-256 of the setup is the one computed, there are exactly two files, it is a published pre-release, and a downloaded copy is signed. Tell the owner the link and what was checked.

## Why the GitHub workflow does not sign

The signing account is the owner's, and its sign-in stays on the owner's computer. The workflow (`.github/workflows/build-installer.yml`) builds the same installer, unsigned, on a clean Windows machine with the same script (`node tools/build-installer.mjs`, without `--sign`), so anyone can see that the code builds and that the folder-name and web view checks pass. Its download is for checking, not for giving to people.

## Drafts left from the old workflow

The old workflow made a draft release for every version tag, with the unsigned installer. Five such drafts are still on the Releases page (only the owner and collaborators can see drafts): `v0.2.0-alpha.3`, `v0.2.0-alpha.1`, `v0.1.1` and `v0.1.0` (two). They were never published. Deleting them is the owner's to do, from the Releases page.
