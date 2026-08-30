// VisaDash single-document audit engine — pure, framework-free, testable.
// Validates ONE filled DS-160 against supporting documents. Rules are data:
// { id, severity, requires:[docKeys], evaluate(ctx)->finding|finding[]|null }.
// Severities: "blocker" | "warning" | "info". NEVER emit anything that implies the
// form is correct/approved. A mismatch between two low-confidence reads is downgraded
// to a "couldn't read reliably" INFO, never a BLOCKER.
import { norm, toISO, parseMRZ, TYPE_BY_ID, grabLabel, mkField } from "./doctypes.mjs";

const PLACEHOLDERS = new Set(["N/A", "NA", "TBD", "-", "--", "NONE", "XX", "XXX"]);
const LOWCONF = 0.5;

/* ---- name comparison → exact | normalized | mismatch ---- */
export function nameOutcome(a, b) {
  const raw = s => String(s || "").trim();
  if (!raw(a) || !raw(b)) return "absent";
  if (raw(a) === raw(b)) return "exact";
  if (norm.name(a) === norm.name(b)) return "normalized";
  return "mismatch";
}

/* ---- confusable digits/letters O↔0, I↔1 ---- */
function confusableOnly(a, b) {
  const canon = s => norm.id(s).replace(/[O0]/g, "0").replace(/[I1]/g, "1");
  return norm.id(a) !== norm.id(b) && canon(a) === canon(b);
}

const F = (severity, category, message, extra = {}) => ({ severity, category, message, ...extra });

/* value + its two sources, for display */
function pair(ds160Field, docField) {
  return {
    ds160Value: ds160Field?.value ?? "",
    docValue: docField?.value ?? "",
    ds160Source: ds160Field?.source ?? null,
    docSource: docField?.source ?? null,
    lowConfidence: Math.min(ds160Field?.confidence ?? 0, docField?.confidence ?? 0) < LOWCONF,
  };
}

