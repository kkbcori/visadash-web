// VisaDash document-type engine — pure, framework-free, runs in the browser
// (as an ES module) and under `node --test`. No DOM, no OCR, no network here:
// the browser layer feeds in already-extracted { text, lines } and renders the
// result. Every extracted field carries { value, confidence, source } so the UI
// can show the source snippet and so low-confidence reads never masquerade as
// hard mismatches.

/* ───────────────────────── field + normalizers ───────────────────────── */

export const mkField = (value, confidence = 0, source = null) => ({ value, confidence, source });

const stripDiacritics = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const norm = {
  plain:  s => (s || "").trim(),
  upper:  s => (s || "").toUpperCase().trim(),
  // name: case-fold, strip diacritics, collapse whitespace, drop punctuation
  name:   s => stripDiacritics(String(s || "")).toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim(),
  // ids: keep only [A-Z0-9]
  id:     s => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
  // date → ISO yyyy-mm-dd when parseable, else the trimmed string
  date:   s => toISO(s) || (s || "").trim(),
  money:  s => { const n = parseFloat(String(s || "").replace(/[^0-9.]/g, "")); return isNaN(n) ? null : n; },
};

const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
export function toISO(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD-MMM-YYYY (DS-160 / I-94 style)
  if ((m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{4})$/))) {
    const mo = MONTHS[m[2].toLowerCase()]; if (mo) return `${m[3]}-${pad2(mo)}-${pad2(+m[1])}`;
  }
  // MMM DD, YYYY (I-797 style)
  if ((m = s.match(/^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/))) {
    const mo = MONTHS[m[1].toLowerCase()]; if (mo) return `${m[3]}-${pad2(mo)}-${pad2(+m[2])}`;
  }
  // MM/DD/YYYY
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return `${m[3]}-${pad2(+m[1])}-${pad2(+m[2])}`;
  return null;
}
const pad2 = n => String(n).padStart(2, "0");

/* comparison outcome for two normalized values under a comparator */
export function compareValues(a, b, normalizer) {
  const na = normalizer(a.value), nb = normalizer(b.value);
  const bothLow = a.confidence < 0.5 && b.confidence < 0.5;
  if (!a.value && !b.value) return "absent";
  if (!a.value || !b.value) return "one-sided";
  if (na === nb && na !== "") return "match";
  if (bothLow) return "unreadable";            // two poor OCR reads → not a hard mismatch
  return "mismatch";
}

/* ───────────────────────── label extraction ───────────────────────── */

// Pull a labelled value out of OCR/text lines — robustly. Matching is
// punctuation/whitespace/case tolerant ("Given Names", "given-names:", "GIVEN  NAMES")
// and the value can be on the same line or the next. Confidence reflects HOW it was
// found: same-line = high, next-line = medium.
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normKey = s => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Strip leading separators AND "(n)" index tokens (the printout writes "Label: (1): VALUE").
const stripSep = s => s.replace(/^(?:\s|[:.\-–—>|]|\(\d+\))+/, "").trim();

export const normLines = lines => lines.map(l => String(l).replace(/\s+/g, " ").trim());
const labelRe = label => new RegExp("^\\W*" + label.trim().split(/\s+/).map(escRe).join("\\W+") + "(?![A-Za-z0-9])", "i");

