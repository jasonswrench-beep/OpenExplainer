# Code signing with SignPath Foundation

Decided with Jason on 2026-10-23: sign the Windows installer with the free code signing that SignPath Foundation gives to open-source projects. (Looked at and set aside: Azure Artifact Signing, about $10 a month; an ordinary OV or EV certificate, roughly $200 to $500 a year, which needs a physical token or cloud vault for the key.
Either is still the fallback if SignPath says no.)

## Why sign at all

An unsigned installer shows Windows' blue "Windows protected your PC, unknown publisher" screen, and the person has to click "More info" and then "Run anyway". A signed installer shows a publisher name. Windows still builds up trust in a new signer over time, so the warning shrinks as people download it; it does not vanish on day one, even with the expensive "EV" certificates (Microsoft stopped giving them instant trust in 2024).
With SignPath Foundation the publisher name shown is **SignPath Foundation**, not Jason's own name.

## What SignPath asks for, and where the project stands

| What SignPath Foundation requires | Where OpenExplainer stands |
| --- | --- |
| An OSI-approved open-source licence, no dual licensing | Apache 2.0. Yes. |
| No proprietary components | None. The bundled AI program is llama.cpp (MIT). The AI model is not bundled; it is downloaded only when the author turns it on. |
| A public source repository | **The repository is private today. Jason has to make it public.** See "Before the repository goes public". |
| Only binaries built from the project's own source, in a verifiable automated build | `.github/workflows/build-installer.yml` builds the installer on GitHub's own computers from the repository alone. Run once on GitHub on 2026-10-23 (started by the test tag `v0.1.0-test1`, deleted afterwards): it passed and made the `OpenExplainer-installer-unsigned` download. |
| Each release approved by hand | Jason approves each signing request on SignPath's site. |
| Actively maintained, not malware, uninstaller included | Yes (the installer has an uninstaller). |
| The exact file to be signed has already been released | A first release of the unsigned installer has to be published on GitHub before applying (step 4). |
| Product name matches the project, and the version is the same in every file of a build | Product name is OpenExplainer; the version comes from `tauri.conf.json` (0.1.1, also in `package.json`, both `Cargo.toml` files and `src/mcp/main.ts`). |
| A "Code signing policy" section on the project's home page, with the exact sentence below | Drafted below; it goes into the README when Jason applies (step 5). |
| Named team roles (authors, reviewers, approvers) | One person for now: Jason. |
| Two-step sign-in (MFA) for everyone with GitHub or SignPath access | **Jason has to check this is on** for his GitHub account (and turn it on for SignPath when the account exists). |
| A privacy statement | Drafted below. |

## The steps

You are Jason. Steps 1, 2, 4, 5, 6 and 7 are yours (accounts, public decisions, forms). Step 3 is mine to prepare and yours to click. Everything else I do.

1. **Decide to make the repository public, and look at what will be visible.** Making it public cannot be fully undone: the code and the whole commit history become readable and may be copied by others. I scanned the tracked files and found **no passwords, keys, tokens or e-mail addresses**. What you may want to decide first:
   - The 55 commits made under your GitHub name carry the e-mail address `jasonswrench@gmail.com`. That is normal for open source. If you would rather not show it, GitHub offers a private "noreply" address for future commits (the old commits keep what they have).
   - `docs/HANDOFF.md` and `CLAUDE.md` are notes written for the AI sessions that built this. They say that you are not a programmer, give your folder `C:\Users\Jason\OpenStage`, and link two private design documents. Nothing harmful, but they read as internal notes. You can keep them, trim them or move them out.
   - The name "OpenExplainer": a quick web search found nothing else with that name, but it was not a thorough check (the same open question as before).
   - The two lock files `package-lock.json` and `src-tauri/Cargo.lock` have to be committed for the GitHub build to work (I do this).