/* ─────────────────────────── rules ─────────────────────────── */
export const RULES = [
  /* DS-160 ↔ Passport */
  { id: "name-surname", severity: "blocker", category: "DS-160 ↔ Passport", requires: ["ds160", "passport"],
    evaluate: c => {
      const d = c.ds160.fields.surname, p = c.passport.fields.surname;
      const o = nameOutcome(d?.value, p?.value);
      if (o === "exact" || o === "absent") return null;
      const pr = pair(d, p);
      if (pr.lowConfidence) return F("info", "DS-160 ↔ Passport", "Couldn't read the surname reliably on both documents — verify by eye.", pr);
      if (o === "normalized") return F("warning", "DS-160 ↔ Passport", "Surname matches only after normalizing case/accents/spacing — confirm it is spelled exactly as in the passport.", pr);
      return F("blocker", "DS-160 ↔ Passport", "Surname does not match the passport.", pr);
    } },
  { id: "name-given", severity: "blocker", category: "DS-160 ↔ Passport", requires: ["ds160", "passport"],
    evaluate: c => {
      const d = c.ds160.fields.given, p = c.passport.fields.given;
      const o = nameOutcome(d?.value, p?.value);
      if (o === "exact" || o === "absent") return null;
      const pr = pair(d, p);
      if (pr.lowConfidence) return F("info", "DS-160 ↔ Passport", "Couldn't read the given names reliably on both documents — verify by eye.", pr);
      if (o === "normalized") return F("warning", "DS-160 ↔ Passport", "Given names match only after normalization — confirm exact spelling and order vs the passport.", pr);
      return F("blocker", "DS-160 ↔ Passport", "Given names do not match the passport.", pr);
    } },
  { id: "name-order", severity: "warning", category: "DS-160 ↔ Passport", requires: ["ds160", "passport"],
    evaluate: c => {
      const ds = norm.name(c.ds160.fields.surname?.value), dg = norm.name(c.ds160.fields.given?.value);
      const ps = norm.name(c.passport.fields.surname?.value), pg = norm.name(c.passport.fields.given?.value);
      if (ds && dg && ds === pg && dg === ps && ds !== dg)
        return F("warning", "DS-160 ↔ Passport", "Given name and surname appear to be reversed relative to the passport.", pair(c.ds160.fields.surname, c.passport.fields.surname));
      return null;
    } },
  { id: "passport-number", severity: "blocker", category: "DS-160 ↔ Passport", requires: ["ds160", "passport"],
    evaluate: c => {
      const d = c.ds160.fields.passportNumber, p = c.passport.fields.docNumber;
      if (!d?.value || !p?.value) return null;
      if (norm.id(d.value) === norm.id(p.value)) return null;
      const pr = pair(d, p);
      if (pr.lowConfidence) return F("info", "DS-160 ↔ Passport", "Couldn't read the passport number reliably — verify character-for-character.", pr);
      if (confusableOnly(d.value, p.value))
        return F("blocker", "DS-160 ↔ Passport", "Passport number differs only by confusable characters (O/0 or I/1) — check each character.", pr);
      return F("blocker", "DS-160 ↔ Passport", "Passport number does not match the passport.", pr);
    } },
  { id: "dob", severity: "blocker", category: "DS-160 ↔ Passport", requires: ["ds160", "passport"],
    evaluate: c => {
      const d = c.ds160.fields.dob, p = c.passport.fields.dob;
      if (!d?.value || !p?.value) return null;
      const di = toISO(d.value), pi = toISO(p.value);
      if (di && pi && di === pi) return null;
      const pr = pair(d, p);
      if (pr.lowConfidence) return F("info", "DS-160 ↔ Passport", "Couldn't read the date of birth reliably on both documents.", pr);
      return F("blocker", "DS-160 ↔ Passport", "Date of birth does not match the passport.", pr);
    } },
  { id: "sex", severity: "warning", category: "DS-160 ↔ Passport", requires: ["ds160", "passport"],
    evaluate: c => {
      const d = c.ds160.fields.sex, p = c.passport.fields.sex;
      if (!d?.value || !p?.value) return null;
      if (norm.upper(d.value)[0] === norm.upper(p.value)[0]) return null;
      return F("warning", "DS-160 ↔ Passport", "Sex differs between the DS-160 and the passport.", pair(d, p));
    } },
  { id: "passport-expiry-6mo", severity: "warning", category: "DS-160 ↔ Passport", requires: ["passport"],
    evaluate: c => {
      const iso = toISO(c.passport.fields.expiry?.value);
      if (!iso) return null;
      const days = Math.round((Date.parse(iso) - c.now) / 86400000);
      if (days < 0) return F("warning", "Passport", "The passport appears to be expired.", { docValue: iso });
      if (days < 183) return F("warning", "Passport", `Passport expires in under 6 months (${days} days) — many consulates require 6 months' validity.`, { docValue: iso });
      return null;
    } },
  { id: "mrz-viz", severity: "warning", category: "Passport", requires: ["passport"],
    evaluate: c => {
      const checks = c.passport.mrz?.checks;
      if (!checks) return null;
      const bad = Object.entries(checks).filter(([, ok]) => ok === false).map(([k]) => k);
      if (bad.length) return F("warning", "Passport", `MRZ check digit failed for: ${bad.join(", ")} — the machine-readable zone may have been misread or altered.`, {});
      return null;
    } },

  /* DS-160 ↔ I-797 */
  { id: "i797-receipt", severity: "blocker", category: "DS-160 ↔ I-797", requires: ["ds160", "i797"],
    evaluate: c => {
      const d = c.ds160.fields.petitionNumber, r = c.i797.fields.receiptNumber;
      if (!d?.value || !r?.value) return null;
      if (norm.id(d.value) === norm.id(r.value)) return null;
      return F("blocker", "DS-160 ↔ I-797", "The petition/receipt number on the DS-160 does not match the I-797 receipt number.", pair(d, r));
    } },
  { id: "i797-petitioner", severity: "warning", category: "DS-160 ↔ I-797", requires: ["ds160", "i797"],
    evaluate: c => {
      const d = c.ds160.fields.employer || c.ds160.fields.petitioner, p = c.i797.fields.petitioner;
      if (!d?.value || !p?.value) return null;
      if (norm.name(d.value) === norm.name(p.value)) return null;
      return F("warning", "DS-160 ↔ I-797", "Petitioner/employer name differs between the DS-160 and the I-797.", pair(d, p));
    } },
  { id: "i797-travel-window", severity: "warning", category: "DS-160 ↔ I-797", requires: ["ds160", "i797"],
    evaluate: c => {
      const arr = toISO(c.ds160.fields.arrivalDate?.value);
      const from = toISO(c.i797.fields.validFrom?.value), to = toISO(c.i797.fields.validTo?.value);
      if (!arr) return null;
      if (from && arr < from) return F("warning", "DS-160 ↔ I-797", "Intended arrival date is before the I-797 validity start.", { ds160Value: arr, docValue: from });
      if (to && arr > to) return F("warning", "DS-160 ↔ I-797", "Intended arrival date is after the I-797 validity end.", { ds160Value: arr, docValue: to });
      return null;
    } },

  /* DS-160 ↔ I-20 / DS-2019 */
  { id: "i20-sevis", severity: "blocker", category: "DS-160 ↔ I-20/DS-2019", requires: ["ds160", "i20"],
    evaluate: c => {
      const d = c.ds160.fields.sevisId || c.ds160.fields.petitionNumber, s = c.i20.fields.sevisId;
      if (!d?.value || !s?.value) return null;
      if (norm.id(d.value) === norm.id(s.value)) return null;
      return F("blocker", "DS-160 ↔ I-20/DS-2019", "SEVIS ID on the DS-160 does not match the I-20/DS-2019.", pair(d, s));
    } },
  { id: "i20-arrival-before-start", severity: "warning", category: "DS-160 ↔ I-20/DS-2019", requires: ["ds160", "i20"],
    evaluate: c => {
      const arr = toISO(c.ds160.fields.arrivalDate?.value), start = toISO(c.i20.fields.programStart?.value);
      if (!arr || !start) return null;
      const days = Math.round((Date.parse(start) - Date.parse(arr)) / 86400000);
      if (days > 30) return F("warning", "DS-160 ↔ I-20/DS-2019", `Intended arrival is more than 30 days before the program start (${days} days) — students are generally admitted at most 30 days early.`, { ds160Value: arr, docValue: start });
      return null;
    } },

  /* DS-160 ↔ I-94 travel history */
  { id: "i94-missing-trips", severity: "warning", category: "DS-160 ↔ I-94", requires: ["ds160", "i94"],
    evaluate: c => {
      const declared = new Set((c.ds160.priorTrips || []).map(t => toISO(t)).filter(Boolean));
      const missing = (c.i94.trips || []).filter(t => t.arrival && !declared.has(toISO(t.arrival)));
      if (!missing.length) return null;
      return F("warning", "DS-160 ↔ I-94", `${missing.length} U.S. entr${missing.length === 1 ? "y is" : "ies are"} in the I-94 record but not reflected in the DS-160 prior-travel answers.`,
        { docValue: missing.map(t => toISO(t.arrival)).join(", ") });
    } },
  { id: "i94-overstay", severity: "warning", category: "DS-160 ↔ I-94", requires: ["i94"],
    evaluate: c => {
      const over = (c.i94.trips || []).filter(t => t.departure && t.admittedUntil && toISO(t.departure) > toISO(t.admittedUntil));
      if (!over.length) return null;
      return F("warning", "I-94", `${over.length} prior stay(s) appear to depart after the admitted-until date — a possible overstay to review carefully.`, {});
    } },

  /* DS-160 internal consistency */
  { id: "placeholder-values", severity: "warning", category: "DS-160 internal", requires: ["ds160"],
    evaluate: c => {
      const hits = [];
      for (const [k, f] of Object.entries(c.ds160.fields)) {
        const v = (f?.value || "").trim().toUpperCase();
        if (v && PLACEHOLDERS.has(v)) hits.push(k);
      }
      if (!hits.length) return null;
      return F("warning", "DS-160 internal", `Placeholder text left in required-looking fields: ${hits.join(", ")}.`, {});
    } },
  { id: "arrival-in-future", severity: "warning", category: "DS-160 internal", requires: ["ds160"],
    evaluate: c => {
      const arr = toISO(c.ds160.fields.arrivalDate?.value);
      if (!arr) return null;
      if (Date.parse(arr) < c.now) return F("warning", "DS-160 internal", "Intended date of arrival is in the past.", { ds160Value: arr });
      return null;
    } },
  { id: "date-format", severity: "info", category: "DS-160 internal", requires: ["ds160"],
    evaluate: c => {
      const bad = [];
      for (const key of ["dob", "arrivalDate", "passportIssuance", "passportExpiration"]) {
        const v = c.ds160.fields[key]?.value;
        if (v && !toISO(v)) bad.push(key);
      }
      if (!bad.length) return null;
      return F("info", "DS-160 internal", `Could not parse these dates as valid calendar dates (expected DD-MMM-YYYY): ${bad.join(", ")}.`, {});
    } },
  { id: "age-vs-dob", severity: "info", category: "DS-160 internal", requires: ["ds160"],
    evaluate: c => {
      const dob = toISO(c.ds160.fields.dob?.value), stated = c.ds160.fields.age?.value;
      if (!dob || !stated) return null;
      const age = Math.floor((c.now - Date.parse(dob)) / (365.25 * 86400000));
      if (String(age) !== String(stated).replace(/\D/g, "")) return F("info", "DS-160 internal", `Stated age (${stated}) does not match age derived from date of birth (${age}).`, {});
      return null;
    } },
];

