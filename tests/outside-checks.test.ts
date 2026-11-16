import test from "node:test";
import assert from "node:assert/strict";
import { epubcheckAsset, epubcheckSummary, epubcheckWords, javaMajor, pickJava, veraPdfPassed, veraPdfWords } from "../tools/outside-checks/lib.ts";

test("the Java version is read from what java -version says, old and new style", () => {
  assert.equal(javaMajor('java version "1.8.0_501"\nJava(TM) SE Runtime Environment'), 8);
  assert.equal(javaMajor('openjdk version "17.0.9" 2023-10-17'), 17);
  assert.equal(javaMajor('openjdk version "25.0.3" 2026-04-21'), 25);
  assert.equal(javaMajor("not java"), null);
  assert.equal(javaMajor(""), null);
});

test("the first Java that is new enough is picked, and none is a plain null", () => {
  const found = [{ path: "java", major: 8 }, { path: "C:\\jdk25\\bin\\java.exe", major: 25 }, { path: "C:\\jdk17\\bin\\java.exe", major: 17 }];
  assert.equal(pickJava(found, 11), "C:\\jdk25\\bin\\java.exe");
  assert.equal(pickJava([{ path: "java", major: 8 }, { path: "x", major: null }], 11), null);
  assert.equal(pickJava([], 11), null);
});

test("EPUBCheck's own download is found in a release, and a file from anywhere else is not trusted", () => {
  const release = { assets: [
    { name: "epubcheck-5.2.1.zip.asc", browser_download_url: "https://github.com/w3c/epubcheck/releases/download/v5.2.1/epubcheck-5.2.1.zip.asc", size: 1 },
    { name: "epubcheck-5.2.1.zip", browser_download_url: "https://github.com/w3c/epubcheck/releases/download/v5.2.1/epubcheck-5.2.1.zip", size: 21000000 },
  ] };
  assert.deepEqual(epubcheckAsset(release), { name: "epubcheck-5.2.1.zip", url: "https://github.com/w3c/epubcheck/releases/download/v5.2.1/epubcheck-5.2.1.zip", size: 21000000 });
  assert.equal(epubcheckAsset({ assets: [{ name: "epubcheck-5.2.1.zip", browser_download_url: "https://example.com/epubcheck-5.2.1.zip", size: 1 }] }), null, "only its own repository");
  assert.equal(epubcheckAsset({}), null);
  assert.equal(epubcheckAsset(null), null);
});

test("EPUBCheck's summary is read and said in words", () => {
  const clean = "Validating using EPUB version 3.3 rules.\nNo errors or warnings detected.\nMessages: 0 fatal / 0 errors / 0 warnings / 0 infos\n";
  assert.deepEqual(epubcheckSummary(clean), { fatal: 0, errors: 0, warnings: 0, infos: 0 });
  assert.equal(epubcheckWords(epubcheckSummary(clean), 0), "EPUBCheck found no errors: 0 fatal, 0 errors, 0 warnings, 0 notes.");
  const bad = epubcheckSummary("Messages: 0 fatal / 3 errors / 1 warnings / 2 infos");
  assert.match(epubcheckWords(bad, 1), /found problems: 0 fatal, 3 errors, 1 warnings, 2 notes\./);
  assert.match(epubcheckWords(null, 1), /did not give a summary \(it ended with code 1\)/);
  assert.equal(epubcheckSummary("nothing here"), null);
});

test("veraPDF's PASS and FAIL are read, and a failing file is never called a pass", () => {
  assert.equal(veraPdfPassed("PASS book.pdf ua1"), true);
  assert.equal(veraPdfPassed("FAIL book.pdf ua1"), false);
  assert.equal(veraPdfPassed("PASS a.pdf ua1\nFAIL b.pdf ua1"), false);
  assert.equal(veraPdfPassed("Some other text"), null);
  assert.match(veraPdfWords(true), /meets PDF\/UA-1/);
  assert.match(veraPdfWords(false), /does not meet PDF\/UA-1/);
  assert.match(veraPdfWords(null), /did not give a PASS or FAIL/);
});
