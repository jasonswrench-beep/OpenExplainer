// Runs an outside checker over an export: `node tools/outside-checks/run.ts epub [file.epub]` or `... pdf [file.pdf]`. Double-click "Check EPUB.bat" or "Check PDF.bat" instead.
// It changes nothing in any project. It writes the checker's own report to tools/outside-checks/out/ (not in git). It asks before it downloads anything, and says what, from where and how big.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { epubcheckAsset, epubcheckSummary, epubcheckWords, javaMajor, pickJava, veraPdfPassed, veraPdfWords } from "./lib.ts";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const home = process.env.USERPROFILE ?? "";
const [kind, given] = process.argv.slice(2);
const ask = createInterface({ input: process.stdin, output: process.stdout });
const say = (words: string) => console.log(words);

async function question(words: string): Promise<string> {
  return (await ask.question(`${words} `)).trim();
}

/** The newest file with this ending in the places an export usually goes, or what was typed. */
async function chooseFile(ending: string): Promise<string> {
  if (given && existsSync(given)) return resolve(given);
  const folders = [join(home, "Documents", "OpenExplainer Manual"), join(home, "Documents"), join(home, "Downloads"), join(home, "Desktop")];
  const found: { path: string; time: number }[] = [];
  for (const folder of folders) {
    if (!existsSync(folder)) continue;
    for (const name of readdirSync(folder)) {
      if (name.toLowerCase().endsWith(ending)) {
        const path = join(folder, name);
        found.push({ path, time: statSync(path).mtimeMs });
      }
    }
  }
  found.sort((a, b) => b.time - a.time);
  if (found[0]) {
    const yes = (await question(`Check ${found[0].path}? (Enter for yes, or type the full path of another file)`)) || "";
    if (yes === "") return found[0].path;
    if (existsSync(yes.replace(/^"|"$/g, ""))) return resolve(yes.replace(/^"|"$/g, ""));
  }
  const typed = (await question(`Type the full path of the ${ending} file to check:`)).replace(/^"|"$/g, "");
  if (!existsSync(typed)) throw new Error(`There is no file at ${typed}.`);
  return resolve(typed);
}

function javaCandidates(): { path: string; major: number | null }[] {
  const paths = ["java"];
  for (const root of ["C:\\Program Files\\Eclipse Adoptium", "C:\\Program Files\\Java", "C:\\Program Files\\Microsoft", "C:\\Program Files\\Zulu", "C:\\Program Files\\Amazon Corretto"]) {
    if (existsSync(root)) for (const name of readdirSync(root)) paths.push(join(root, name, "bin", "java.exe"));
  }
  return paths.filter((p) => p === "java" || existsSync(p)).map((path) => {
    const run = spawnSync(path, ["-version"], { encoding: "utf8" });
    return { path, major: run.error ? null : javaMajor(`${run.stdout}${run.stderr}`) };
  });
}

function save(name: string, text: string): string {
  mkdirSync(out, { recursive: true });
  const file = join(out, name);
  writeFileSync(file, text);
  return file;
}