/* ─────────────────────────── runner ─────────────────────────── */
export function runAudit(docs, opts = {}) {
  const ctx = { ...docs, now: opts.now ?? Date.now() };
  const present = k => docs[k] && (docs[k].fields || docs[k].trips);
  const findings = [], skipped = [];
  for (const rule of RULES) {
    const missing = rule.requires.filter(k => !present(k));
    if (missing.length) { skipped.push({ id: rule.id, category: rule.category, missing }); continue; }
    let out;
    try { out = rule.evaluate(ctx); } catch (e) { out = null; }
    if (!out) continue;
    for (const f of (Array.isArray(out) ? out : [out])) findings.push({ id: rule.id, ...f });
  }
  const count = sev => findings.filter(f => f.severity === sev).length;
  const b = count("blocker"), w = count("warning"), i = count("info");
  const summary = `${b} blocker${b === 1 ? "" : "s"}, ${w} warning${w === 1 ? "" : "s"}, ${i} info — review each against your documents.`;
  return { findings, skipped, counts: { blocker: b, warning: w, info: i }, summary };
}

/* ---- lightweight parsers for docs the DocumentType engine doesn't extract ---- */
// Prior US visa foil
export function parseVisaFoil(lines) {
  return { fields: {
    name: grabLabel(lines, ["Surname", "Name"]),
    visaClass: grabLabel(lines, ["Visa Class", "Class"]),
    foilNumber: grabLabel(lines, ["Control Number", "Visa Number", "Red Number"]),
    issueDate: grabLabel(lines, ["Issue Date", "Issued"]),
    expiration: grabLabel(lines, ["Expiration Date", "Expires"]),
    post: grabLabel(lines, ["Issuing Post", "Post"]),
    annotation: grabLabel(lines, ["Annotation"]),
  } };
}
// I-94 travel history — expects rows like "ARRIVAL 2023-05-01 DEPARTURE 2023-05-20 ..."
export function parseI94(text) {
  const trips = [];
  const re = /(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/g;
  for (const line of String(text).split(/\n/)) {
    if (!/arriv|depart|entry|i-?94/i.test(line)) continue;
    const dates = line.match(re);
    if (dates && dates.length) trips.push({ arrival: dates[0], departure: dates[1] || null, admittedUntil: dates[2] || null });
  }
  return { trips };
}
