// The parts of the outside-checks scripts that need no network and no program: reading what a checker says. Tested in tests/outside-checks.test.ts.
// The outside checks (list item 5) run two free checkers over what OpenExplainer exports, because its exports were only ever tried by its own tests:
// EPUBCheck (the W3C's checker for e-books) and veraPDF (a checker for PDF/UA, the standard for accessible PDFs). Neither is part of OpenExplainer or sent with it.

/** The major version in the words `java -version` prints ("1.8.0_501" is 8, "25.0.3" is 25, openjdk version "17.0.9" is 17), or null. */
export function javaMajor(output: string): number | null {
  const match = /version\s+"?(\d+)(?:\.(\d+))?/i.exec(output);
  if (!match) return null;
  const first = Number(match[1]);
  return first === 1 && match[2] !== undefined ? Number(match[2]) : first;
}

/** The first Java that is new enough, in the order given, or null. */
export function pickJava(candidates: { path: string; major: number | null }[], atLeast: number): string | null {
  return candidates.find((c) => c.major !== null && c.major >= atLeast)?.path ?? null;
}

/** The download of EPUBCheck in a GitHub release's JSON: its name, address and size, or null if the release has none. */
export function epubcheckAsset(release: unknown): { name: string; url: string; size: number } | null {
  const assets = (release as { assets?: unknown })?.assets;
  if (!Array.isArray(assets)) return null;
  for (const a of assets as { name?: unknown; browser_download_url?: unknown; size?: unknown }[]) {
    if (typeof a.name === "string" && /^epubcheck-[\d.]+\.zip$/.test(a.name) && typeof a.browser_download_url === "string" && a.browser_download_url.startsWith("https://github.com/w3c/epubcheck/")) {
      return { name: a.name, url: a.browser_download_url, size: typeof a.size === "number" ? a.size : 0 };
    }
  }
  return null;
}

export interface EpubCheckResult {
  fatal: number;
  errors: number;
  warnings: number;
  infos: number;
}

/** EPUBCheck ends with "Messages: 0 fatal / 0 errors / 0 warnings / 0 infos". */
export function epubcheckSummary(output: string): EpubCheckResult | null {
  const m = /Messages:\s*(\d+)\s*fatal\s*\/\s*(\d+)\s*errors?\s*\/\s*(\d+)\s*warnings?\s*\/\s*(\d+)\s*infos?/i.exec(output);
  return m ? { fatal: Number(m[1]), errors: Number(m[2]), warnings: Number(m[3]), infos: Number(m[4]) } : null;
}

/** The sentence to say about an EPUBCheck result. */
export function epubcheckWords(result: EpubCheckResult | null, exitCode: number | null): string {
  if (!result) return `EPUBCheck did not give a summary (it ended with code ${exitCode ?? "unknown"}). Read its report.`;
  const said = `${result.fatal} fatal, ${result.errors} errors, ${result.warnings} warnings, ${result.infos} notes.`;
  return result.fatal + result.errors === 0 ? `EPUBCheck found no errors: ${said}` : `EPUBCheck found problems: ${said}`;
}

/** veraPDF's plain text report starts a line with PASS or FAIL for each file and profile. `null` when neither is there. */
export function veraPdfPassed(output: string): boolean | null {
  const lines = output.split(/\r?\n/).map((l) => l.trim());
  if (lines.some((l) => /^FAIL\b/.test(l))) return false;
  if (lines.some((l) => /^PASS\b/.test(l))) return true;
  return null;
}

/** The sentence to say about a veraPDF result. */
export function veraPdfWords(passed: boolean | null): string {
  if (passed === null) return "veraPDF did not give a PASS or FAIL. Read its report.";
  return passed ? "veraPDF says the PDF meets PDF/UA-1." : "veraPDF says the PDF does not meet PDF/UA-1. Its report lists each rule that failed.";
}