// Core label finder. Scans lines >= `start` (so a caller can walk the document with a
// moving cursor — the DS-160 repeats generic labels like "City"/"State" per section,
// and matching each in order binds the first to Home, the next to Employer, etc.).
// Match the label ONLY at the start of a line and on a word boundary, so "Given Names"
// won't match inside "Mother's Given Names" and "Country/Region" won't match inside
// "Country/Region of Origin (Nationality)". Returns { value, confidence, source, index }.
function findLabel(L, Lk, labels, start = 0) {
  const arr = Array.isArray(labels) ? labels : [labels];
  for (const label of arr) {
    const lk = normKey(label);
    if (!lk) continue;
    const re = labelRe(label);
    for (let i = start; i < L.length; i++) {
      if (Lk[i].indexOf(lk) !== 0) continue;       // normalized line must START with the label
      const m = L[i].match(re);
      if (!m) continue;
      let val = stripSep(L[i].slice(m[0].length)), conf = 0.9, srcLine = i;
      if (!val && i + 1 < L.length) { val = stripSep(L[i + 1]); conf = 0.6; srcLine = i + 1; }
      if (val && !/^[A-Za-z][A-Za-z '/&().-]{2,}:$/.test(val)) {
        return { value: val, confidence: conf, source: { line: srcLine, label, snippet: L[srcLine] }, index: i };
      }
    }
  }
  return { value: "", confidence: 0, source: null, index: -1 };
}

// Yes/No questions: the DS-160 print wraps a long question over several lines and puts
// the answer (YES / NO / DOES NOT APPLY) at the end of the first line OR on a line below.
const YN_TRAIL = /\b(YES|NO|DOES NOT APPLY)\s*$/i;
const YN_LEAD  = /^(YES|NO|DOES NOT APPLY)\b/i;
function findYesNo(L, Lk, labels, start = 0) {
  const arr = Array.isArray(labels) ? labels : [labels];
  for (const label of arr) {
    const lk = normKey(label);
    if (!lk) continue;
    const re = labelRe(label);
    for (let i = start; i < L.length; i++) {
      if (Lk[i].indexOf(lk) !== 0) continue;
      const mm = L[i].match(re);
      if (!mm) continue;
      const t = L[i].slice(mm[0].length).match(YN_TRAIL);
      if (t) return { value: t[1].toUpperCase().replace(/\s+/g, " "), confidence: 0.9, source: { line: i, label, snippet: L[i] }, index: i };
      for (let j = i + 1; j < Math.min(i + 6, L.length); j++) {
        const a = L[j].match(YN_LEAD);
        if (a) return { value: a[1].toUpperCase().replace(/\s+/g, " "), confidence: 0.85, source: { line: j, label, snippet: L[j] }, index: i };
      }
    }
  }
  return { value: "", confidence: 0, source: null, index: -1 };
}

// thin wrappers (global search from the top) — used by other doc types + tests
export function grabLabel(lines, labels) {
  const L = normLines(lines); const r = findLabel(L, L.map(normKey), labels, 0);
  return mkField(r.value, r.confidence, r.source);
}
export function grabYesNo(lines, labels) {
  const L = normLines(lines); const r = findYesNo(L, L.map(normKey), labels, 0);
  return mkField(r.value, r.confidence, r.source);
}

/* ───────────────────────── MRZ (ICAO 9303 TD3) ───────────────────────── */

const pad44 = l => ((l || "").replace(/\s+/g, "").toUpperCase() + "<".repeat(44)).slice(0, 44);
export function findMRZ(text) {
  const cand = String(text).split(/\n/)
    .map(l => l.replace(/\s+/g, "").toUpperCase())
    .filter(l => /^[A-Z0-9<]{28,}$/.test(l) && l.includes("<"));
  for (let i = 0; i < cand.length - 1; i++)
    if (/^P[A-Z0-9<]/.test(cand[i])) return [pad44(cand[i]), pad44(cand[i + 1])];
  if (cand.length >= 2) return [pad44(cand[cand.length - 2]), pad44(cand[cand.length - 1])];
  return null;
}
function mrzCheckDigit(str) {
  const w = [7, 3, 1]; let s = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i]; let v = 0;
    if (c >= "0" && c <= "9") v = +c;
    else if (c >= "A" && c <= "Z") v = c.charCodeAt(0) - 55;
    s += v * w[i % 3];
  }
  return s % 10;
}
const ckOk = (field, actual) => /[0-9]/.test(actual) && +actual === mrzCheckDigit(field);
function mrzDate(raw, kind) {
  if (!/^\d{6}$/.test(raw)) return raw || "";
  const yy = +raw.slice(0, 2), mm = raw.slice(2, 4), dd = raw.slice(4, 6);
  const year = kind === "exp" ? 2000 + yy
    : (yy <= (new Date().getFullYear() % 100) ? 2000 + yy : 1900 + yy);
  return `${year}-${mm}-${dd}`;
}
// returns { fields, checks } or null
export function parseMRZ(lines, text) {
  let l1, l2;
  const clean = (lines || []).filter(Boolean);
  if (clean.length >= 2 && /^[A-Z0-9<]/i.test(clean[0].replace(/\s+/g, "")) && clean[0].replace(/\s+/g,"").length >= 20) {
    l1 = pad44(clean[0]); l2 = pad44(clean[1]);
    if (!/^P/.test(l1) && text) { const m = findMRZ(text); if (m) [l1, l2] = m; }
  } else {
    const m = findMRZ(text || clean.join("\n"));
    if (!m) return null;
    [l1, l2] = m;
  }
  const nameParts = l1.slice(5, 44).split("<<");
  const surname = (nameParts[0] || "").replace(/</g, " ").replace(/\s+/g, " ").trim();
  const given   = (nameParts.slice(1).join(" ") || "").replace(/</g, " ").replace(/\s+/g, " ").trim();
  const checks = {
    docNumber: ckOk(l2.slice(0, 9), l2[9]),
    dob:       ckOk(l2.slice(13, 19), l2[19]),
    expiry:    ckOk(l2.slice(21, 27), l2[27]),
    composite: ckOk(l2.slice(0,10)+l2.slice(13,20)+l2.slice(21,28)+l2.slice(28,43), l2[43]),
  };
  // confidence from the check digit for that field (validated → 0.98, else 0.5)
  const c = ok => ok ? 0.98 : 0.5;
  const src = { line: -1, label: "MRZ", snippet: l2 };
  const fields = {
    docType:        mkField(l1.slice(0, 2).replace(/</g, "").trim() || "P", 0.9, { ...src, snippet: l1 }),
    issuer:         mkField(l1.slice(2, 5).replace(/</g, "").trim(), 0.9, { ...src, snippet: l1 }),
    surname:        mkField(surname, 0.9, { ...src, snippet: l1 }),
    given:          mkField(given, 0.9, { ...src, snippet: l1 }),
    docNumber:      mkField(l2.slice(0, 9).replace(/</g, "").trim(), c(checks.docNumber), src),
    nationality:    mkField(l2.slice(10, 13).replace(/</g, "").trim(), 0.9, src),
    dob:            mkField(mrzDate(l2.slice(13, 19), "dob"), c(checks.dob), src),
    sex:            mkField(l2.slice(20, 21).replace(/</g, "X") || "X", 0.9, src),
    expiry:         mkField(mrzDate(l2.slice(21, 27), "exp"), c(checks.expiry), src),
    personalNumber: mkField(l2.slice(28, 42).replace(/</g, "").trim(), 0.6, src),
  };
  return { fields, checks, l1, l2 };
}

/* ───────────────────────── document types ───────────────────────── */
// A DocumentType is:
//   { id, label, detect(text)->0..1, extract({text,lines})->{fields}, fieldSchema:[
//        { key, label, normalizer, semantics:'same'|'differ'|'either', severity } ],
//     rules:[ { id, severity, requires:[keys], evaluate(a,b|doc)->finding|null } ] }

const CLASS_WORDS = /\b(H-?1B|H1-?B|L-?1[AB]?|O-?1|TN|E-?[23]|EB-?[123]|F-?1|J-?1|B-?1\/B-?2)\b/i;

function scoreFrom(text, patterns) {
  const up = text.toUpperCase();
  let hits = 0;
  for (const p of patterns) if (p.test(up)) hits++;
  return patterns.length ? hits / patterns.length : 0;
}

