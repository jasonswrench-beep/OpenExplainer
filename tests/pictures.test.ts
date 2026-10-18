import { test } from "node:test";
import assert from "node:assert/strict";
import { addNode, addPicture, createProject, pictureFiles, removePicture, setAltText, type Picture } from "../src/project/model.ts";
import { packProject, unpackProject } from "../src/project/package.ts";
import { migrate } from "../src/project/migrate.ts";
import { readImageInfo } from "../src/project/image.ts";

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

function jpeg(width: number, height: number): Uint8Array {
  // Start, a small comment segment, then a start-of-frame segment carrying the size.
  const b = new Uint8Array(30);
  b.set([0xff, 0xd8, 0xff, 0xfe, 0x00, 0x04, 0x41, 0x42, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  const v = new DataView(b.buffer);
  v.setUint16(13, height);
  v.setUint16(15, width);
  return b;
}

const pic = (file: string): Picture => ({ id: "p1", file, width: 10, height: 20, altText: "", source: { kind: "import", capturedAt: "2026-01-01T00:00:00Z" } });

test("picture sizes are read from PNG and JPEG, and other files are refused", () => {
  assert.deepEqual(readImageInfo(png(1920, 1080)), { type: "png", extension: "png", mime: "image/png", width: 1920, height: 1080 });
  assert.deepEqual(readImageInfo(jpeg(800, 600)), { type: "jpeg", extension: "jpg", mime: "image/jpeg", width: 800, height: 600 });
  assert.equal(readImageInfo(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), null);
  assert.equal(readImageInfo(new TextEncoder().encode("GIF89a not supported here......")), null);
});

test("pictures are saved inside the project file and come back", async () => {
  const p = createProject("Book");
  const ch = addNode(p.tree, null, "Chapter");
  const bytes = png(640, 480);
  addPicture(p.tree, ch.id, pic("images/p1.png"));
  setAltText(p.tree, ch.id, "p1", "The Notepad window");
  const back = await unpackProject(packProject(p, new Map([["images/p1.png", bytes]])));
  assert.deepEqual(back.project, p);
  assert.deepEqual(back.assets.get("images/p1.png"), bytes);
  assert.deepEqual(back.missing, []);
});

test("removed pictures are not saved, and a missing file is reported", async () => {
  const p = createProject("Book");
  const ch = addNode(p.tree, null, "Chapter");
  addPicture(p.tree, ch.id, pic("images/p1.png"));
  const assets = new Map([["images/p1.png", png(1, 1)], ["images/old.png", png(2, 2)]]);
  const back = await unpackProject(packProject(p, assets));
  assert.deepEqual([...back.assets.keys()], ["images/p1.png"]);
  assert.ok(removePicture(p.tree, ch.id, "p1"));
  assert.equal(pictureFiles(p.tree).size, 0);
  addPicture(p.tree, ch.id, pic("images/gone.png"));
  const lost = await unpackProject(packProject(p, new Map()));
  assert.deepEqual(lost.missing, ["images/gone.png"]);
});

test("a version 1 project upgrades to version 2 with empty picture lists", () => {
  const v1 = { version: 1, name: "Old", template: "empty", variables: {}, tree: [{ id: "a", title: "A", status: "drafted", children: [{ id: "b", title: "B", status: "not-started", children: [] }] }] };
  const up = migrate(JSON.parse(JSON.stringify(v1)));
  assert.equal(up.version, 2);
  assert.deepEqual(up.tree[0].pictures, []);
  assert.deepEqual(up.tree[0].children[0].pictures, []);
  assert.equal(up.tree[0].status, "drafted");
});
