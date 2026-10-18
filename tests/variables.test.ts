import { test } from "node:test";
import assert from "node:assert/strict";
import { addNode, cleanVariableName, createProject, expandVariables, findNodes, replaceInTitles } from "../src/project/model.ts";

test("variables fill in, and unset ones stay visible", () => {
  const vars = { PRODUCT: "OpenStage", VERSION: "" };
  assert.equal(expandVariables("Use {{PRODUCT}} {{VERSION}} {{OTHER}}", vars), "Use OpenStage {{VERSION}} {{OTHER}}");
});

test("variable names are made safe", () => {
  assert.equal(cleanVariableName(" my var! "), "MY_VAR");
  assert.equal(cleanVariableName("***"), "");
});

test("find and replace in titles", () => {
  const p = createProject("X");
  addNode(p.tree, null, "Getting started");
  const b = addNode(p.tree, null, "Start here");
  addNode(p.tree, b.id, "Restart (start over)");
  assert.equal(findNodes(p.tree, "start", false).length, 3);
  assert.equal(findNodes(p.tree, "start", true).length, 2);
  assert.equal(findNodes(p.tree, "Start", true).length, 1);
  assert.equal(findNodes(p.tree, "", false).length, 0);
  assert.equal(replaceInTitles(p.tree, "start", "begin", false), 4);
  assert.deepEqual(p.tree.map((n) => n.title), ["Getting begined", "begin here"]);
  assert.equal(replaceInTitles(p.tree, "(begin over)", "$&", false), 1);
  assert.equal(p.tree[1].children[0].title, "Rebegin $&");
});

test("special characters in the search text are taken literally", () => {
  const p = createProject("X");
  addNode(p.tree, null, "Cost $5 (maybe) a.b");
  assert.equal(replaceInTitles(p.tree, "$5 (maybe)", "free", true), 1);
  assert.equal(p.tree[0].title, "Cost free a.b");
  assert.equal(findNodes(p.tree, ".", true).length, 1);
  assert.equal(findNodes(p.tree, "a.c", true).length, 0);
});