const passport = {
  id: "passport", label: "Passport",
  detect: text => findMRZ(text) ? 0.95 : 0,
  extract: ({ text, lines }) => {
    const p = parseMRZ(lines, text);
    return p ? { fields: p.fields, mrz: { checks: p.checks, l1: p.l1, l2: p.l2 } } : { fields: {} };
  },
  fieldSchema: [
    { key: "docType", label: "Document type", normalizer: norm.upper, semantics: "same", severity: "low" },
    { key: "issuer", label: "Issuing country", normalizer: norm.upper, semantics: "same", severity: "high" },
    { key: "surname", label: "Surname", normalizer: norm.name, semantics: "same", severity: "critical" },
    { key: "given", label: "Given names", normalizer: norm.name, semantics: "same", severity: "critical" },
    { key: "dob", label: "Date of birth", normalizer: norm.date, semantics: "same", severity: "critical" },
    { key: "sex", label: "Sex", normalizer: norm.upper, semantics: "same", severity: "critical" },
    { key: "nationality", label: "Nationality", normalizer: norm.upper, semantics: "same", severity: "critical" },
    { key: "docNumber", label: "Passport number", normalizer: norm.id, semantics: "differ", severity: "high" },
    { key: "expiry", label: "Expiry date", normalizer: norm.date, semantics: "differ", severity: "high" },
    { key: "personalNumber", label: "Personal number", normalizer: norm.id, semantics: "either", severity: "low" },
  ],
  rules: [],
};

