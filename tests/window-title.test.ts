import test from "node:test";
import assert from "node:assert/strict";
import { setWindowTitle, windowTitle } from "../src/window-title.ts";

test("the window title names the project and says in words when there are unsaved changes", () => {
  assert.equal(windowTitle("User Guide", false), "User Guide - OpenExplainer");
  assert.equal(windowTitle("User Guide", true), "User Guide (unsaved changes) - OpenExplainer");
});

test("a project with no name still gets a title", () => {
  assert.equal(windowTitle("   ", false), "Untitled project - OpenExplainer");
});

test("setting the title outside the program does nothing and does not fail", async () => {
  await setWindowTitle("Anything - OpenExplainer");
});
