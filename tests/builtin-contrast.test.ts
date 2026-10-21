// The contrast checker also covers what the program draws by itself: the callout box styles, the callout markers and the status words in the tree. These tests read the real
// colours (the stylesheet and the status list) and check them against the same WCAG 2.2 AA minimums a mark gets, so a change to a colour that makes it too faint fails here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkContrast, GRAPHIC_MIN, TEXT_MIN } from "../src/project/contrast.ts";
import { STATUSES } from "../src/project/model.ts";
import { CALLOUT_KINDS } from "../src/project/page.ts";
import { CALLOUT_COLOR } from "../src/render/overlay.ts";

const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

/** The value of a property in the first rule of a selector in the stylesheet. */
function ruleValue(selector: string, property: string): string {
  const rule = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  assert.ok(rule, `${selector} is in the stylesheet`);
  const value = rule![1].match(new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`));
  assert.ok(value, `${selector} has ${property}`);
  return value![1].trim();
}

test("the border of every callout box style stands out from the box, at least 3 to 1", () => {
  const background = ruleValue(".pv-box", "background");
  for (const kind of CALLOUT_KINDS) {
    const colour = ruleValue(`.pv-box-${kind.id}`, "border-left-color");
    const check = checkContrast(`${kind.label} box border`, colour, background, GRAPHIC_MIN);
    assert.ok(check && check.ok, check?.words ?? `${kind.label}: not a colour`);
  }
});

test("the words in a callout box and its label are dark enough on the box, at least 4.5 to 1", () => {
  const background = ruleValue(".pv-box", "background");
  const text = ruleValue(".pv-sheet", "color");
  const check = checkContrast("Callout box words", text, background, TEXT_MIN);
  assert.ok(check && check.ok, check?.words);
});

test("the white letter on a lettered callout marker reads at least 4.5 to 1", () => {
  const check = checkContrast("Callout letter on its marker", "#FFFFFF", CALLOUT_COLOR, TEXT_MIN);
  assert.ok(check && check.ok, check?.words);
  assert.ok(check!.ratio > 5.5 && check!.ratio < 5.7);
});

test("the words of every status in the tree are dark enough on white, at least 4.5 to 1", () => {
  for (const status of STATUSES) {
    const check = checkContrast(`Status ${status.word}`, status.color, "#FFFFFF", TEXT_MIN);
    assert.ok(check && check.ok, check?.words);
  }
});

test("the starting red used for new marks is a visible line on white and on black, at least 3 to 1", () => {
  assert.ok(checkContrast("Red on white", "#C62828", "#FFFFFF", GRAPHIC_MIN)!.ok);
  const black = checkContrast("Red on black", "#C62828", "#000000", GRAPHIC_MIN)!;
  assert.ok(black.ok && black.ratio > 3.7 && black.ratio < 3.8, black.words);
  assert.ok(!checkContrast("Red on a mid dark purple", "#C62828", "#4A1A5E", GRAPHIC_MIN)!.ok, "but on a dark purple the dialog warns, which is what a screenshot's wallpaper can be");
});