// DS-160 fields — ONE source drives both extract() and fieldSchema, grouped by the
// DS-160's own sections so the report can present collapsible categories.
// n = normalizer, s = semantics, sv = severity, labels = extractor label variants.
// Category order + labels mirror the real DS-160 nav / "Print Application" printout.
// Order matches the DS-160 "Print Application" so the report reads top-to-bottom like the
// applicant's own printout (Personal → Address & Phone → Passport → Travel → …).
const DS160_CATEGORIES = [
  "Personal Information 1", "Personal Information 2", "Address and Phone", "Passport",
  "Travel", "Travel Companions", "Previous U.S. Travel", "U.S. Point of Contact",
  "Family", "Work / Education / Training",
];
const DS160_FIELDS = [
  // ── Personal Information 1 ──  (the printout prints the name as "Name Provided: SURNAME, GIVEN"; see extract())
  { key: "surname", label: "Surname", cat: "Personal Information 1", n: norm.name, s: "same", sv: "critical", labels: ["Surnames", "Surname", "Last Name", "Family Name"] },
  { key: "given", label: "Given names", cat: "Personal Information 1", n: norm.name, s: "same", sv: "critical", labels: ["Given Names", "Given Name", "First Name"] },
  { key: "nativeName", label: "Full name in native language", cat: "Personal Information 1", n: norm.plain, s: "same", sv: "high", labels: ["Full Name in Native Language", "Full Name in Native Alphabet", "Name in Native Alphabet", "Native Alphabet"] },
  { key: "otherNames", label: "Other names used", cat: "Personal Information 1", n: norm.name, s: "same", sv: "high", labels: ["Other Names Used", "Other Names"] },
  { key: "telecode", label: "Telecode name", cat: "Personal Information 1", n: norm.plain, s: "same", sv: "low", labels: ["Telecode Name Used", "Telecode Name", "Telecode"] },
  { key: "sex", label: "Sex", cat: "Personal Information 1", n: norm.upper, s: "same", sv: "critical", labels: ["Sex", "Gender"] },
  { key: "maritalStatus", label: "Marital status", cat: "Personal Information 1", n: norm.upper, s: "same", sv: "high", labels: ["Marital Status"] },
  { key: "dob", label: "Date of birth", cat: "Personal Information 1", n: norm.date, s: "same", sv: "critical", labels: ["Date of Birth", "Birth Date", "DOB"] },
  { key: "placeOfBirth", label: "Place of birth", cat: "Personal Information 1", n: norm.name, s: "same", sv: "high", labels: ["Place of Birth"] },
  { key: "cityOfBirth", label: "City of birth", cat: "Personal Information 1", n: norm.name, s: "same", sv: "high", labels: ["City of Birth"] },
  { key: "stateOfBirth", label: "State/province of birth", cat: "Personal Information 1", n: norm.name, s: "same", sv: "medium", labels: ["State/Province of Birth", "State of Birth", "Province of Birth"] },
  { key: "countryOfBirth", label: "Country of birth", cat: "Personal Information 1", n: norm.upper, s: "same", sv: "high", labels: ["Country/Region of Birth", "Country of Birth"] },
  // ── Personal Information 2 ──
  { key: "nationality", label: "Nationality", cat: "Personal Information 2", n: norm.upper, s: "same", sv: "critical", labels: ["Country/Region of Origin (Nationality)", "Nationality"] },
  { key: "otherNationality", label: "Held any other nationality?", cat: "Personal Information 2", n: norm.upper, s: "same", sv: "medium", q: true, labels: ["Do you hold or have you held any nationality", "Hold or Held Any Other Nationality", "Other Nationality"] },
  { key: "permanentResident", label: "Permanent resident elsewhere?", cat: "Personal Information 2", n: norm.upper, s: "same", sv: "low", q: true, labels: ["Are you a permanent resident of a country/region other than your", "Are you a permanent resident of a country"] },
  { key: "nationalId", label: "National ID number", cat: "Personal Information 2", n: norm.id, s: "same", sv: "medium", labels: ["National Identification Number", "National ID Number", "National ID"] },
  { key: "ssn", label: "U.S. Social Security number", cat: "Personal Information 2", n: norm.id, s: "same", sv: "medium", labels: ["U.S. Social Security Number", "Social Security Number"] },
  { key: "taxId", label: "U.S. taxpayer ID", cat: "Personal Information 2", n: norm.id, s: "same", sv: "low", labels: ["U.S. Taxpayer ID Number", "Taxpayer ID Number", "Taxpayer ID"] },
  // ── Address and Phone ──  (generic City/State/etc. repeat across sections; the moving
  //    cursor in extract() binds the FIRST occurrence here to the home address)
  { key: "homeAddress", label: "Home address", cat: "Address and Phone", n: norm.plain, s: "same", sv: "medium", labels: ["Home Address", "Street Address (Line 1)", "Applicant Address"] },
  { key: "homeCity", label: "City", cat: "Address and Phone", n: norm.name, s: "same", sv: "low", generic: true, labels: ["City"] },
  { key: "homeState", label: "State/province", cat: "Address and Phone", n: norm.name, s: "same", sv: "low", generic: true, labels: ["State/Province", "State"] },
  { key: "homePostal", label: "Postal/ZIP code", cat: "Address and Phone", n: norm.id, s: "same", sv: "low", generic: true, labels: ["Postal Zone/ZIP Code", "Postal Zone/Zip Code", "ZIP Code"] },
  { key: "homeCountry", label: "Country/region", cat: "Address and Phone", n: norm.upper, s: "same", sv: "low", generic: true, labels: ["Country/Region"] },
  { key: "sameMailingAddress", label: "Same mailing address?", cat: "Address and Phone", n: norm.upper, s: "same", sv: "low", q: true, labels: ["Is your Mailing Address the same as your Home Address", "Same Mailing Address"] },
  { key: "homePhone", label: "Primary phone", cat: "Address and Phone", n: norm.id, s: "same", sv: "medium", labels: ["Primary Phone Number", "Home Phone Number", "Primary Phone"] },
  { key: "secondaryPhone", label: "Secondary phone", cat: "Address and Phone", n: norm.id, s: "same", sv: "low", labels: ["Secondary Phone Number", "Secondary Phone"] },
  { key: "workPhone", label: "Work phone", cat: "Address and Phone", n: norm.id, s: "same", sv: "low", labels: ["Work Phone Number", "Work Phone"] },
  { key: "additionalPhones", label: "Additional phone numbers?", cat: "Address and Phone", n: norm.upper, s: "same", sv: "low", q: true, labels: ["Do you have any additional phone numbers"] },
  { key: "email", label: "Email address", cat: "Address and Phone", n: norm.upper, s: "same", sv: "medium", labels: ["E-mail Address", "Email Address"] },
  { key: "additionalEmails", label: "Additional email addresses?", cat: "Address and Phone", n: norm.upper, s: "same", sv: "low", q: true, labels: ["Do you have any additional email addresses"] },
  { key: "additionalEmail1", label: "Additional email", cat: "Address and Phone", n: norm.upper, s: "same", sv: "low", labels: ["Additional Email"] },
  { key: "socialMediaProvider", label: "Social media platform", cat: "Address and Phone", n: norm.upper, s: "same", sv: "low", labels: ["Social Media Platform", "Social Media Provider/Platform", "Social Media Provider"] },
  { key: "socialMediaId", label: "Social media identifier", cat: "Address and Phone", n: norm.plain, s: "same", sv: "low", labels: ["Social Media Identifier"] },
  { key: "additionalSocial", label: "Additional social media?", cat: "Address and Phone", n: norm.upper, s: "same", sv: "low", q: true, labels: ["Do you have any additional social media presence"] },
  // ── Passport ──
  { key: "passportType", label: "Passport type", cat: "Passport", n: norm.upper, s: "same", sv: "low", labels: ["Passport/Travel Document Type", "Passport Type", "Document Type"] },
  { key: "passportNumber", label: "Passport number", cat: "Passport", n: norm.id, s: "same", sv: "critical", labels: ["Passport/Travel Document Number", "Passport Number", "Document Number"] },
  { key: "passportBookNumber", label: "Passport book number", cat: "Passport", n: norm.id, s: "same", sv: "medium", labels: ["Passport Book Number", "Book Number"] },
  { key: "passportIssuer", label: "Issuing country/authority", cat: "Passport", n: norm.upper, s: "same", sv: "high", labels: ["Country/Authority that Issued Passport/Travel Document", "Issuing Country", "Issuing Authority"] },
  { key: "passportIssueCity", label: "Passport issued in city", cat: "Passport", n: norm.name, s: "same", sv: "low", labels: ["City where issued", "City of Issuance", "Passport Issued in City"] },
  { key: "passportIssueCountry", label: "Passport issued in country", cat: "Passport", n: norm.upper, s: "same", sv: "low", labels: ["Country/Region where issued", "Country where Issued"] },
  { key: "passportIssuance", label: "Issuance date", cat: "Passport", n: norm.date, s: "same", sv: "high", labels: ["Passport Issuance Date", "Date of Issuance", "Issuance Date"] },
  { key: "passportExpiration", label: "Expiration date", cat: "Passport", n: norm.date, s: "same", sv: "high", labels: ["Passport Expiration Date", "Expiration Date"] },
  { key: "lostStolenPassport", label: "Ever lost a passport / had one stolen?", cat: "Passport", n: norm.upper, s: "same", sv: "medium", q: true, labels: ["Have you ever lost a passport or had one stolen"] },
  // ── Travel ──
  { key: "purposeOfTrip", label: "Purpose of trip", cat: "Travel", n: norm.upper, s: "same", sv: "high", labels: ["Purpose of Trip to the U.S.", "Purpose of Trip"] },
  { key: "purposeSpecify", label: "Purpose (specify)", cat: "Travel", n: norm.upper, s: "same", sv: "low", labels: ["Specify"] },
  { key: "petitionNumber", label: "Application receipt / petition number", cat: "Travel", n: norm.id, s: "same", sv: "high", labels: ["Application Receipt/Petition Number", "Petition Number", "Receipt Number"] },
  { key: "travelPlans", label: "Made specific travel plans?", cat: "Travel", n: norm.upper, s: "same", sv: "low", q: true, labels: ["Have you made specific travel plans"] },
  { key: "intendedArrival", label: "Intended date of arrival", cat: "Travel", n: norm.date, s: "same", sv: "medium", labels: ["Intended Date of Arrival", "Date of Arrival"] },
  { key: "lengthOfStay", label: "Intended length of stay", cat: "Travel", n: norm.plain, s: "same", sv: "low", labels: ["Intended Length of Stay in U.S.", "Intended Length of Stay", "Length of Stay"] },
  { key: "stayAddress", label: "Address where you will stay", cat: "Travel", n: norm.plain, s: "same", sv: "medium", labels: ["Address where you will stay in the U.S.", "Address Where You Will Stay in the U.S.", "Address Where You Will Stay"] },
  { key: "whoPaying", label: "Who is paying for the trip", cat: "Travel", n: norm.upper, s: "same", sv: "medium", labels: ["Person/Entity Paying for Your Trip", "Who is Paying for Your Trip"] },
  // ── Travel Companions ──
  { key: "travelCompanions", label: "Other persons traveling with you?", cat: "Travel Companions", n: norm.upper, s: "same", sv: "low", q: true, labels: ["Are there other persons traveling with you", "Other Persons Traveling with You"] },
  // ── Previous U.S. Travel ──
  { key: "beenInUS", label: "Ever been in the U.S.?", cat: "Previous U.S. Travel", n: norm.upper, s: "same", sv: "medium", q: true, labels: ["Have you ever been in the U.S."] },
  { key: "hasDriversLicense", label: "Hold a U.S. driver's license?", cat: "Previous U.S. Travel", n: norm.upper, s: "same", sv: "low", q: true, labels: ["Do you or did you hold a U.S. Driver's License", "Do you or did you hold a U.S. Drivers License"] },
  { key: "driversLicenseNumber", label: "Driver's license number", cat: "Previous U.S. Travel", n: norm.id, s: "same", sv: "medium", labels: ["Driver's License Number", "Drivers License Number"] },
  { key: "driversLicenseState", label: "Driver's license state", cat: "Previous U.S. Travel", n: norm.upper, s: "same", sv: "low", labels: ["State of Driver's License", "State of Drivers License"] },
  { key: "issuedUSVisa", label: "Ever issued a U.S. visa?", cat: "Previous U.S. Travel", n: norm.upper, s: "same", sv: "medium", q: true, labels: ["Have you ever been issued a U.S. Visa", "Have you ever been issued a U.S. visa"] },
  { key: "dateLastVisaIssued", label: "Date last visa was issued", cat: "Previous U.S. Travel", n: norm.date, s: "same", sv: "low", labels: ["Date Last Visa was Issued", "Date Last Visa Issued"] },
  { key: "priorVisaNumber", label: "Previous visa number", cat: "Previous U.S. Travel", n: norm.id, s: "same", sv: "medium", labels: ["Visa Number"] },
  { key: "visaRefused", label: "Ever refused a U.S. visa?", cat: "Previous U.S. Travel", n: norm.upper, s: "same", sv: "high", q: true, labels: ["Have you ever been refused a U.S. Visa", "been refused admission to the United States"] },
  { key: "immigrantPetition", label: "Immigrant petition filed for you?", cat: "Previous U.S. Travel", n: norm.upper, s: "same", sv: "low", q: true, labels: ["Has anyone ever filed an immigrant petition on your behalf"] },
  // ── U.S. Point of Contact ──
  { key: "contactName", label: "Contact person", cat: "U.S. Point of Contact", n: norm.name, s: "same", sv: "medium", labels: ["Contact Person Name in the U.S.", "Contact Person Name", "Name of Contact Person", "Contact Person"] },
  { key: "contactOrg", label: "Contact organization", cat: "U.S. Point of Contact", n: norm.name, s: "same", sv: "low", labels: ["Organization Name in the U.S.", "Name of Organization", "Organization Name"] },
  { key: "contactRelationship", label: "Relationship to you", cat: "U.S. Point of Contact", n: norm.upper, s: "same", sv: "low", labels: ["Relationship to You"] },
  { key: "contactAddress", label: "Contact address", cat: "U.S. Point of Contact", n: norm.plain, s: "same", sv: "low", labels: ["U.S. Contact Address"] },
  { key: "contactPhone", label: "Contact phone", cat: "U.S. Point of Contact", n: norm.id, s: "same", sv: "low", labels: ["Contact Phone Number", "U.S. Point of Contact Phone"] },
  // ── Family ──
  { key: "fatherSurname", label: "Father's surname", cat: "Family", n: norm.name, s: "same", sv: "medium", labels: ["Father's Surnames", "Father's Surname", "Fathers Surname"] },
  { key: "fatherGiven", label: "Father's given names", cat: "Family", n: norm.name, s: "same", sv: "medium", labels: ["Father's Given Names", "Fathers Given Names"] },
  { key: "fatherDob", label: "Father's date of birth", cat: "Family", n: norm.date, s: "same", sv: "low", labels: ["Father's Date of Birth", "Fathers Date of Birth"] },
  { key: "motherSurname", label: "Mother's surname", cat: "Family", n: norm.name, s: "same", sv: "medium", labels: ["Mother's Surnames", "Mother's Surname", "Mothers Surname"] },
  { key: "motherGiven", label: "Mother's given names", cat: "Family", n: norm.name, s: "same", sv: "medium", labels: ["Mother's Given Names", "Mothers Given Names"] },
  { key: "motherDob", label: "Mother's date of birth", cat: "Family", n: norm.date, s: "same", sv: "low", labels: ["Mother's Date of Birth", "Mothers Date of Birth"] },
  { key: "immediateRelatives", label: "Immediate relatives in the U.S.?", cat: "Family", n: norm.upper, s: "same", sv: "low", q: true, labels: ["Do you have any immediate relatives, not including parents in the U.S.", "Do you have any immediate relatives"] },
  { key: "otherRelatives", label: "Other relatives in the U.S.?", cat: "Family", n: norm.upper, s: "same", sv: "low", q: true, labels: ["Do you have any other relatives in the United States"] },
  { key: "spouseName", label: "Spouse's full name", cat: "Family", n: norm.name, s: "same", sv: "low", labels: ["Spouse's Full Name", "Spouse Full Name", "Spouse Name"] },
  { key: "spouseDob", label: "Spouse's date of birth", cat: "Family", n: norm.date, s: "same", sv: "low", labels: ["Spouse's Date of Birth", "Spouse Date of Birth"] },
  { key: "spouseNationality", label: "Spouse's nationality", cat: "Family", n: norm.upper, s: "same", sv: "low", labels: ["Spouse's Country/Region of Origin (Nationality)", "Spouse's Nationality"] },
  { key: "spouseCityOfBirth", label: "Spouse's city of birth", cat: "Family", n: norm.name, s: "same", sv: "low", labels: ["Spouse's City of Birth"] },
  // ── Work / Education / Training ──
  { key: "occupation", label: "Primary occupation", cat: "Work / Education / Training", n: norm.upper, s: "same", sv: "medium", labels: ["Primary Occupation"] },
  { key: "presentEmployer", label: "Present employer or school", cat: "Work / Education / Training", n: norm.name, s: "same", sv: "medium", labels: ["Present Employer or School Name", "Employer Name", "Present Employer"] },
  { key: "employerAddress", label: "Employer/school address", cat: "Work / Education / Training", n: norm.plain, s: "same", sv: "low", generic: true, labels: ["Present Employer or School Address", "Employer/School Address", "Employer Address", "Address"] },
  { key: "startDate", label: "Start date", cat: "Work / Education / Training", n: norm.date, s: "same", sv: "low", labels: ["Start Date"] },
  { key: "monthlyIncome", label: "Monthly income", cat: "Work / Education / Training", n: norm.money, s: "same", sv: "low", labels: ["Monthly Salary in Local Currency", "Monthly Income in Local Currency", "Monthly Income", "Monthly Salary"] },
  { key: "prevEmployed", label: "Previously employed?", cat: "Work / Education / Training", n: norm.upper, s: "same", sv: "low", q: true, labels: ["Were you previously employed"] },
];

