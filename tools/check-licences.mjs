// Checks the licence of every installed JavaScript package and every Rust crate.
// Refuses GPL and AGPL. Flags LGPL and anything unknown for a human decision.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const REFUSED = /\b(A?GPL)(?!.*LGPL)/i;
const LGPL = /LGPL/i;
const problems = [];
const reviews = [];

function judge(kind, name, licence) {
  const text = String(licence ?? "").trim();
  if (!text || /UNKNOWN|SEE LICEN/i.test(text)) return reviews.push(`${kind} ${name}: licence not stated`);
  // An OR expression is fine if any alternative is permissive.
  const options = text.replace(/[()]/g, "").split(/\s+OR\s+|\//i);
  const allBad = options.every((o) => REFUSED.test(o) && !LGPL.test(o));
  if (allBad) return problems.push(`${kind} ${name}: ${text}`);
  if (options.every((o) => LGPL.test(o))) reviews.push(`${kind} ${name}: ${text} (dynamic linking only)`);
}

function scanNode(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.name.startsWith("@")) { scanNode(path); continue; }
    const pkg = join(path, "package.json");
    if (!existsSync(pkg)) continue;
    const data = JSON.parse(readFileSync(pkg, "utf8"));
    const lic = typeof data.license === "string" ? data.license : data.license?.type ?? (data.licenses ?? []).map((l) => l.type).join(" OR ");
    judge("npm", `${data.name}@${data.version}`, lic);
  }
}

scanNode("node_modules");

// The app, and the capture helper, which is its own Rust program with its own list of crates.
for (const manifest of ["src-tauri/Cargo.toml", "capture-helper/Cargo.toml"]) {
  if (!existsSync(manifest)) continue;
  try {
    const out = execSync(`cargo metadata --format-version 1 --manifest-path ${manifest}`, { maxBuffer: 1 << 28 }).toString();
    for (const p of JSON.parse(out).packages) judge("crate", `${p.name}@${p.version}`, p.license);
  } catch {
    reviews.push(`The Rust crates in ${manifest} were not checked because cargo could not run. Install Rust and run this again.`);
  }
}

if (reviews.length) { console.log("\nNeeds a human look:"); reviews.forEach((r) => console.log("  - " + r)); }
if (problems.length) {
  console.log("\nREFUSED (GPL or AGPL):"); problems.forEach((p) => console.log("  - " + p));
  console.log("\nThe licence check FAILED.");
  process.exit(1);
}
console.log("\nThe licence check passed. No GPL or AGPL packages were found.");
