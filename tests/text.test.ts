import test from "node:test";
import assert from "node:assert/strict";
import { applyMark, cleanRuns, formatMarks, parseMarks, plainText, type Run } from "../src/project/text.ts";

test("plain text is one run, and an empty box is no runs", () => {
  assert.deepEqual(parseMarks("Open the file."), [{ text: "Open the file." }]);
  assert.deepEqual(parseMarks(""), []);
});

test("bold, italic and a control name are marked, and the markers themselves are not part of the text", () => {
  assert.deepEqual(parseMarks("Press **Save** now, *really*, or choose [[File > Save As]] instead."), [
    { text: "Press " }, { text: "Save", mark: "bold" }, { text: " now, " }, { text: "really", mark: "italic" },
    { text: ", or choose " }, { text: "File > Save As", mark: "control" }, { text: " instead." },
  ]);
});

test("a marker with no partner, or with spaces against it, is ordinary text", () => {
  for (const text of ["2 * 3 * 4", "**not closed", "a [[b", "price is *", "** spaced **", "[[ ]]", "[[]]", "**"]) {
    assert.deepEqual(parseMarks(text), [{ text }], text);
  }
});

test("a backslash makes the next star or bracket an ordinary letter", () => {
  assert.deepEqual(parseMarks("a \\*b\\* c"), [{ text: "a *b* c" }]);
  assert.deepEqual(parseMarks("\\[[x]]"), [{ text: "[[x]]" }]);
  assert.deepEqual(parseMarks("**a\\*b**"), [{ text: "a*b", mark: "bold" }]);
  assert.deepEqual(parseMarks("path\\\\file"), [{ text: "path\\file" }]);
  assert.deepEqual(parseMarks("a\\b"), [{ text: "a\\b" }], "a backslash before an ordinary letter stays");
});

test("variables are ordinary text", () => {
  assert.deepEqual(parseMarks("Start {{PRODUCT}} **{{VERSION}}**"), [{ text: "Start {{PRODUCT}} " }, { text: "{{VERSION}}", mark: "bold" }]);
});

test("runs go back to the text a person edits, and back again, without change", () => {
  const samples = [
    "Press **Save** now.", "*one* **two** [[three]]", "plain", "a \\* b", "[[Home]] > [[Format]]", "**a**b*c*", "x \\[\\[y\\]\\] z", "**bold *with* star**", "",
  ];
  for (const text of samples) {
    const runs = parseMarks(text);
    assert.deepEqual(parseMarks(formatMarks(runs)), runs, text);
  }
  const hard: Run[] = [{ text: "a*b" }, { text: "c[d", mark: "bold" }, { text: "e\\f", mark: "control" }, { text: "g]h" }];
  assert.deepEqual(parseMarks(formatMarks(hard)), hard, "text full of special letters survives");
});

test("neighbours with the same mark are joined, so a page never holds two runs that could be one", () => {
  assert.deepEqual(parseMarks("**a****b**"), [{ text: "ab", mark: "bold" }]);
  assert.deepEqual(cleanRuns([{ text: "a" }, { text: "b" }, { text: "c", mark: "bold" }, { text: "d", mark: "bold" }]), [{ text: "ab" }, { text: "cd", mark: "bold" }]);
});

test("the words with no marks, for searching and screen readers", () => {
  assert.equal(plainText(parseMarks("Press **Save** or [[File]]")), "Press Save or File");
});

test("runs read from a file keep only text with a known mark", () => {
  assert.deepEqual(
    cleanRuns([{ text: "ok" }, { text: "x", mark: "bold" }, { text: "y", mark: "huge" }, { text: 5 }, null, "text", { text: "" }, { mark: "bold" }]),
    [{ text: "ok" }, { text: "x", mark: "bold" }, { text: "y" }],
  );
  assert.deepEqual(cleanRuns("not a list"), []);
  assert.deepEqual(cleanRuns(undefined), []);
});

test("a mark is put round the selected words, keeping spaces outside the markers", () => {
  assert.deepEqual(applyMark("Press Save now", 6, 10, "bold"), { text: "Press **Save** now", start: 8, end: 12 });
  assert.deepEqual(applyMark("Press Save now", 5, 11, "italic"), { text: "Press *Save* now", start: 7, end: 11 }, "the spaces stay outside");
  assert.deepEqual(applyMark("Press Save now", 6, 10, "control"), { text: "Press [[Save]] now", start: 8, end: 12 });
  assert.equal(applyMark("Press Save now", 6, 6, "bold"), null, "nothing selected");
  assert.equal(applyMark("a   b", 1, 4, "bold"), null, "only spaces selected");
  const done = applyMark("Press Save now", 6, 10, "bold")!;
  assert.deepEqual(parseMarks(done.text), [{ text: "Press " }, { text: "Save", mark: "bold" }, { text: " now" }]);
});