const ds160 = {
  id: "ds160", label: "DS-160",
  categories: DS160_CATEGORIES,
  detect: text => /DS[-\s]?160|NONIMMIGRANT VISA APPLICATION/i.test(text) ? 0.95 : 0,
  extract: ({ lines }) => {
    const L = normLines(lines), Lk = L.map(normKey);
    const fields = {};
    let cursor = 0;   // walk the document in field order so repeated labels bind per-section
    for (const f of DS160_FIELDS) {
      const find = f.q ? findYesNo : findLabel;
      let r = find(L, Lk, f.labels, cursor);
      if (r.index < 0 && !f.generic) r = find(L, Lk, f.labels, 0);  // unique labels may search globally
      fields[f.key] = mkField(r.value, r.confidence, r.source);
      if (r.index >= cursor) cursor = r.index;                      // advance forward only
    }
    // The print writes the name once as "Name Provided: SURNAME, GIVEN".
    if (!fields.surname.value || !fields.given.value) {
      const np = findLabel(L, Lk, ["Name Provided", "Full Name Provided"], 0);
      const comma = np.value.indexOf(",");
      if (comma > -1) {
        const sn = np.value.slice(0, comma).trim(), gn = np.value.slice(comma + 1).trim();
        if (!fields.surname.value && sn) fields.surname = mkField(sn, np.confidence, np.source);
        if (!fields.given.value && gn) fields.given = mkField(gn, np.confidence, np.source);
      }
    }
    return { fields };
  },
  fieldSchema: DS160_FIELDS.map(f => ({
    key: f.key, label: f.label, category: f.cat, normalizer: f.n, semantics: f.s, severity: f.sv,
  })),
  rules: [],
};

