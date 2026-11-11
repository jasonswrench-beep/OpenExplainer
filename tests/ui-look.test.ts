// The OpenStage suite's look in OpenExplainer: the list of commands and where each is, the parts every dialog gets, the list of keys
// and the Properties sections. The window itself was driven by keyboard and mouse in a browser (the menus, the panes' buttons, the
// command search, the dialogs, a narrow window, a high-contrast theme).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BAR_BUTTONS, COMMANDS, MENUS, PANE_MENUS, iconsUsed, type CommandId } from "../src/ui/commands.ts";
import { isButtonRow, leavesDialog, mainButtonOf } from "../src/ui/dialogchrome.ts";
import { KEY_GROUPS, keyGroupsFirst } from "../src/ui/keys.ts";
import { sectionOpen } from "../src/ui/sections.ts";
import { UI_ICONS } from "../src/ui/uiicons.gen.ts";

const ids = Object.keys(COMMANDS) as CommandId[];

test("every command is in a menu, so nothing that had a button is lost", () => {
  const inMenus = new Set(MENUS.flatMap((m) => m.items));
  for (const id of ids) assert.ok(inMenus.has(id), `${id} (${COMMANDS[id].label}) is in no menu`);
});

test("every button the window used to have is a command, under the same id", () => {
  const before = ["b-new", "b-open", "b-save", "b-saveas", "b-export", "b-import-export", "b-import-word", "b-review-in", "b-import-translation", "b-vars",
    "b-style", "b-look", "b-reuse", "b-history", "b-drafts", "b-guides", "b-index", "b-ai", "b-mcp", "b-check", "b-chapter", "b-topic", "b-rename", "b-up",
    "b-down", "b-indent", "b-outdent", "b-delete", "b-unresolved", "b-opener", "b-summary", "b-boxes", "b-import", "b-capture", "b-draft-topic", "b-procedure",
    "b-highlight", "b-zoom"];
  for (const id of before) assert.ok(id in COMMANDS, `${id} lost`);
});

test("the menus, the bar and the panes' menus name only commands, each once in a menu", () => {
  for (const m of MENUS) {
    const items = m.items.filter((i) => i !== "-");
    assert.equal(new Set(items).size, items.length, `${m.label} lists something twice`);
    assert.notEqual(m.items[0], "-");
    assert.notEqual(m.items[m.items.length - 1], "-");
  }
  for (const list of Object.values(PANE_MENUS)) for (const id of list) if (id !== "-") assert.ok(id in COMMANDS, id);
  assert.ok(BAR_BUTTONS.length <= 5, "at most five buttons in the navy bar");
  for (const b of BAR_BUTTONS) assert.ok(b.id in COMMANDS && COMMANDS[b.id].label.startsWith(b.word.replace(/\.\.\.$/, "")), `${b.word} is the start of its command's name`);
});

test("each command has words, a description and an icon the program has", () => {
  for (const id of ids) {
    const c = COMMANDS[id];
    assert.ok(c.label.trim() && c.title.trim(), id);
    assert.ok(c.icon in UI_ICONS, `${id}: ${c.icon}`);
    assert.ok(!/—/.test(c.label + c.title), `${id} has a long dash`);
  }
  for (const icon of [...iconsUsed(), "chevron-down", "check", "x", "plus", "ellipsis", "search", "file-text", "link", "funnel", "square-pen"]) assert.ok(icon in UI_ICONS, icon);
});

test("the icon file is made from the suite's list and carries the licence", () => {
  const text = readFileSync(new URL("../src/ui/uiicons.gen.ts", import.meta.url), "utf-8");
  assert.match(text, /^\/\/ SPDX-License-Identifier: Apache-2\.0 AND ISC/);
  assert.match(text, /--explainer pointing at this file/);
  assert.match(text, /ISC License/);
});

test("a dialog's main button is the first that does something, never Cancel or Close", () => {
  assert.equal(mainButtonOf(["OK", "Cancel"]), 0);
  assert.equal(mainButtonOf(["Cancel", "Delete"]), 1);
  assert.equal(mainButtonOf(["Close"]), -1);
  assert.equal(mainButtonOf(["Keep them", "Throw away"]), 0, "throwing work away is never the filled button");
  for (const w of ["Cancel", "close", "Done.", "Not now"]) assert.ok(leavesDialog(w), w);
  assert.ok(!leavesDialog("Close project"));
});

test("a row of buttons is found as a dialog's foot; a paragraph with words is not", () => {
  assert.ok(isButtonRow([{ tag: "BUTTON", text: "OK" }, { tag: "#text", text: " " }, { tag: "BUTTON", text: "Cancel" }]));
  assert.ok(!isButtonRow([{ tag: "#text", text: "Choose one." }, { tag: "BUTTON", text: "OK" }]));
  assert.ok(!isButtonRow([{ tag: "LABEL", text: "Name" }, { tag: "INPUT", text: "" }]));
  assert.ok(!isButtonRow([]));
});

test("the keys list has every group once, and one can be listed first", () => {
  assert.equal(new Set(KEY_GROUPS.map((g) => g.id)).size, KEY_GROUPS.length);
  assert.equal(keyGroupsFirst("tree")[0]!.id, "tree");
  assert.deepEqual(keyGroupsFirst("nothing").map((g) => g.id), KEY_GROUPS.map((g) => g.id));
  const listed = KEY_GROUPS.flatMap((g) => g.rows.map((r) => r.keys)).join(" | ");
  for (const keys of Object.values(COMMANDS).flatMap((c) => ("keys" in c ? [c.keys] : []))) {
    for (const part of keys.split(/,\s*/)) assert.ok(listed.includes(part.trim().split("+")[0]!), `${keys} is in the keys list`);
  }
});

test("a section is open as it starts until the author opens or closes it", () => {
  assert.equal(sectionOpen("a", true, new Map()), true);
  assert.equal(sectionOpen("a", false, new Map()), false);
  assert.equal(sectionOpen("a", true, new Map([["a", false]])), false);
});
