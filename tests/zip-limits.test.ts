// The zip reader's limits (src/project/zip.ts), from the security review of 2026-11-13: a file made to unpack to far more than it holds is refused before it
// fills the memory, and a name such as __proto__ inside a package is only a name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_ENTRY_BYTES, unzip, zip } from "../src/project/zip.ts";

/** Python, used as "another program" that makes compressed zips: on Windows it is python, elsewhere python3. */
const PYTHON = process.platform === "win32" ? "python" : "python3";

test("a file called __proto__ or constructor inside a package is read as a file, and changes nothing else", async () => {
  const files = await unzip(zip({ __proto__x: new Uint8Array([1]), ["__proto__"]: new Uint8Array([2]), constructor: new Uint8Array([3]) } as Record<string, Uint8Array>));
  assert.deepEqual(Object.keys(files).sort(), ["__proto__", "__proto__x", "constructor"].sort());
  assert.deepEqual([...files["__proto__"]], [2]);
  assert.deepEqual([...files["constructor"]], [3]);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("a compressed file that unpacks to more than it says is stopped while it unpacks, and one that says it is too large is refused before", async () => {
  const dir = mkdtempSync(join(tmpdir(), "oe-zip-limits-"));
  try {
    const file = join(dir, "bomb.zip");
    // Five million spaces compress to a few kilobytes.
    execFileSync(PYTHON, ["-c", "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED);z.writestr('project.json',' '*5000000);z.close()", file]);
    const honest = new Uint8Array(readFileSync(file));
    assert.equal((await unzip(honest))["project.json"].length, 5_000_000, "an honest compressed file is read whole");

    const centralAt = (bytes: Uint8Array) => {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let i = bytes.length - 4; i >= 0; i--) if (view.getUint32(i, true) === 0x02014b50) return { view, at: i };
      throw new Error("no central directory");
    };
    // It says it unpacks to 100 bytes: the unpacking stops at 100.
    const lying = new Uint8Array(honest);
    const a = centralAt(lying);
    a.view.setUint32(a.at + 24, 100, true);
    await assert.rejects(unzip(lying), /unpacks to more than OpenExplainer will read/);
    // It says it unpacks to more than one file may: refused before anything is unpacked.
    const huge = new Uint8Array(honest);
    const b = centralAt(huge);
    b.view.setUint32(b.at + 24, MAX_ENTRY_BYTES + 1, true);
    await assert.rejects(unzip(huge), /unpacks to more than OpenExplainer will read/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
