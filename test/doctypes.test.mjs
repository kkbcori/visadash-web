// VisaDash engine tests — run with `node --test` (Node 20+ built-in runner).
// Fixtures are SYNTHETIC: made-up names, numbers and dates. Never commit real documents.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectType, compareVersions, compareCross, parseMRZ, toISO, norm, grabLabel, mkField, compareValues,
} from "../src/engine/doctypes.mjs";

const linesOf = s => s.trim().split("\n").map(l => l.trim());
const extract = (typeId, text) => {
  const { TYPE_BY_ID } = _mod;
  return TYPE_BY_ID[typeId].extract({ text, lines: linesOf(text) });
};
import * as _mod from "../src/engine/doctypes.mjs";

/* ── normalizers ── */
test("norm.name folds case, strips diacritics, collapses space", () => {
  assert.equal(norm.name("  José   Ramón "), "JOSE RAMON");
  assert.equal(norm.name("O'Brien"), "O'BRIEN");
});
test("toISO parses the date formats we see", () => {
  assert.equal(toISO("15-JAN-1990"), "1990-01-15");
  assert.equal(toISO("Jan 15, 2027"), "2027-01-15");
  assert.equal(toISO("01/15/1990"), "1990-01-15");
  assert.equal(toISO("1990-01-15"), "1990-01-15");
  assert.equal(toISO("garbage"), null);
});
test("compareValues treats two low-confidence reads as unreadable, not mismatch", () => {
  const a = mkField("SMTH", 0.4), b = mkField("SMITH", 0.4);
  assert.equal(compareValues(a, b, norm.name), "unreadable");
  const c = mkField("SMITH", 0.9), d = mkField("SMYTHE", 0.9);
  assert.equal(compareValues(c, d, norm.name), "mismatch");
});

/* ── detection across all six ── */
test("detectType discriminates the six document types", () => {
  assert.equal(detectType("Online Nonimmigrant Visa Application DS-160").id, "ds160");
  assert.equal(detectType("P<UTOSMITH<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\nX1234567<8UTO9001011M3001012<<<<<<<<<<<<<<04").id, "passport");
  assert.equal(detectType("I-797C Notice of Action USCIS Receipt Number WAC000 Classification").id, "i797");
  assert.equal(detectType("Certificate of Eligibility SEVIS ID N001 Program Sponsor").id, "i20");
  assert.equal(detectType("I-766 Employment Authorization Document USCIS# Category C09").id, "ead");
  assert.equal(detectType("Labor Condition Application ETA-9035 Prevailing Wage SOC Wage Level").id, "lca");
});
test("detectType reports unrecognized text as general", () => {
  assert.equal(detectType("a grocery receipt, milk and eggs").id, "general");
});

/* ── DS-160 ↔ DS-160: name mismatch is critical, new passport # is expected-change ── */
test("DS-160 version diff flags a surname mismatch as critical", () => {
  const a = extract("ds160", `Nonimmigrant Visa Application DS-160
    Surname: SHARMA
    Given Names: PRIYA
    Date of Birth: 01-JAN-1990
    Passport Number: Z1234567`);
  const b = extract("ds160", `Nonimmigrant Visa Application DS-160
    Surname: SHARNA
    Given Names: PRIYA
    Date of Birth: 01-JAN-1990
    Passport Number: Z7654321`);
  const r = compareVersions("ds160", a, b);
  const surname = r.rows.find(x => x.key === "surname");
  assert.equal(surname.outcome, "mismatch");
  assert.equal(surname.severity, "critical");
  const pass = r.rows.find(x => x.key === "passportNumber");
  // 'same' semantics → a changed passport number IS a critical mismatch on the DS-160
  assert.equal(pass.outcome, "mismatch");
});

/* ── passport MRZ: check digits drive confidence ── */
test("passport MRZ parses and validates check digits", () => {
  const text = "P<UTOSHARMA<<PRIYA<<<<<<<<<<<<<<<<<<<<<<<<<<<\nZ1234567<8UTO9001011F3001012<<<<<<<<<<<<<<04";
  const p = parseMRZ(linesOf(text), text);
  assert.ok(p, "MRZ parsed");
  assert.equal(p.fields.surname.value, "SHARMA");
  assert.equal(p.fields.given.value, "PRIYA");
  assert.equal(typeof p.checks.docNumber, "boolean");
  assert.ok(p.fields.docNumber.confidence >= 0.5);
});

/* ── I-797: classification change + validity gap ── */
test("I-797 flags classification change and a validity gap", () => {
  const a = extract("i797", `I-797 Notice of Action
    Receipt Number: WAC2100000001
    Classification: H-1B
    Petitioner: ACME CORP
    Beneficiary: PRIYA SHARMA
    Valid From: Oct 1, 2023
    Valid To: Sep 30, 2025`);
  const b = extract("i797", `I-797 Notice of Action
    Receipt Number: WAC2100000001
    Classification: L-1A
    Petitioner: ACME CORP
    Beneficiary: PRIYA SHARMA
    Valid From: Nov 15, 2025
    Valid To: Nov 14, 2027`);
  const r = compareVersions("i797", a, b);
  const ids = r.findings.filter(f => !f.skipped).map(f => f.id);
  assert.ok(ids.includes("i797-classification-change"));
  assert.ok(ids.includes("i797-validity-gap"));
});

/* ── I-20: SEVIS change surfaces loudly ── */
test("I-20 flags a SEVIS ID change loudly", () => {
  const a = extract("i20", `Certificate of Eligibility
    SEVIS ID: N0012345678
    School Name: STATE UNIVERSITY`);
  const b = extract("i20", `Certificate of Eligibility
    SEVIS ID: N0099999999
    School Name: STATE UNIVERSITY`);
  const r = compareVersions("i20", a, b);
  const f = r.findings.find(x => x.id === "i20-sevis-change");
  assert.ok(f && f.loud === true);
});

