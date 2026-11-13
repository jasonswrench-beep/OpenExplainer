// The release build script's own rules (tools/build-installer.mjs): the flags that keep the building computer's folder names out of the programs, the search for
// the user folder's name, and how the web view's setup is got. Nothing here builds anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { folderFlags, namingUserFolder, RELEASE, webviewMode } from "../tools/build-installer.mjs";

test("the folders of the building computer are replaced, the user folder first and the repository last, and the debug file is named without its folder", () => {
  const flags = folderFlags("C:\\Users\\Some One", {}, "C:\\Users\\Some One\\code\\OpenExplainer");
  assert.deepEqual(flags, [
    "--remap-path-prefix=C:\\Users\\Some One=/home",
    "--remap-path-prefix=C:\\Users\\Some One\\.cargo=/cargo",
    "--remap-path-prefix=C:\\Users\\Some One\\.rustup=/rustup",
    "--remap-path-prefix=C:\\Users\\Some One\\code\\OpenExplainer=/openexplainer",
    "-Clink-arg=/PDBALTPATH:%_PDB%",
  ]);
  assert.equal(folderFlags("C:\\Users\\x", { CARGO_HOME: "D:\\cargo", RUSTUP_HOME: "D:\\rustup" }, "D:\\repo")[1], "--remap-path-prefix=D:\\cargo=/cargo", "a Rust folder somewhere else is the one replaced");
});

test("a program that names the user folder is found, as text or as UTF-16 and with either kind of slash, and others are not", () => {
  const dir = mkdtempSync(join(tmpdir(), "oe-build-test-"));
  try {
    const home = "C:\\Users\\Some One";
    const files: Record<string, Buffer> = {
      plain: Buffer.from("panicked at C:\\USERS\\some one\\.cargo\\registry\\src\\x.rs"),
      slashes: Buffer.from("C:/Users/Some One/.cargo/registry"),
      wide: Buffer.from("C:\\Users\\Some One\\x", "utf16le"),
      clean: Buffer.from("/cargo/registry/src/x.rs and /home and C:\\Users\\Someone Else"),
    };
    for (const [name, bytes] of Object.entries(files)) writeFileSync(join(dir, name), bytes);
    const found = namingUserFolder(Object.keys(files).map((n) => join(dir, n)), home).map((f: string) => f.split(/[\\/]/).pop());
    assert.deepEqual(found, ["plain", "slashes", "wide"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("only the mode Tauri's installer script defines counts, not the lines for the other modes that sit inside an !if", () => {
  const script = '!define INSTALLWEBVIEW2MODE "embedBootstrapper"\n!if "${INSTALLWEBVIEW2MODE}" == "downloadBootstrapper"\n  NSISdl::download "https://example" "$TEMP\\x.exe"\n!endif\n';
  assert.equal(webviewMode(script), "embedBootstrapper");
  assert.equal(webviewMode('  !define INSTALLWEBVIEW2MODE "downloadBootstrapper"\r\n'), "downloadBootstrapper");
  assert.equal(webviewMode("nothing here"), null);
  assert.match(RELEASE, /^\d+\.\d+\.\d+(-(alpha|beta|rc)\.\d+)?$/, "the release is a version Check for updates can compare");
});