const i797 = {
  id: "i797", label: "I-797 Notice of Action",
  detect: text => scoreFrom(text, [/I-?797/, /NOTICE OF ACTION/, /RECEIPT NUMBER/, /USCIS/]) >= 0.5 ? 0.9 : 0,
  extract: ({ lines }) => ({ fields: {
    receiptNumber: grabLabel(lines, ["Receipt Number", "Receipt No"]),
    noticeType: grabLabel(lines, ["Notice Type"]),
    caseType: grabLabel(lines, ["Case Type", "Class", "Classification", "Petition Type"]),
    petitioner: grabLabel(lines, ["Petitioner", "Employer"]),
    beneficiary: grabLabel(lines, ["Beneficiary"]),
    validFrom: grabLabel(lines, ["Valid From", "Validity From", "Petition Validity"]),
    validTo: grabLabel(lines, ["Valid To", "Valid Until", "Validity To"]),
    noticeDate: grabLabel(lines, ["Notice Date", "Received Date"]),
    serviceCenter: grabLabel(lines, ["Service Center", "USCIS Office"]),
  } }),
  fieldSchema: [
    { key: "receiptNumber", label: "Receipt number", normalizer: norm.id, semantics: "same", severity: "critical" },
    { key: "beneficiary", label: "Beneficiary", normalizer: norm.name, semantics: "same", severity: "critical" },
    { key: "petitioner", label: "Petitioner", normalizer: norm.name, semantics: "same", severity: "high" },
    { key: "caseType", label: "Classification", normalizer: norm.upper, semantics: "same", severity: "high" },
    { key: "noticeType", label: "Notice type", normalizer: norm.upper, semantics: "either", severity: "medium" },
    { key: "validFrom", label: "Validity start", normalizer: norm.date, semantics: "differ", severity: "high" },
    { key: "validTo", label: "Validity end", normalizer: norm.date, semantics: "differ", severity: "high" },
    { key: "noticeDate", label: "Notice date", normalizer: norm.date, semantics: "differ", severity: "low" },
    { key: "serviceCenter", label: "Service center", normalizer: norm.upper, semantics: "either", severity: "low" },
  ],
  rules: [
    { id: "i797-classification-change", severity: "high", requires: ["caseType"],
      evaluate: (a, b) => valChanged(a, b, "caseType", norm.upper)
        ? finding("high", "Classification changed", `${a.fields.caseType.value} → ${b.fields.caseType.value}`) : null },
    { id: "i797-validity-gap", severity: "warning", requires: ["validTo", "validFrom"],
      evaluate: (a, b) => {
        const oldEnd = toISO(a.fields.validTo.value), newStart = toISO(b.fields.validFrom.value);
        if (oldEnd && newStart && newStart > oldEnd)
          return finding("warning", "Gap between old validity end and new start",
            `${oldEnd} → ${newStart} (${daysBetween(oldEnd, newStart)} day gap)`);
        return null;
      } },
  ],
};

