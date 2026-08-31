#!/usr/bin/env node
// Refresh the VisaDash datasets from their official sources, VALIDATE before writing,
// and never commit implausible data. Used by .github/workflows/refresh-data.yml
// (monthly + manual). On any failure it writes a summary to $GITHUB_OUTPUT / stdout so
// the workflow opens an issue instead of committing — a broken parser shipping wrong
// dates is far worse than stale data (see the build brief).
//
// The per-source fetch+parse functions are intentionally stubs: scraping travel.state.gov /
// egov.uscis.gov / DOL reliably is a project of its own. Until a parser is implemented it
// THROWS, so the workflow opens an issue and the committed snapshot stays untouched.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATASETS, validateDataset } from "../data/schema.mjs";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const today = () => new Date().toISOString().slice(0, 10);

// ─── source-specific parsers (fill these in to enable auto-refresh) ───
// Each returns a full dataset object ready for validateDataset(); throw to signal "not refreshed".
const PARSERS = {
  async visa_bulletin() { throw new Error("parser not implemented: travel.state.gov visa-bulletin scraper"); },
  async processing_times() { throw new Error("parser not implemented: egov.uscis.gov processing-times API"); },
  async wage_data() { throw new Error("parser not implemented: DOL OFLC disclosure data"); },
  async employers() { throw new Error("parser not implemented: USCIS H-1B Employer Data Hub"); },
};

const results = [];
for (const { name, file } of DATASETS) {
  try {
    const parsed = await PARSERS[name]();
    parsed.fetched_at = today();
    const { ok, errors } = validateDataset(name, parsed);
    if (!ok) { results.push({ name, status: "invalid", errors }); continue; }
    fs.writeFileSync(path.join(DATA, file), JSON.stringify(parsed, null, 2) + "\n");
    results.push({ name, status: "updated" });
  } catch (e) {
    results.push({ name, status: "skipped", errors: [e.message] });
  }
}

const updated = results.filter(r => r.status === "updated");
const problems = results.filter(r => r.status === "invalid");
for (const r of results) console.log(`${r.status.toUpperCase().padEnd(8)} ${r.name}${r.errors ? " — " + r.errors.join("; ") : ""}`);

// Emit workflow outputs
const out = process.env.GITHUB_OUTPUT;
if (out) {
  const summary = results.map(r => `- **${r.name}**: ${r.status}${r.errors ? " — " + r.errors.join("; ") : ""}`).join("\n");
  fs.appendFileSync(out, `updated=${updated.length}\n`);
  fs.appendFileSync(out, `needs_issue=${problems.length > 0 ? "true" : "false"}\n`);
  fs.appendFileSync(out, `summary<<EOF\n${summary}\nEOF\n`);
}

// Non-zero only when we produced INVALID data (a real parser bug). "skipped" (stub / source
// unreachable) is expected until parsers land and must not fail the whole run.
if (problems.length) process.exit(1);