/* ── EAD: category code change ── */
test("EAD flags a category code change", () => {
  const a = extract("ead", `I-766 Employment Authorization
    USCIS#: 123456789
    Category: C09
    Card Number: SRC1000000001
    Valid Until: Jan 1, 2026`);
  const b = extract("ead", `I-766 Employment Authorization
    USCIS#: 123456789
    Category: A05
    Card Number: SRC1000000002
    Valid Until: Jan 1, 2027`);
  const r = compareVersions("ead", a, b);
  assert.ok(r.findings.some(f => f.id === "ead-category-change" && !f.skipped));
});

/* ── LCA ↔ offer: cross-type, wage-below-LCA is a blocker ── */
test("LCA vs offer flags an offered wage below the LCA rate", () => {
  const lca = { type: "lca", ...extract("lca", `Labor Condition Application ETA-9035
    SOC Code: 15-1252
    Job Title: SOFTWARE DEVELOPER
    Worksite Address: AUSTIN, TX
    Wage Rate: 112847
    Wage Level: III
    Begin Date: 10/01/2025
    End Date: 09/30/2028`) };
  const offer = { type: "offer", ...extract("offer", `Offer of Employment
    Position: SOFTWARE DEVELOPER
    Location: AUSTIN, TX
    Base Salary: 98000
    Start Date: 11/01/2025`) };
  const r = compareCross(lca, offer);
  assert.equal(r.mode, "cross");
  assert.ok(r.findings.some(f => f.severity === "blocker" && /below the LCA/.test(f.title)));
});
test("cross-compare of two unrelated types refuses rather than diffing garbage", () => {
  const r = compareCross({ type: "ds160", fields: {} }, { type: "ead", fields: {} });
  assert.ok(r.undefinedPair);
});

/* ── robust label matching: punctuation / case / spacing tolerant ── */
test("grabLabel tolerates punctuation, case and spacing differences", () => {
  assert.equal(grabLabel(["GIVEN  NAMES : PRIYA ANIL"], ["Given Names"]).value, "PRIYA ANIL");
  assert.equal(grabLabel(["given-names> Priya"], ["Given Names"]).value, "Priya");
  assert.equal(grabLabel(["Marital Status.... SINGLE"], ["Marital Status"]).value, "SINGLE");
});

/* ── expanded, categorized DS-160 schema ── */
test("DS-160 schema is categorized and expanded", () => {
  const ds = _mod.TYPE_BY_ID.ds160;
  assert.ok(ds.fieldSchema.length >= 35, "schema should be expanded, got " + ds.fieldSchema.length);
  assert.ok(Array.isArray(ds.categories) && ds.categories.includes("Family") && ds.categories.includes("Travel"));
  assert.ok(ds.fieldSchema.every(f => f.category), "every field has a category");
});
test("DS-160 rows carry their category and pick up new fields", () => {
  const doc = t => ({ type: "ds160", ..._mod.TYPE_BY_ID.ds160.extract({ text: t, lines: t.split("\n").map(s => s.trim()) }) });
  const A = `DS-160\nSurname: SHARMA\nGiven Names: PRIYA\nFather's Surname: SHARMA\nPurpose of Trip to the U.S.: BUSINESS`;
  const B = A.replace("SHARMA\nGiven", "SHARNA\nGiven");
  const r = compareVersions("ds160", doc(A), doc(B));
  const father = r.rows.find(x => x.key === "fatherSurname");
  assert.ok(father && father.category === "Family", "father field present under Family");
  assert.ok(r.rows.every(x => x.category), "every compared row has a category");
});

/* ── real DS-160 "Print Application" format: Name Provided: SURNAME, GIVEN ── */
test("DS-160 extractor handles the real printout (Name Provided, section labels)", () => {
  const doc = t => ({ type: "ds160", ..._mod.TYPE_BY_ID.ds160.extract({ text: t, lines: t.split("\n").map(s => s.trim()) }) });
  const A = `Online Nonimmigrant Visa Application (DS-160)
Name Provided: SNOW, JOHNQQ
Country/Region of Origin (Nationality): AFGHANISTAN
Passport/Travel Document Number: M1111111
Primary Occupation: EDUCATION
Present Employer or School Name: STATE UNIVERSITY
Have you ever been in the U.S.? NO`;
  const B = A.replace("SNOW, JOHNQQ", "STARK, JOHNQQ").replace("M1111111", "M2222222").replace("been in the U.S.? NO", "been in the U.S.? YES");
  const da = doc(A), db = doc(B);
  assert.equal(da.fields.surname.value, "SNOW");
  assert.equal(da.fields.given.value, "JOHNQQ");
  assert.equal(da.fields.nationality.value, "AFGHANISTAN");
  assert.equal(da.fields.occupation.value, "EDUCATION");
  const r = compareVersions("ds160", da, db);
  assert.equal(r.rows.find(x => x.key === "surname").outcome, "mismatch");
  assert.equal(r.rows.find(x => x.key === "passportNumber").outcome, "mismatch");
  assert.equal(r.rows.find(x => x.key === "beenInUS").outcome, "mismatch");
});

/* ── extraction carries a source snippet ── */
test("grabLabel returns a source line + snippet and a confidence", () => {
  const f = grabLabel(["Receipt Number: WAC2100000001"], ["Receipt Number"]);
  assert.equal(f.value, "WAC2100000001");
  assert.ok(f.confidence >= 0.8);
  assert.ok(f.source && typeof f.source.line === "number" && f.source.snippet.includes("WAC"));
});
