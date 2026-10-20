import test from "node:test";
import assert from "node:assert/strict";
import { checkPosition, checkStyleInput, COLOR_PRESETS, normalizeColor } from "../src/project/highlight.ts";
import { describeClickDetails } from "../src/project/clicks.ts";

const good = { show: true, size: "3", color: "FFD600", seeThrough: "40" };

test("good boxes in the settings dialog make a look, with the colour tidied", () => {
  assert.deepEqual(checkStyleInput(good), { ok: true, style: { show: true, size: 3, color: "#FFD600", seeThrough: 40 } });
  assert.deepEqual(checkStyleInput({ show: false, size: " 2.5 ", color: "#0a0", seeThrough: "0" }), { ok: true, style: { show: false, size: 2.5, color: "#00AA00", seeThrough: 0 } });
});

test("a mistake in a box is explained in plain words and names the box", () => {
  const cases: [Partial<typeof good>, string, RegExp][] = [
    [{ size: "big" }, "size", /Type the size as a number from 1 to 20, such as 3\. "big" is not one\./],
    [{ size: "" }, "size", /^Type the size as a number from 1 to 20, such as 3\.$/],
    [{ size: "0.5" }, "size", /size must be from 1 to 20 percent of the picture's width/],
    [{ size: "21" }, "size", /size must be from 1 to 20/],
    [{ size: "-3" }, "size", /"-3" is not one/],
    [{ color: "pink" }, "color", /Type the colour as six hex digits, such as FFD600\. "pink" is not one\./],
    [{ color: "#12" }, "color", /"#12" is not one/],
    [{ seeThrough: "lots" }, "seeThrough", /Type the see-through level as a number from 0 to 100, such as 40\. "lots" is not one\./],
    [{ seeThrough: "101" }, "seeThrough", /see-through level must be from 0 to 100 percent/],
  ];
  for (const [change, field, pattern] of cases) {
    const checked = checkStyleInput({ ...good, ...change });
    assert.equal(checked.ok, false, JSON.stringify(change));
    if (!checked.ok) {
      assert.equal(checked.field, field, JSON.stringify(change));
      assert.match(checked.message, pattern);
      assert.ok(!/undefined|NaN/.test(checked.message), checked.message);
    }
  }
});

test("the first mistake is the one reported, in the order the boxes are on screen", () => {
  const checked = checkStyleInput({ show: true, size: "x", color: "y", seeThrough: "z" });
  assert.ok(!checked.ok && checked.field === "size");
});

test("every ready-made colour is a good colour, and they are all different", () => {
  assert.ok(COLOR_PRESETS.length >= 5);
  for (const preset of COLOR_PRESETS) assert.equal(normalizeColor(preset.code), preset.code, preset.name);
  assert.equal(new Set(COLOR_PRESETS.map((p) => p.code)).size, COLOR_PRESETS.length);
  assert.equal(COLOR_PRESETS[0].code, "#FFD600", "yellow is first, the starting colour");
});

test("a position for the circle is two whole numbers inside the picture", () => {
  assert.deepEqual(checkPosition({ x: "400", y: "250" }, 1920, 1080), { ok: true, x: 400, y: 250 });
  assert.deepEqual(checkPosition({ x: " 0 ", y: "1080" }, 1920, 1080), { ok: true, x: 0, y: 1080 });
  const cases: [{ x: string; y: string }, string, RegExp][] = [
    [{ x: "abc", y: "5" }, "x", /Type how far across as a whole number from 0 to 1920, such as 960\. "abc" is not one\./],
    [{ x: "", y: "5" }, "x", /^Type how far across as a whole number from 0 to 1920, such as 960\.$/],
    [{ x: "5", y: "1.5" }, "y", /Type how far down as a whole number from 0 to 1080, such as 540\. "1.5" is not one\./],
    [{ x: "1921", y: "5" }, "x", /The picture is 1920 pixels wide\. Type how far across as a number from 0 to 1920\./],
    [{ x: "5", y: "1081" }, "y", /The picture is 1080 pixels high\. Type how far down as a number from 0 to 1080\./],
    [{ x: "-5", y: "5" }, "x", /"-5" is not one/],
  ];
  for (const [input, field, pattern] of cases) {
    const checked = checkPosition(input, 1920, 1080);
    assert.ok(!checked.ok, JSON.stringify(input));
    if (!checked.ok) { assert.equal(checked.field, field); assert.match(checked.message, pattern); }
  }
});

test("the details of a click for the picture list: where it was, what Windows said, and the outline", () => {
  assert.deepEqual(
    describeClickDetails({ x: 196, y: 453, button: "left", target: { role: "button", name: "Save", description: "Saves your work", bounds: { x: 121, y: 431, width: 150, height: 44 } } }),
    ["Click at 196 across and 453 down in the picture.", 'Windows describes it as "Saves your work".', "Its outline is 150 by 44 pixels, 121 across and 431 down."],
  );
  assert.deepEqual(describeClickDetails({ x: 1, y: 2, button: "right", double: true }), ["Double-click at 1 across and 2 down in the picture."]);
  assert.deepEqual(describeClickDetails({ x: 1, y: 2, button: "middle" }), ["Middle-click at 1 across and 2 down in the picture."]);
  assert.deepEqual(describeClickDetails({ x: 5, y: 6, button: "left", target: { password: true } }), ["Click at 5 across and 6 down in the picture."], "a password box says nothing more");
});
