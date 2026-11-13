// Every page of an exported help site carries its own content security policy (security review, 2026-11-13): scripts only from the site's own files.
// It was tried in a real browser, from the disk and from a web server: the search still works, and an inline script or event handler does not run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addNode, createProject } from "../src/project/model.ts";
import { buildHelpSiteText, HELP_SITE_CSP } from "../src/export/help-site.ts";

test("every page of the help site says that only its own scripts may run", () => {
  const project = createProject("Policy");
  addNode(project.tree, null, "First");
  addNode(project.tree, null, "Second");
  const pages = Object.entries(buildHelpSiteText(project, new Map())).filter(([name]) => name.endsWith(".html"));
  assert.ok(pages.length >= 3, "a first page and one for each topic");
  for (const [name, html] of pages) {
    assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${HELP_SITE_CSP}">`), name);
    assert.ok(!/<script>/.test(html), `${name} has no inline script`);
  }
  assert.match(HELP_SITE_CSP, /script-src 'self'(;|$)/);
  assert.ok(!HELP_SITE_CSP.includes("unsafe-eval") && !/script-src[^;]*unsafe-inline/.test(HELP_SITE_CSP), "no inline or evaluated script is allowed");
});