2. **Turn on two-step sign-in for GitHub** (GitHub, Settings, Password and authentication). SignPath requires it.
3. **Run the GitHub build once.** (Done once on 2026-10-23 by pushing a test tag, and it passed; running it again from the Actions tab or with a new tag is the same thing.) After the repository is public and I have pushed (with your yes), open the repository on GitHub, the Actions tab, "Build installer", Run workflow. It takes about 15 minutes and ends with a download called `OpenExplainer-installer-unsigned`. If it fails, send me the red text and I fix it.
4. **Publish a first release** on GitHub. Pushing the tag `v0.1.0` now makes a **draft pre-release** by itself, with the unsigned installer and the guide PDFs attached and the notes from `docs/release-notes-0.1.0.md` (see `docs/release.md`); open Releases, read it, and click Publish release. The notes already say what the program does and that Windows will warn until it is signed. SignPath wants the exact file to be signed to be already released, and wants the functionality described on the download page (the README already does).
5. **Apply** at https://signpath.org (the Apply page). Before that I add the "Code signing policy" section below to the README, with your approval. The form asks for the repository link, the licence, a short description, the policy page link and the team roles. I fill in a draft of every answer for you to paste.
6. **When they accept**, you log in to SignPath.io and I tell you each click: add GitHub as the trusted build system, create the project, the signing policy (with manual approval by you) and the artifact configuration (suggested below), and make an API token. You store the token on GitHub as a secret named `SIGNPATH_API_TOKEN`
   and the four ids as repository variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG` and `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`. (The workflow signs only once the first one exists.)
7. **Each release from then on:** run "Build installer"; SignPath e-mails you a request; you approve it on their site; the run ends with `OpenExplainer-installer-signed`, which goes on the GitHub release. I can check the signature on the downloaded file with Windows' own tool.

## Draft: the Code signing policy section for the README

> ## Code signing policy
>
> Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).
>
> - Only the Windows installer of OpenExplainer is signed, and only when it was built by the automated build in this repository (`.github/workflows/build-installer.yml`, run on GitHub's own computers) from the source in this repository.
> - Team roles: author and committer, [Jason S. Wrench](https://github.com/jasonswrench-beep); reviewer, the same; approver of each signing request, the same.
> - Privacy: this program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. The AI model runs on the author's own PC. The only network use is downloading the AI model (from Hugging Face, and only after the author turns the built-in model on and presses Download), and, in a later version, sending text to ChatGPT, Claude or Gemini with the author's own key, only if the author chooses that.

(The sentence "Free code signing provided by SignPath.io, certificate by SignPath Foundation" must stay exactly as SignPath words it. I will copy the current wording from their terms when we apply.)

## Suggested artifact configuration (step 6)

The workflow hands SignPath a zip that holds the one installer. In SignPath this is described as:

```xml
<artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
  <zip-file>
    <pe-file path="OpenExplainer_*_x64-setup.exe">
      <authenticode-sign/>
    </pe-file>
  </zip-file>
</artifact-configuration>
```

SignPath's own onboarding adds the rules about product name and version for Foundation projects.

## Limits and risks to know about

- **Only the installer is signed, not the files inside it.** Tauri changes the program file while it packs the installer, and SignPath works on finished files in a separate step, so signing the inner files too would need a second, more complicated pipeline. The installed program and the capture helper stay unsigned. This is normal for open-source Windows installers
  and it is what Windows checks when a person runs the downloaded file, but some antivirus programs like signed inner files better. We can add that later.
- **The bundled llama.cpp files are third-party.** They are not built from this repository and are not signed by SignPath. They are a pinned, hash-checked build of an MIT-licensed program. SignPath's rule is to sign only binaries built from the project's own source; the installer is built from our source and contains them, and the application will say so plainly. I cannot tell from here whether they will accept that; if they do not, this is the part to discuss with them.
- **A very new project can be turned down.** SignPath Foundation decides each application. A first release, a public repository and a clear README help. If they say no, the fallback is Azure Artifact Signing (about $10 a month, signs from this PC, publisher shows your legal name) or an ordinary certificate.
- **Approval is by hand every time**, by you, on SignPath's site. A build that nobody approves is simply not signed.
- **The GitHub build has run once and passed** (2026-10-23, from a test tag; the installer it made was not installed or tried, only the local one was). It uses the same commands as `Build Installer.bat` and was checked here by building the installer from a fresh copy of the committed repository (npm ci, the licence check, the AI program, the helper, tauri build: it made a 12 MB installer; the Rust crates came from this PC's cache), but GitHub's Windows computers can differ from this PC.
