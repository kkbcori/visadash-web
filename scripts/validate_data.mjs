#!/usr/bin/env node
// Validate every data/*.json against data/schema.mjs. Exit non-zero on any failure.
// Run in CI (on PRs touching data/) and locally via `npm run validate:data`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATASETS, validateDataset, daysSince, STALE_DAYS } from "../data/schema.mjs";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
let failed = 0;
for (const { name, file } of DATASETS) {
  const p = path.join(DATA, file);
  let obj;
  try { obj = JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { console.error(`✗ ${file}: unreadable/invalid JSON — ${e.message}`); failed++; continue; }
  const { ok, errors } = validateDataset(name, obj);
  const age = daysSince(obj.fetched_at);
  if (ok) console.log(`✓ ${file} — valid, ${age}d old${age > STALE_DAYS ? " (STALE, UI will warn)" : ""}`);
  else { console.error(`✗ ${file}:\n   - ${errors.join("\n   - ")}`); failed++; }
}
if (failed) { console.error(`\n${failed} dataset(s) failed validation.`); process.exit(1); }
console.log("\nAll datasets valid.");
