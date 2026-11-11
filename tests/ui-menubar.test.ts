// Copied from OpenStage Author (editor/src/menubar.test.ts, Apache-2.0, the same owner) for the OpenStage suite's look; see NOTICE. Keep the two alike:
// a fix in one belongs in the other.
// The parts of the menu bar that need no page: moving through a list and finding by letter. The bar itself was driven by keyboard in
// the browser, and its icons are made by OpenStage Author's tools/make_ui_icons.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { letterIndex, stepIndex } from "../src/ui/menubar.ts";
import { UI_ICONS } from "../src/ui/uiicons.gen.ts";

test("Up and Down go round at the ends, and the first press from nowhere lands on the first or the last item", () => {
  assert.equal(stepIndex(0, 5, 1), 1);
  assert.equal(stepIndex(4, 5, 1), 0, "Down on the last item goes to the first");
  assert.equal(stepIndex(0, 5, -1), 4, "Up on the first item goes to the last");
  assert.equal(stepIndex(-1, 5, 1), 0);
  assert.equal(stepIndex(-1, 5, -1), 4);
  assert.equal(stepIndex(0, 0, 1), -1, "an empty menu has nowhere to go");
});

test("a letter goes to the next item that starts with it, going round, and ignores case and spaces", () => {
  const labels = ["Narration...", "Timing...", "Timeline", "Record the screen (OpenScreen)..."];
  assert.equal(letterIndex(labels, 0, "t"), 1);
  assert.equal(letterIndex(labels, 1, "T"), 2, "pressed again, it moves on to the next one");
  assert.equal(letterIndex(labels, 2, "t"), 1, "and round to the first again");
  assert.equal(letterIndex(labels, 3, "n"), 0);
  assert.equal(letterIndex(labels, 0, "z"), -1, "no item starts with z");
  assert.equal(letterIndex(labels, 0, " "), -1, "a space is not a letter to look for");
  assert.equal(letterIndex(labels, 0, "ti"), -1, "only one letter at a time");
});

test("every icon the menus and the navy bar use is drawn from real shapes", () => {
  for (const name of ["save", "camera", "clipboard-check", "file-output", "chevron-down", "check", "plus", "ellipsis", "x"] as const) {
    assert.ok(UI_ICONS[name].length > 0, `${name} has shapes`);
  }
});
