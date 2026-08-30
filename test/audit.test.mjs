// VisaDash audit-engine tests — `node --test`. Synthetic fixtures only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runAudit, nameOutcome, parseI94 } from "../src/engine/audit.mjs";
import { TYPE_BY_ID, parseMRZ } from "../src/engine/doctypes.mjs";

const NOW = Date.parse("2026-08-30");
const ds160 = text => ({ ...TYPE_BY_ID.ds160.extract({ text, lines: text.split("\n").map(s => s.trim()) }) });
const i797 = text => ({ ...TYPE_BY_ID.i797.extract({ text, lines: text.split("\n").map(s => s.trim()) }) });
const i20 = text => ({ ...TYPE_BY_ID.i20.extract({ text, lines: text.split("\n").map(s => s.trim()) }) });
const passportFrom = (l1, l2) => { const p = parseMRZ([l1, l2], l1 + "\n" + l2); return { fields: p.fields, mrz: { checks: p.checks } }; };

const DS_OK = `Nonimmigrant Visa Application DS-160
Surname: SHARMA
Given Names: PRIYA
Date of Birth: 01-JAN-1990
Passport Number: Z1234567
Intended Date of Arrival: 15-DEC-2026`;

// MRZ for SHARMA / PRIYA, passport Z1234567, DOB 1990-01-01, expiry 2030-01-01
const PASS_L1 = "P<INDSHARMA<<PRIYA<<<<<<<<<<<<<<<<<<<<<<<<<<<";
const PASS_L2 = "Z1234567<8IND9001011F3001012<<<<<<<<<<<<<<04";

test("nameOutcome distinguishes exact / normalized / mismatch", () => {
  assert.equal(nameOutcome("SHARMA", "SHARMA"), "exact");
  assert.equal(nameOutcome("Sharma", "SHARMA"), "normalized");
  assert.equal(nameOutcome("SHARNA", "SHARMA"), "mismatch");
});

test("clean DS-160 vs matching passport → no blockers", () => {
  const r = runAudit({ ds160: ds160(DS_OK), passport: passportFrom(PASS_L1, PASS_L2) }, { now: NOW });
  assert.equal(r.counts.blocker, 0, JSON.stringify(r.findings));
});

test("surname mismatch is a BLOCKER", () => {
  const bad = ds160(DS_OK.replace("SHARMA", "SHARNA"));
  const r = runAudit({ ds160: bad, passport: passportFrom(PASS_L1, PASS_L2) }, { now: NOW });
  assert.ok(r.findings.some(f => f.id === "name-surname" && f.severity === "blocker"));
});

test("passport-number O/0 confusion is flagged as a blocker with a specific message", () => {
  // Passport MRZ docNumber contains a 0; DS-160 typed it as the letter O.
  const passZero = "Z0234567<8IND9001011F3001012<<<<<<<<<<<<<<04";     // docNumber Z0234567
  const ds = ds160(DS_OK.replace("Z1234567", "ZO234567"));            // typed with letter O
  const r = runAudit({ ds160: ds, passport: passportFrom(PASS_L1, passZero) }, { now: NOW });
  const f = r.findings.find(x => x.id === "passport-number");
  assert.ok(f && f.severity === "blocker" && /confusable/.test(f.message), JSON.stringify(f));
});

test("two low-confidence reads are downgraded to info, not a blocker", () => {
  // low confidence: surname pulled from next line (conf 0.6) on DS side, and a made-up
  // low-confidence passport field
  const dsLow = { fields: { surname: { value: "SHARNA", confidence: 0.3, source: null },
                            given: { value: "PRIYA", confidence: 0.9 } } };
  const passLow = { fields: { surname: { value: "SHARMA", confidence: 0.3, source: null },
                              given: { value: "PRIYA", confidence: 0.9 } } };
  const r = runAudit({ ds160: dsLow, passport: passLow }, { now: NOW });
  const f = r.findings.find(x => x.id === "name-surname");
  assert.ok(f && f.severity === "info", JSON.stringify(f));
});

test("passport expiring within 6 months is a warning", () => {
  const soon = "Z1234567<8IND9001011F2611012<<<<<<<<<<<<<<04"; // expiry 2026-11-01
  const r = runAudit({ ds160: ds160(DS_OK), passport: passportFrom(PASS_L1, soon) }, { now: NOW });
  assert.ok(r.findings.some(f => f.id === "passport-expiry-6mo" && f.severity === "warning"));
});

test("I-797 receipt vs DS-160 petition number mismatch is a blocker", () => {
  const ds = ds160(DS_OK + "\nPetition Number: WAC2100000001");
  const notice = i797(`I-797 Notice of Action
Receipt Number: WAC2199999999
Classification: H-1B
Petitioner: ACME CORP
Beneficiary: PRIYA SHARMA`);
  const r = runAudit({ ds160: ds, i797: notice }, { now: NOW });
  assert.ok(r.findings.some(f => f.id === "i797-receipt" && f.severity === "blocker"));
});

test("I-20 arrival more than 30 days before program start is a warning", () => {
  const ds = ds160(DS_OK.replace("15-DEC-2026", "01-JUN-2026"));
  const rec = i20(`Certificate of Eligibility
SEVIS ID: N0012345678
School Name: STATE UNIVERSITY
Program Start: 15-AUG-2026`);
  // give DS-160 the matching SEVIS so the sevis rule passes and we isolate the date rule
  ds.fields.petitionNumber = { value: "N0012345678", confidence: 0.9 };
  const r = runAudit({ ds160: ds, i20: rec }, { now: NOW });
  assert.ok(r.findings.some(f => f.id === "i20-arrival-before-start" && f.severity === "warning"));
});

test("placeholder text in DS-160 fields is a warning", () => {
  const ds = ds160(DS_OK + "\nEmail Address: N/A");
  const r = runAudit({ ds160: ds }, { now: NOW });
  assert.ok(r.findings.some(f => f.id === "placeholder-values"));
});

test("skipped rules are reported when a document is missing", () => {
  const r = runAudit({ ds160: ds160(DS_OK) }, { now: NOW });
  assert.ok(r.skipped.some(s => s.id === "passport-number"));
  assert.ok(r.summary.includes("blocker"));
});

test("parseI94 pulls trip dates from a travel-history dump", () => {
  const { trips } = parseI94("Arrival 2023-05-01 Departure 2023-05-20\nEntry 2024-02-10 2024-03-01");
  assert.equal(trips.length, 2);
  assert.equal(trips[0].arrival, "2023-05-01");
});

test("never emits language implying the form is ready", () => {
  const r = runAudit({ ds160: ds160(DS_OK), passport: passportFrom(PASS_L1, PASS_L2) }, { now: NOW });
  assert.doesNotMatch(r.summary, /ready to submit|approved|looks good|correct/i);
});
