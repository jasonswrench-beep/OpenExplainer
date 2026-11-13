// Gets the program that runs the built-in AI model (llama.cpp's llama-server) ready to be carried with OpenExplainer.
// Downloads the one pinned build (tools/ai-runtime.json) for this PC's kind of processor, or the kind named on the command line (x64 or arm64),
// checks its SHA-256, unpacks it, keeps only the files the server needs, adds the licence texts, and puts them in src-tauri/runtime/llama.
// The installer takes that folder (src-tauri/tauri.conf.json, bundle.resources) and a development build looks there. Nothing here is committed to git.
//   node tools/get-ai-runtime.mjs [x64|arm64] [--zip <the pinned zip, already downloaded>]
// With --zip, that file is used instead of downloading it again; it must have the pinned size and SHA-256 just the same.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pin = JSON.parse(readFileSync(join(root, "tools", "ai-runtime.json"), "utf8"));
const zipAt = process.argv.indexOf("--zip");
const localZip = zipAt > 0 ? process.argv[zipAt + 1] : undefined;
const kindGiven = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : undefined;
const arch = kindGiven ?? (process.arch === "arm64" ? "arm64" : "x64");
const asset = pin.assets[arch];
if (!asset) {
  console.error(`There is no build pinned for "${arch}". Use x64 or arm64.`);
  process.exit(1);
}
const target = join(root, "src-tauri", "runtime", "llama");
const noteFile = join(target, "runtime-info.json");
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const say = (words) => console.log(words);

// Already there? Then there is nothing to do.
if (existsSync(noteFile)) {
  try {
    const note = JSON.parse(readFileSync(noteFile, "utf8"));
    if (note.build === pin.build && note.arch === arch && note.zipSha256 === asset.sha256 && existsSync(join(target, "llama-server.exe"))) {
      say(`The AI program (llama.cpp ${pin.build}, ${arch}) is already in place in ${target}.`);
      process.exit(0);
    }
  } catch {
    /* an unreadable note means start again */
  }
}

async function download(url, to, bytes, hash, what) {
  say(`Downloading ${what} ...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${what} could not be downloaded (the site answered ${response.status}).`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(to));
  const size = statSync(to).size;
  if (size !== bytes) throw new Error(`${what} is ${size} bytes but ${bytes} were expected, so it was not used.`);
  if (sha256(to) !== hash) throw new Error(`${what} does not match its pinned SHA-256, so it was not used.`);
}

const matches = (name, pattern) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i").test(name);

try {
  const work = join(tmpdir(), "openexplainer-ai-runtime", arch);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, "unpacked"), { recursive: true });
  const zip = join(work, asset.file);
  if (localZip) {
    // A zip downloaded before: copied in and checked exactly as a download is.
    copyFileSync(localZip, zip);
    if (statSync(zip).size !== asset.bytes || sha256(zip) !== asset.sha256) throw new Error(`${localZip} is not the pinned llama.cpp ${pin.build} zip for ${arch}, so it was not used.`);
  } else {
    await download(asset.url, zip, asset.bytes, asset.sha256, `llama.cpp ${pin.build} for ${arch} (${(asset.bytes / 1e6).toFixed(0)} MB)`);
  }
  say("Checked: it is the build that was read through.");
  // Windows' own tar reads zip files.
  execFileSync(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), ["-xf", zip, "-C", join(work, "unpacked")], { stdio: "inherit" });
  mkdirSync(target, { recursive: true });
  for (const name of readdirSync(target)) if (name !== "README.txt") rmSync(join(target, name), { recursive: true, force: true });
  const kept = [];
  for (const name of readdirSync(join(work, "unpacked"))) {
    if (!asset.keep.some((p) => matches(name, p))) continue;
    copyFileSync(join(work, "unpacked", name), join(target, name));
    kept.push({ name, bytes: statSync(join(target, name)).size });
  }
  if (!kept.some((f) => f.name === "llama-server.exe")) throw new Error("llama-server.exe is not in that zip, so nothing was put in place.");
  for (const licence of pin.licences) {
    const to = join(target, licence.name);
    await download(licence.url, to, licence.bytes, licence.sha256, licence.name);
    kept.push({ name: licence.name, bytes: licence.bytes });
  }
  writeFileSync(noteFile, JSON.stringify({ build: pin.build, arch, zipSha256: asset.sha256, files: kept }, null, 2) + "\n");
  const total = kept.reduce((n, f) => n + f.bytes, 0);
  say(`Done: ${kept.length} files, ${(total / 1e6).toFixed(0)} MB, in ${target}`);
  say("The installer and a development build of OpenExplainer will carry them.");
  rmSync(work, { recursive: true, force: true });
} catch (error) {
  console.error(`\nSomething went wrong: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