async function epub() {
  const file = await chooseFile(".epub");
  const java = pickJava(javaCandidates(), 11);
  if (!java) {
    say("EPUBCheck needs Java 11 or newer, and none was found on this PC. Install a current Java (for example Temurin, from adoptium.net), then run this again. Nothing was changed.");
    return 1;
  }
  let jar = process.env.EPUBCHECK_JAR ?? "";
  const folder = join(here, "epubcheck");
  if (!jar || !existsSync(jar)) {
    jar = existsSync(folder) ? (readdirSync(folder, { recursive: true }) as string[]).map((f) => join(folder, f)).find((f) => basename(f) === "epubcheck.jar") ?? "" : "";
  }
  if (!jar) {
    say("EPUBCheck is the W3C's own checker for e-books (BSD licence, github.com/w3c/epubcheck). It is not on this PC yet.");
    const release = await (await fetch("https://api.github.com/repos/w3c/epubcheck/releases/latest", { headers: { accept: "application/vnd.github+json", "user-agent": "OpenExplainer-outside-checks" } })).json();
    const asset = epubcheckAsset(release);
    if (!asset) throw new Error("The newest EPUBCheck release has no download that this script knows. Get it by hand from github.com/w3c/epubcheck/releases and set EPUBCHECK_JAR to the epubcheck.jar inside.");
    const yes = await question(`Download ${asset.name} (${Math.round(asset.size / 1048576)} MB) from ${asset.url}? Type yes to download, anything else to stop:`);
    if (yes.toLowerCase() !== "yes") return say("Nothing was downloaded."), 1;
    const bytes = new Uint8Array(await (await fetch(asset.url, { headers: { "user-agent": "OpenExplainer-outside-checks" } })).arrayBuffer());
    mkdirSync(join(here, "downloads"), { recursive: true });
    const zip = join(here, "downloads", asset.name);
    writeFileSync(zip, bytes);
    say(`Saved ${zip}. SHA-256 ${createHash("sha256").update(bytes).digest("hex")}. Compare it with the release page if you like.`);
    const unzip = spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${folder}' -Force`], { encoding: "utf8" });
    if (unzip.status !== 0) throw new Error(`The download could not be unpacked: ${unzip.stderr}`);
    jar = (readdirSync(folder, { recursive: true }) as string[]).map((f) => join(folder, f)).find((f) => basename(f) === "epubcheck.jar") ?? "";
    if (!jar) throw new Error("The download did not hold an epubcheck.jar.");
  }
  say(`Checking ${file} with ${jar} and ${java}. This takes a few seconds.`);
  const run = spawnSync(java, ["-jar", jar, file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const report = `${run.stdout}\n${run.stderr}`;
  const saved = save(`${basename(file)}.epubcheck.txt`, report);
  say(epubcheckWords(epubcheckSummary(report), run.status));
  say(`The whole report is in ${saved}.`);
  return run.status === 0 ? 0 : 1;
}

async function pdf() {
  const file = await chooseFile(".pdf");
  const candidates = [process.env.VERAPDF ?? "", join(here, "verapdf", "verapdf.bat"), "C:\\Program Files\\veraPDF\\verapdf.bat", join(home, "veraPDF", "verapdf.bat")].filter(Boolean);
  const tool = candidates.find((c) => existsSync(c));
  if (!tool) {
    say("veraPDF is a free checker for PDF/UA, the standard for accessible PDFs (veraPDF.org). It is not on this PC. Its installer is a program with its own windows, so this script does not run it for you:");
    say("  1. Download the installer from software.verapdf.org and run it (it needs Java 8 or newer).");
    say("  2. Run this again. It looks in C:\\Program Files\\veraPDF, or in the folder named by the VERAPDF setting.");
    say("A second check, by eye, is PAC (the PDF Accessibility Checker, free, from pdfua.foundation): open the same PDF in it and write down what it says in TESTING-TODO.md.");
    return 1;
  }
  say(`Checking ${file} against PDF/UA-1 with ${tool}. This can take a minute for a long book.`);
  const run = spawnSync("cmd", ["/c", tool, "--flavour", "ua1", "--format", "text", file], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const report = `${run.stdout}\n${run.stderr}`;
  const saved = save(`${basename(file)}.verapdf.txt`, report);
  say(veraPdfWords(veraPdfPassed(report)));
  say(`The whole report is in ${saved}.`);
  return veraPdfPassed(report) === true ? 0 : 1;
}

try {
  if (kind !== "epub" && kind !== "pdf") throw new Error("Say which check: epub or pdf.");
  const code = kind === "epub" ? await epub() : await pdf();
  ask.close();
  process.exit(code);
} catch (error) {
  say(`This could not be done. ${error instanceof Error ? error.message : String(error)}`);
  ask.close();
  process.exit(2);
}

// Kept so a person reading this can find where a report goes without running anything.
void readFileSync;