const i20 = {
  id: "i20", label: "I-20 / DS-2019",
  detect: text => scoreFrom(text, [/SEVIS/, /I-?20|DS-?2019/, /CERTIFICATE OF ELIGIBILITY|EXCHANGE VISITOR/, /PROGRAM/]) >= 0.5 ? 0.9 : 0,
  extract: ({ lines }) => ({ fields: {
    sevisId: grabLabel(lines, ["SEVIS ID", "SEVIS Identification", "SEVIS No", "SEVIS"]),
    schoolName: grabLabel(lines, ["School Name", "Program Sponsor", "Sponsor Name"]),
    programStart: grabLabel(lines, ["Program Start", "Start of Program", "Begin"]),
    programEnd: grabLabel(lines, ["Program End", "End of Program", "End Date"]),
    degreeLevel: grabLabel(lines, ["Education Level", "Degree Level", "Level"]),
    fieldOfStudy: grabLabel(lines, ["Major", "Field of Study", "CIP"]),
    funding: grabLabel(lines, ["Total", "Estimated average costs", "Funding"]),
    employmentAuth: grabLabel(lines, ["Employment Authorization", "CPT", "OPT", "Practical Training"]),
  } }),
  fieldSchema: [
    { key: "sevisId", label: "SEVIS ID", normalizer: norm.id, semantics: "same", severity: "critical" },
    { key: "schoolName", label: "School / sponsor", normalizer: norm.name, semantics: "same", severity: "high" },
    { key: "programStart", label: "Program start", normalizer: norm.date, semantics: "differ", severity: "high" },
    { key: "programEnd", label: "Program end", normalizer: norm.date, semantics: "differ", severity: "high" },
    { key: "degreeLevel", label: "Degree level", normalizer: norm.upper, semantics: "same", severity: "medium" },
    { key: "fieldOfStudy", label: "Field of study", normalizer: norm.upper, semantics: "same", severity: "medium" },
    { key: "funding", label: "Funding total", normalizer: norm.money, semantics: "differ", severity: "low" },
    { key: "employmentAuth", label: "Employment authorization", normalizer: norm.upper, semantics: "either", severity: "low" },
  ],
  rules: [
    { id: "i20-sevis-change", severity: "warning", requires: ["sevisId"],
      evaluate: (a, b) => valChanged(a, b, "sevisId", norm.id)
        ? finding("warning", "SEVIS ID changed — likely a transfer or new record",
            `${a.fields.sevisId.value} → ${b.fields.sevisId.value}`, /*loud*/true) : null },
    { id: "i20-funding-change", severity: "info", requires: ["funding"],
      evaluate: (a, b) => valChanged(a, b, "funding", norm.money)
        ? finding("info", "Funding total changed",
            `${a.fields.funding.value} → ${b.fields.funding.value}`) : null },
  ],
};

const ead = {
  id: "ead", label: "EAD card (I-766)",
  detect: text => scoreFrom(text, [/I-?766/, /EMPLOYMENT AUTHORIZATION/, /USCIS#|USCIS NUMBER/, /CATEGORY/]) >= 0.5 ? 0.85 : 0,
  extract: ({ lines }) => ({ fields: {
    cardNumber: grabLabel(lines, ["Card Number", "Card No"]),
    category: grabLabel(lines, ["Category", "Category Code"]),
    validFrom: grabLabel(lines, ["Valid From", "Not Valid Before"]),
    validTo: grabLabel(lines, ["Valid Until", "Card Expires", "Expires"]),
    uscisNumber: grabLabel(lines, ["USCIS#", "USCIS Number", "USCIS No", "A-Number", "A#"]),
  } }),
  fieldSchema: [
    { key: "uscisNumber", label: "USCIS number", normalizer: norm.id, semantics: "same", severity: "critical" },
    { key: "category", label: "Category code", normalizer: norm.id, semantics: "same", severity: "high" },
    { key: "cardNumber", label: "Card number", normalizer: norm.id, semantics: "differ", severity: "medium" },
    { key: "validFrom", label: "Valid from", normalizer: norm.date, semantics: "differ", severity: "medium" },
    { key: "validTo", label: "Valid until", normalizer: norm.date, semantics: "differ", severity: "high" },
  ],
  rules: [
    { id: "ead-category-change", severity: "high", requires: ["category"],
      evaluate: (a, b) => valChanged(a, b, "category", norm.id)
        ? finding("high", "EAD category code changed",
            `${a.fields.category.value} → ${b.fields.category.value}`) : null },
  ],
};

// LCA (ETA-9035) and offer letter are two SIDES of a cross-type comparison.
const lca = {
  id: "lca", label: "LCA (ETA-9035)",
  detect: text => scoreFrom(text, [/ETA-?9035|LABOR CONDITION APPLICATION/, /PREVAILING WAGE/, /SOC/, /WAGE LEVEL|WAGE RATE/]) >= 0.5 ? 0.9 : 0,
  extract: ({ lines }) => ({ fields: {
    socCode: grabLabel(lines, ["SOC Code", "SOC/O*NET", "SOC"]),
    jobTitle: grabLabel(lines, ["Job Title", "Occupation"]),
    worksite: grabLabel(lines, ["Worksite Address", "Place of Employment", "Worksite"]),
    wageRate: grabLabel(lines, ["Wage Rate", "Wage Offer", "Rate of Pay", "Prevailing Wage"]),
    wageLevel: grabLabel(lines, ["Wage Level", "Level"]),
    employFrom: grabLabel(lines, ["Begin Date", "Period of Employment", "Employment Start"]),
    employTo: grabLabel(lines, ["End Date", "Employment End"]),
    fullTime: grabLabel(lines, ["Full Time", "Full-Time Position", "FT/PT"]),
  } }),
  fieldSchema: [],
  rules: [],
};

const offerLetter = {
  id: "offer", label: "Offer letter",
  detect: text => scoreFrom(text, [/OFFER OF EMPLOYMENT|OFFER LETTER|WE ARE PLEASED TO OFFER/, /SALARY|ANNUAL COMPENSATION|BASE PAY/, /POSITION|TITLE/]) >= 0.5 ? 0.7 : 0,
  extract: ({ lines }) => ({ fields: {
    jobTitle: grabLabel(lines, ["Position", "Title", "Job Title"]),
    worksite: grabLabel(lines, ["Location", "Worksite", "Office", "Work Location"]),
    salary: grabLabel(lines, ["Salary", "Base Pay", "Annual Compensation", "Base Salary"]),
    startDate: grabLabel(lines, ["Start Date", "Anticipated Start"]),
    fullTime: grabLabel(lines, ["Full Time", "Full-Time", "Employment Type"]),
    socCode: grabLabel(lines, ["SOC"]),
  } }),
  fieldSchema: [],
  rules: [],
};

export const DOC_TYPES = [passport, ds160, i797, i20, ead, lca, offerLetter];
export const TYPE_BY_ID = Object.fromEntries(DOC_TYPES.map(t => [t.id, t]));

/* ───────────────────────── detection ───────────────────────── */

export function detectType(text) {
  const scored = DOC_TYPES.map(t => ({ id: t.id, label: t.label, score: t.detect(text || "") }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { id: "general", label: "Unrecognized", score: 0, ambiguous: false, candidates: [] };
  const top = scored[0];
  const ambiguous = scored.length > 1 && (top.score - scored[1].score) < 0.15;
  return { id: top.id, label: top.label, score: top.score, ambiguous, candidates: scored };
}

/* ───────────────────────── comparison ───────────────────────── */

// Same-type version diff (DS-160↔DS-160, passport↔passport, I-797↔I-797, …)
export function compareVersions(typeId, a, b) {
  const type = TYPE_BY_ID[typeId];
  if (!type) return { error: `Unknown document type: ${typeId}` };
  const rows = [];
  for (const f of type.fieldSchema) {
    const av = a.fields[f.key] || mkField("", 0), bv = b.fields[f.key] || mkField("", 0);
    if (!av.value && !bv.value) continue;
    const outcome = compareValues(av, bv, f.normalizer);
    rows.push({
      key: f.key, label: f.label, category: f.category || "Details", semantics: f.semantics,
      a: av, b: bv, outcome,
      severity: severityFor(f, outcome),
      confidence: Math.min(av.confidence || 0, bv.confidence || 0),
    });
  }
  const findings = [];
  for (const rule of type.rules) {
    if (rule.requires.some(k => !(a.fields[k]?.value) || !(b.fields[k]?.value))) {
      findings.push({ id: rule.id, skipped: true, reason: "required field not found on both versions" });
      continue;
    }
    const f = rule.evaluate(a, b);
    if (f) findings.push({ id: rule.id, ...f });
  }
  return { type: typeId, mode: "version", rows, findings };
}

// Cross-type comparison. Only LCA↔offer is defined.
export function compareCross(a, b) {
  const pair = new Set([a.type, b.type]);
  if (pair.has("lca") && pair.has("offer")) return compareLcaOffer(a, b);
  return { error: `No cross-type comparison defined for ${a.type} vs ${b.type}. ` +
    `These are different document types; comparing them field-by-field would produce noise.`, undefinedPair: true };
}

function compareLcaOffer(a, b) {
  const L = a.type === "lca" ? a : b;   // LCA side
  const O = a.type === "lca" ? b : a;   // offer side
  const findings = [];
  const rows = [];
  const pair = (label, lkey, okey, normalizer, semantics, severity) => {
    const lv = L.fields[lkey] || mkField(""), ov = O.fields[okey] || mkField("");
    if (!lv.value && !ov.value) return;
    rows.push({ label, a: lv, b: ov, outcome: compareValues(lv, ov, normalizer), semantics, severity,
                confidence: Math.min(lv.confidence || 0, ov.confidence || 0) });
  };
  pair("SOC code", "socCode", "socCode", norm.id, "same", "high");
  pair("Job title", "jobTitle", "jobTitle", norm.name, "same", "high");
  pair("Worksite", "worksite", "worksite", norm.name, "same", "high");
  pair("Full/part time", "fullTime", "fullTime", norm.upper, "same", "medium");

  // offered wage below LCA rate
  const lcaWage = norm.money(L.fields.wageRate?.value), offerWage = norm.money(O.fields.salary?.value);
  if (lcaWage != null && offerWage != null) {
    rows.push({ label: "Wage", a: L.fields.wageRate, b: O.fields.salary, semantics: "same",
      outcome: offerWage >= lcaWage ? "match" : "mismatch", severity: "critical",
      confidence: Math.min(L.fields.wageRate.confidence, O.fields.salary.confidence) });
    if (offerWage < lcaWage)
      findings.push(finding("blocker", "Offered wage is below the LCA wage rate",
        `offer ${offerWage} < LCA ${lcaWage}`));
  }
  // worksite mismatch
  if (L.fields.worksite?.value && O.fields.worksite?.value &&
      norm.name(L.fields.worksite.value) !== norm.name(O.fields.worksite.value))
    findings.push(finding("warning", "Worksite differs between LCA and offer",
      `${L.fields.worksite.value} ≠ ${O.fields.worksite.value}`));
  // offer start outside LCA validity
  const start = toISO(O.fields.startDate?.value),
        from = toISO(L.fields.employFrom?.value), to = toISO(L.fields.employTo?.value);
  if (start && from && start < from)
    findings.push(finding("warning", "Offer start date is before the LCA period of employment", `${start} < ${from}`));
  if (start && to && start > to)
    findings.push(finding("warning", "Offer start date is after the LCA period of employment", `${start} > ${to}`));

  return { type: "lca-offer", mode: "cross", rows, findings };
}

/* ───────────────────────── helpers ───────────────────────── */

function severityFor(f, outcome) {
  if (outcome === "match" || outcome === "absent") return "none";
  if (outcome === "unreadable") return "unreadable";
  if (outcome === "one-sided") return f.severity === "critical" ? "high" : "low";
  // mismatch
  if (f.semantics === "differ") return "info";   // expected to change (e.g. new passport number)
  if (f.semantics === "either") return "info";
  return f.severity;                              // 'same' mismatch → its declared severity
}

function valChanged(a, b, key, normalizer) {
  const av = a.fields[key]?.value, bv = b.fields[key]?.value;
  if (!av || !bv) return false;
  return normalizer(av) !== normalizer(bv);
}
function finding(severity, title, detail, loud = false) { return { severity, title, detail, loud }; }
function daysBetween(isoA, isoB) {
  return Math.round((Date.parse(isoB) - Date.parse(isoA)) / 86400000);
}
