"use strict";
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

/* ============ state ============ */
const slots = {
  A: { files: [], mrzShown: false },
  B: { files: [], mrzShown: false }
};
let mode = "auto";

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ============ slot UI ============ */
$$(".slot-body").forEach(body => {
  const key   = body.dataset.slot;
  const drop  = body.querySelector(".drop");
  const input = body.querySelector("input[type=file]");
  const toggle= body.querySelector(".mrztoggle");
  const mrzbox= body.querySelector(".mrzbox");

  drop.addEventListener("click", () => input.click());
  drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") input.click(); });
  ["dragover","dragenter"].forEach(ev =>
    drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave","drop"].forEach(ev =>
    drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => addFiles(key, e.dataTransfer.files));
  input.addEventListener("change", e => { addFiles(key, e.target.files); input.value = ""; });

  toggle.addEventListener("click", () => {
    slots[key].mrzShown = !slots[key].mrzShown;
    mrzbox.classList.toggle("show", slots[key].mrzShown);
    toggle.innerHTML = (slots[key].mrzShown ? "&#9652;" : "&#9662;") +
      " or paste the passport MRZ instead";
  });
});

function addFiles(key, fileList) {
  for (const f of fileList) slots[key].files.push(f);
  renderFiles(key);
}
function renderFiles(key) {
  const list = $(`.slot-body[data-slot=${key}] .filelist`);
  list.innerHTML = "";
  slots[key].files.forEach((f, i) => {
    const row = document.createElement("div");
    row.className = "fileitem";
    row.innerHTML =
      `<span>&#128196;</span>
       <span class="nm">${escapeHtml(f.name)}</span>
       <span class="sz">${(f.size/1024).toFixed(0)} KB</span>
       <span class="x" title="Remove">&times;</span>`;
    row.querySelector(".x").addEventListener("click", () => {
      slots[key].files.splice(i, 1); renderFiles(key);
    });
    list.appendChild(row);
  });
}

/* ============ mode toggle ============ */
$("#modeSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  $$("#modeSeg button").forEach(x => x.classList.remove("on"));
  b.classList.add("on");
  mode = b.dataset.m;
});

/* ============ logging ============ */
function log(msg, cls = "") {
  const box = $("#log");
  box.classList.add("show");
  const ln = document.createElement("div");
  ln.className = "ln " + cls;
  ln.textContent = msg;
  box.appendChild(ln);
  box.scrollTop = box.scrollHeight;
}

/* ============ extraction ============ */
function getMrz(key) {
  const ta = $(`.slot-body[data-slot=${key}] textarea.mrz`);
  return ta ? ta.value.trim() : "";
}

async function readPdf(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let lines = [], rawChars = 0;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    rawChars += tc.items.reduce((s, it) => s + it.str.length, 0);
    lines = lines.concat(itemsToLines(tc.items));
  }
  return { pdf, lines, rawChars };
}
function itemsToLines(items) {
  const its = items
    .filter(it => it.str.trim().length)
    .map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5] }))
    .sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const lines = []; let cur = [], curY = null;
  for (const it of its) {
    if (curY === null || Math.abs(it.y - curY) <= 3) { cur.push(it); if (curY === null) curY = it.y; }
    else { lines.push(cur); cur = [it]; curY = it.y; }
  }
  if (cur.length) lines.push(cur);
  return lines.map(ln =>
    ln.sort((a, b) => a.x - b.x).map(i => i.s).join(" ").replace(/\s+/g, " ").trim());
}
async function ocrPdf(pdf, key, maxPages = 8) {
  let text = "";
  const n = Math.min(pdf.numPages, maxPages);
  for (let p = 1; p <= n; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 2 });
    const c = document.createElement("canvas");
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    const r = await Tesseract.recognize(c, "eng", { logger: ocrLogger(key, p) });
    text += "\n" + r.data.text;
  }
  if (pdf.numPages > maxPages) log(`  (OCR limited to first ${maxPages} pages)`, "");
  return text;
}
function ocrLogger(key, page) {
  let last = -1;
  return m => {
    if (m.status === "recognizing text") {
      const pct = Math.round(m.progress * 100);
      if (pct >= last + 25) { last = pct; log(`  [${key}] OCR${page?" p"+page:""} ${pct}%`); }
    }
  };
}

async function buildSide(key) {
  const mrz = getMrz(key);
  if (mrz) {
    log(`[${key}] using pasted MRZ`, "ok");
    return { kind: "passport", source: "pasted MRZ",
             text: mrz, lines: mrz.split(/\n/).map(s => s.trim()).filter(Boolean) };
  }
  if (!slots[key].files.length) throw new Error(`No files or MRZ provided for side ${key}.`);

  let lines = [], text = "";
  for (const file of slots[key].files) {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isImg = /^image\//.test(file.type) || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(file.name);
    log(`[${key}] reading ${file.name}…`);
    try {
      if (isPdf) {
        const { pdf, lines: L, rawChars } = await readPdf(file);
        if (rawChars < 30 * pdf.numPages) {
          log(`  scanned PDF detected — running OCR…`);
          const t = await ocrPdf(pdf, key);
          lines = lines.concat(t.split(/\n/).map(s => s.trim()).filter(Boolean));
          text += "\n" + t;
        } else {
          lines = lines.concat(L);
          text += "\n" + L.join("\n");
        }
      } else if (isImg) {
        log(`  image — running OCR…`);
        const r = await Tesseract.recognize(file, "eng", { logger: ocrLogger(key) });
        const t = r.data.text;
        lines = lines.concat(t.split(/\n/).map(s => s.trim()).filter(Boolean));
        text += "\n" + t;
      } else {
        const t = await file.text();
        lines = lines.concat(t.split(/\n/));
        text += "\n" + t;
      }
    } catch (err) {
      log(`  ! failed on ${file.name}: ${err.message}`, "err");
      throw err;
    }
  }
  return { kind: detectKind(text), source: slots[key].files.map(f => f.name).join(", "),
           text, lines };
}

function detectKind(text) {
  const up = text.toUpperCase();
  if (/DS[-\s]?160/.test(up) || /NONIMMIGRANT VISA APPLICATION/.test(up)) return "ds160";
  if (findMRZ(text)) return "passport";
  return "general";
}

/* ============ MRZ (ICAO 9303 TD3) ============ */
function findMRZ(text) {
  const cand = text.split(/\n/)
    .map(l => l.replace(/\s+/g, "").toUpperCase())
    .filter(l => /^[A-Z0-9<]{28,}$/.test(l) && l.includes("<"));
  for (let i = 0; i < cand.length - 1; i++)
    if (/^P[A-Z0-9<]/.test(cand[i])) return [pad44(cand[i]), pad44(cand[i + 1])];
  if (cand.length >= 2) return [pad44(cand[cand.length - 2]), pad44(cand[cand.length - 1])];
  return null;
}
function pad44(l) {
  l = l.replace(/\s+/g, "").toUpperCase();
  return (l + "<".repeat(44)).slice(0, 44);
}
function checkDigit(str) {
  const w = [7, 3, 1]; let s = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i]; let v = 0;
    if (c >= "0" && c <= "9") v = +c;
    else if (c >= "A" && c <= "Z") v = c.charCodeAt(0) - 55;
    s += v * w[i % 3];
  }
  return s % 10;
}
function ckOk(field, actual) {
  return /[0-9]/.test(actual) && +actual === checkDigit(field);
}
function fmtDate(raw, kind) {
  if (!/^\d{6}$/.test(raw)) return raw || "—";
  const yy = +raw.slice(0, 2), mm = raw.slice(2, 4), dd = raw.slice(4, 6);
  let year;
  if (kind === "exp") year = 2000 + yy;
  else { const cut = new Date().getFullYear() % 100; year = yy <= cut ? 2000 + yy : 1900 + yy; }
  return `${year}-${mm}-${dd}`;
}
function parseMRZ(side) {
  const lines = side.lines.filter(Boolean);
  let l1, l2;
  if (side.source === "pasted MRZ" && lines.length >= 2) {
    l1 = pad44(lines[0]); l2 = pad44(lines[1]);
  } else {
    const m = findMRZ(side.text);
    if (!m) return null;
    [l1, l2] = m;
  }
  const nameParts = l1.slice(5, 44).split("<<");
  const surname = (nameParts[0] || "").replace(/</g, " ").replace(/\s+/g, " ").trim();
  const given   = (nameParts.slice(1).join(" ") || "").replace(/</g, " ").replace(/\s+/g, " ").trim();
  const f = {
    l1, l2,
    docType: l1.slice(0, 2).replace(/</g, "").trim() || "P",
    issuer:  l1.slice(2, 5).replace(/</g, "").trim(),
    surname, given,
    docNumber: l2.slice(0, 9).replace(/</g, "").trim(),
    nationality: l2.slice(10, 13).replace(/</g, "").trim(),
    dob: fmtDate(l2.slice(13, 19), "dob"),
    sex: (l2.slice(20, 21).replace(/</g, "X") || "X"),
    expiry: fmtDate(l2.slice(21, 27), "exp"),
    personalNumber: l2.slice(28, 42).replace(/</g, "").trim()
  };
  f.checks = {
    "Passport number": ckOk(l2.slice(0, 9), l2[9]),
    "Date of birth":   ckOk(l2.slice(13, 19), l2[19]),
    "Expiry date":     ckOk(l2.slice(21, 27), l2[27]),
    "Composite":       ckOk(l2.slice(0,10)+l2.slice(13,20)+l2.slice(21,28)+l2.slice(28,43), l2[43])
  };
  return f;
}

/* ============ line diff (LCS) ============ */
function normLine(s) { return s.replace(/\s+/g, " ").trim(); }
function diffLines(aRaw, bRaw) {
  const a = aRaw.map(normLine).filter(Boolean);
  const b = bRaw.map(normLine).filter(Boolean);
  const cap = 3500;
  const A = a.slice(0, cap), B = b.slice(0, cap);
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: "same", x: A[i] }); i++; j++; }
    else if (dp[i+1][j] >= dp[i][j+1]) { out.push({ t: "del", x: A[i] }); i++; }
    else { out.push({ t: "add", x: B[j] }); j++; }
  }
  while (i < n) out.push({ t: "del", x: A[i++] });
  while (j < m) out.push({ t: "add", x: B[j++] });
  return out;
}

/* ============ field extractors ============ */
const DS_LABELS = [
  "Surnames", "Surname", "Given Names", "Full Name in Native Alphabet",
  "Other Names Used", "Sex", "Marital Status", "Date of Birth",
  "City of Birth", "State/Province of Birth", "Country/Region of Birth",
  "Country/Region of Origin (Nationality)", "Nationality",
  "National Identification Number", "U.S. Social Security Number",
  "U.S. Taxpayer ID Number", "Passport/Travel Document Number",
  "Passport Number", "Passport Book Number",
  "Country/Authority that Issued Passport/Travel Document",
  "Passport Issuance Date", "Passport Expiration Date",
  "Purpose of Trip to the U.S.", "Intended Date of Arrival",
  "Email Address", "Primary Phone Number"
];
function parseDS160(lines) {
  const L = lines.map(normLine).filter(Boolean);
  const found = {};
  for (const label of DS_LABELS) {
    const lc = label.toLowerCase();
    for (let i = 0; i < L.length; i++) {
      const idx = L[i].toLowerCase().indexOf(lc);
      if (idx === -1) continue;
      let val = L[i].slice(idx + label.length).replace(/^[\s:.\-]+/, "").trim();
      if (!val && i + 1 < L.length) val = L[i + 1].trim();
      const key = label.replace(/s$/, "");
      if (!found[key] && val) found[key] = val;
      break;
    }
  }
  return found;
}

/* ============ comparison ============ */
function normEq(a, b) {
  const k = s => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return k(a) === k(b) && k(a) !== "";
}

const PASSPORT_FIELDS = [
  ["Document type",   "docType",        "same"],
  ["Issuing country", "issuer",         "same"],
  ["Surname",         "surname",        "same"],
  ["Given names",     "given",          "same"],
  ["Date of birth",   "dob",            "same"],
  ["Sex",             "sex",            "same"],
  ["Nationality",     "nationality",    "same"],
  ["Passport number", "docNumber",      "differ"],
  ["Expiry date",     "expiry",         "differ"],
  ["Personal number", "personalNumber", "either"]
];

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4, none: 5 };
const SEVERITY_LABEL = {
  critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info", none: ""
};

function ds160Severity(label, row) {
  if (row.cls === "match") return "none";
  const lc = label.toLowerCase();
  const critical = ["surname", "given name", "date of birth", "sex", "nationality",
    "national identification", "passport/travel document number", "passport number"];
  const high = ["marital status", "other names", "city of birth", "state/province of birth",
    "country/region of birth", "full name in native", "passport expiration", "passport issuance",
    "country/authority that issued", "purpose of trip"];
  const medium = ["email address", "primary phone", "intended date of arrival",
    "u.s. social security", "u.s. taxpayer", "passport book number"];
  if (critical.some(f => lc.includes(f))) return "critical";
  if (high.some(f => lc.includes(f))) return "high";
  if (medium.some(f => lc.includes(f))) return "medium";
  return "low";
}

function passportSeverity(label, row) {
  if (row.cls === "match") return "none";
  if (row.status === "Updated") return "info";
  if (row.status === "Discrepancy") {
    if (["Surname", "Given names", "Date of birth", "Sex", "Nationality"].includes(label))
      return "critical";
    if (label === "Issuing country") return "high";
    return "high";
  }
  if (row.status === "Unchanged") return "medium";
  if (row.status === "A only" || row.status === "B only") return "low";
  return "low";
}

function attachSeverity(rows, kind) {
  for (const row of rows) {
    row.severity = kind === "ds160" ? ds160Severity(row.label, row)
      : kind === "passport" ? passportSeverity(row.label, row) : "none";
  }
}

function sortBySeverity(rows) {
  return [...rows].sort((a, b) => {
    const d = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    return d || a.label.localeCompare(b.label);
  });
}

function comparePassport(a, b) {
  const pa = parseMRZ(a), pb = parseMRZ(b);
  if (!pa || !pb) return { error: "Could not locate a valid MRZ on " +
    (!pa ? "side A" : "side B") + ". Upload a clearer passport image or paste the MRZ lines." };
  const rows = [];
  let discrepancies = 0, consistent = 0;
  for (const [label, key, expect] of PASSPORT_FIELDS) {
    const av = pa[key] || "", bv = pb[key] || "";
    if (!av && !bv) continue;
    const eq = normEq(av, bv);
    let status, cls;
    if (expect === "same") {
      if (eq) { status = "Match"; cls = "match"; consistent++; }
      else    { status = "Discrepancy"; cls = "miss"; discrepancies++; }
    } else if (expect === "differ") {
      if (eq) { status = "Unchanged"; cls = "warn"; }
      else    { status = "Updated"; cls = "info"; }
    } else {
      if (eq) { status = "Match"; cls = "match"; }
      else    { status = "Changed"; cls = "info"; }
    }
    rows.push({ label, av, bv, status, cls });
  }
  attachSeverity(rows, "passport");
  return { kind: "passport", rows, pa, pb, discrepancies, consistent,
           diff: diffLines([pa.l1, pa.l2], [pb.l1, pb.l2]) };
}

function compareDS160(a, b) {
  const fa = parseDS160(a.lines), fb = parseDS160(b.lines);
  const keys = [...new Set([...Object.keys(fa), ...Object.keys(fb)])];
  const rows = [];
  let discrepancies = 0, consistent = 0;
  for (const k of keys) {
    const av = fa[k] || "", bv = fb[k] || "";
    let status, cls;
    if (av && bv) {
      if (normEq(av, bv)) { status = "Match"; cls = "match"; consistent++; }
      else { status = "Changed"; cls = "miss"; discrepancies++; }
    } else if (av) { status = "A only"; cls = "warn"; discrepancies++; }
    else { status = "B only"; cls = "warn"; discrepancies++; }
    rows.push({ label: k, av, bv, status, cls });
  }
  attachSeverity(rows, "ds160");
  rows.sort((x, y) => x.label.localeCompare(y.label));
  return { kind: "ds160", rows, discrepancies, consistent,
           diff: diffLines(a.lines, b.lines) };
}

function compareGeneral(a, b) {
  const diff = diffLines(a.lines, b.lines);
  const changes = diff.filter(d => d.t !== "same").length;
  const sameCount = diff.filter(d => d.t === "same").length;
  return { kind: "general", diff, discrepancies: changes, consistent: sameCount, rows: [] };
}

/* ============ engine path (extended document types) ============ */
const ENGINE_NEW = ["i797", "i20", "ead", "lca", "offer"];

function engineCompare(a, b) {
  const E = window.VDEngine;
  if (!E) return null;
  if (mode !== "auto") return null;            // explicit ds160/passport/general → legacy
  const detA = E.detectType(a.text), detB = E.detectType(b.text);
  const idA = detA.id, idB = detB.id;
  const isNew = id => ENGINE_NEW.includes(id);
  const crossPair = (x, y) => (x === "lca" && y === "offer") || (x === "offer" && y === "lca");

  const docOf = (id, side) => ({ type: id, ...E.TYPE_BY_ID[id].extract({ text: side.text, lines: side.lines }) });

  if (crossPair(idA, idB)) {
    const res = E.compareCross(docOf(idA, a), docOf(idB, b));
    if (res.error) return { error: res.error };
    return { ...res, title: "LCA ↔ offer letter", labels: ["LCA", "Offer"], a, b, detA, detB };
  }
  if (idA === idB && isNew(idA)) {
    const res = E.compareVersions(idA, docOf(idA, a), docOf(idA, b));
    if (res.error) return { error: res.error };
    return { ...res, title: `${E.TYPE_BY_ID[idA].label} — version comparison`,
             labels: ["Earlier", "Later"], a, b, detA, detB };
  }
  // Mixed/unknown involving a new type, no defined comparison → say so (don't diff garbage)
  if ((isNew(idA) || isNew(idB)) && idA !== idB) {
    return { error: `Side A looks like ${detA.label} and side B like ${detB.label}. ` +
      `These are different document types with no defined comparison, so VisaDash won't diff them field-by-field. ` +
      `Upload two of the same type, or an LCA against an offer letter.` };
  }
  return null;                                  // ds160/passport/general → legacy renderer
}

const ENG_SEV = {
  blocker:  { cls: "sev-crit",  label: "Blocker" },
  critical: { cls: "sev-crit",  label: "Critical" },
  high:     { cls: "sev-high",  label: "High" },
  warning:  { cls: "sev-high",  label: "Warning" },
  medium:   { cls: "sev-med",   label: "Medium" },
  info:     { cls: "sev-info",  label: "Info" },
  low:      { cls: "sev-info",  label: "Low" },
  unreadable:{ cls: "sev-unread", label: "Unreadable" },
  none:     { cls: "", label: "" },
};

function confDot(c) {
  const pct = Math.round((c || 0) * 100);
  const lvl = c >= 0.85 ? "hi" : c >= 0.5 ? "mid" : "lo";
  return `<span class="conf conf-${lvl}" title="Extraction confidence ${pct}%">${pct}%</span>`;
}
function srcTitle(f) {
  if (!f || !f.source) return "";
  const s = f.source;
  return ` title="Source${s.line >= 0 ? " line " + (s.line + 1) : " (MRZ)"}: ${escapeHtml(s.snippet || "")}"`;
}

function renderEngineResult(eng) {
  const [la, lb] = eng.labels;
  const findings = (eng.findings || []).filter(f => !f.skipped);
  const skipped = (eng.findings || []).filter(f => f.skipped);
  const blockers = findings.filter(f => /blocker|critical/.test(f.severity)).length;
  const warns = findings.filter(f => /warning|high|medium/.test(f.severity)).length;

  const findingCard = f => {
    const sv = ENG_SEV[f.severity] || ENG_SEV.info;
    return `<div class="callout ${/blocker|critical/.test(f.severity) ? "danger" : "note"}">
      <div class="lbl"><span class="eng-chip ${sv.cls}">${sv.label}</span> ${escapeHtml(f.title)}${f.loud ? " ⚠" : ""}</div>
      ${f.detail ? `<div class="sub">${escapeHtml(f.detail)}</div>` : ""}</div>`;
  };

  const row = r => {
    const sv = ENG_SEV[r.severity] || ENG_SEV.none;
    const outClass = r.outcome === "match" ? "eng-ok"
      : r.outcome === "unreadable" ? "eng-unread"
      : r.outcome === "mismatch" ? "eng-bad"
      : "eng-neutral";
    const av = r.a || { value: "", confidence: 0 }, bv = r.b || { value: "", confidence: 0 };
    return `<tr class="${outClass}">
      <td>${escapeHtml(r.label)}${sv.label ? ` <span class="eng-chip ${sv.cls}">${sv.label}</span>` : ""}</td>
      <td${srcTitle(av)}>${escapeHtml(av.value || "—")} ${confDot(av.confidence)}</td>
      <td${srcTitle(bv)}>${escapeHtml(bv.value || "—")} ${confDot(bv.confidence)}</td>
      <td class="eng-out">${r.outcome}</td>
    </tr>`;
  };

  const summary = `${blockers} ${blockers === 1 ? "blocker" : "blockers"}, ${warns} to review — verify each against your documents.`;

  const html = `<div class="verdict ${blockers ? "verdict-bad" : warns ? "verdict-warn" : "verdict-ok"}">
      <div class="v-title">${escapeHtml(eng.title)}</div>
      <div class="v-sub">${summary}</div>
    </div>
    ${eng.detA && eng.detB && (eng.detA.ambiguous || eng.detB.ambiguous)
      ? `<div class="callout note"><div class="sub">Detection was not clear-cut for at least one side — confirm the document types are what you intended.</div></div>` : ""}
    ${findings.length ? `<div class="eng-findings">${findings.map(findingCard).join("")}</div>`
      : `<div class="callout note"><div class="sub">No rule-based flags fired. Still review the fields below against your originals.</div></div>`}
    <div class="tbl-wrap"><table class="dt eng-table">
      <thead><tr><th>Field</th><th class="num">${escapeHtml(la)}</th><th class="num">${escapeHtml(lb)}</th><th>Outcome</th></tr></thead>
      <tbody>${(eng.rows || []).map(row).join("")}</tbody>
    </table></div>
    ${skipped.length ? `<div class="tool-notes"><b>Rules skipped</b> (a required field wasn't found on both documents):<br>${skipped.map(s => "&bull; " + escapeHtml(s.id) + " — " + escapeHtml(s.reason)).join("<br>")}</div>` : ""}
    <div class="tool-notes"><b>Confidence + source.</b> Each value shows the extraction confidence; hover a value to see the exact source line it came from. A mismatch between two low-confidence reads is marked <i>unreadable</i>, not a discrepancy. This is not legal advice — verify every field against your original documents.</div>`;

  const el = $("#results");
  el.innerHTML = html;
  el.classList.add("show");
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ============ run ============ */
$("#runBtn").addEventListener("click", run);
$("#demoBtn").addEventListener("click", showDemoReport);
$("#resetBtn").addEventListener("click", () => location.reload());

function showDemoReport() {
  $("#log").innerHTML = "";
  $("#log").classList.remove("show");
  const demo = buildDemoComparison();
  renderResults(demo.result, demo.a, demo.b, "ds160", false, true);
  const steps = $$(".compare-steps span");
  if (steps[2]) steps[2].classList.add("on");
  log("Loaded sample DS-160 comparison (demo data).", "ok");
  $("#log").classList.add("show");
}

function buildDemoComparison() {
  const rows = [
    { label: "Surname", av: "SHARMA", bv: "SHARMA", status: "Match", cls: "match" },
    { label: "Given Name", av: "PRIYA ANIL", bv: "PRIYA A", status: "Changed", cls: "miss" },
    { label: "Date of Birth", av: "1988-01-01", bv: "1988-01-01", status: "Match", cls: "match" },
    { label: "Sex", av: "FEMALE", bv: "FEMALE", status: "Match", cls: "match" },
    { label: "Nationality", av: "INDIA", bv: "INDIA", status: "Match", cls: "match" },
    { label: "Passport Number", av: "Z1234567", bv: "Z7654321", status: "Changed", cls: "miss" },
    { label: "Passport Expiration Date", av: "2030-01-01", bv: "2034-01-01", status: "Changed", cls: "miss" },
    { label: "Email Address", av: "priya.old@gmail.com", bv: "priya.sharma@work.com", status: "Changed", cls: "miss" },
    { label: "Primary Phone Number", av: "+91 98765 43210", bv: "+1 415 555 0199", status: "Changed", cls: "miss" },
    { label: "Purpose of Trip to the U.S.", av: "TEMP. BUSINESS OR PLEASURE VISITOR (B)", bv: "TEMP. BUSINESS OR PLEASURE VISITOR (B)", status: "Match", cls: "match" },
    { label: "Marital Status", av: "SINGLE", bv: "MARRIED", status: "Changed", cls: "miss" },
    { label: "Intended Date of Arrival", av: "2024-06-15", bv: "2026-09-10", status: "Changed", cls: "miss" }
  ];
  attachSeverity(rows, "ds160");
  let discrepancies = 0, consistent = 0;
  for (const r of rows) {
    if (r.cls === "match") consistent++;
    else discrepancies++;
  }
  const diff = [
    { t: "same", x: "Surnames: SHARMA" },
    { t: "del", x: "Given Names: PRIYA ANIL" },
    { t: "add", x: "Given Names: PRIYA A" },
    { t: "same", x: "Date of Birth: 01 JAN 1988" },
    { t: "del", x: "Passport Number: Z1234567" },
    { t: "add", x: "Passport Number: Z7654321" },
    { t: "del", x: "Email Address: priya.old@gmail.com" },
    { t: "add", x: "Email Address: priya.sharma@work.com" },
    { t: "del", x: "Marital Status: SINGLE" },
    { t: "add", x: "Marital Status: MARRIED" }
  ];
  return {
    a: { kind: "ds160", source: "sample-ds160-prior.pdf" },
    b: { kind: "ds160", source: "sample-ds160-current.pdf" },
    result: { kind: "ds160", rows, discrepancies, consistent, diff, demo: true }
  };
}

async function run() {
  const btn = $("#runBtn");
  $("#log").innerHTML = ""; $("#log").classList.add("show");
  $("#results").classList.remove("show");
  btn.disabled = true; btn.textContent = "Working…";
  try {
    if (!window.pdfjsLib) throw new Error("PDF engine failed to load — check your internet connection and reload.");
    log("Starting comparison…");
    const a = await buildSide("A");
    const b = await buildSide("B");
    log(`Side A detected as: ${a.kind.toUpperCase()}`, "ok");
    log(`Side B detected as: ${b.kind.toUpperCase()}`, "ok");

    // Engine path: the extended document types (I-797, I-20/DS-2019, EAD, LCA↔offer)
    // are handled by the pure VDEngine with confidence + source. DS-160/passport/
    // general keep their original rich renderer below.
    const eng = engineCompare(a, b);
    if (eng) {
      if (eng.error) { log("! " + eng.error, "err"); renderError(eng.error); }
      else {
        log(`Engine comparison: ${eng.title}`, "ok");
        renderEngineResult(eng);
        const es = $$(".compare-steps span"); if (es[2]) es[2].classList.add("on");
        log("Done.", "ok");
      }
      return;
    }

    let kind = mode;
    if (mode === "auto") {
      kind = (a.kind === b.kind) ? a.kind : "general";
    }
    let result, typeMismatch = (a.kind !== b.kind);

    if (kind === "passport")      result = comparePassport(a, b);
    else if (kind === "ds160")    result = compareDS160(a, b);
    else                          result = compareGeneral(a, b);

    if (result.error) { log("! " + result.error, "err"); renderError(result.error); }
    else {
      renderResults(result, a, b, kind, typeMismatch && mode === "auto");
      const steps = $$(".compare-steps span");
      if (steps[2]) steps[2].classList.add("on");
      log("Done.", "ok");
    }
  } catch (err) {
    log("! " + err.message, "err");
    renderError(err.message);
  } finally {
    btn.disabled = false; btn.textContent = "Compare documents";
  }
}

/* ============ render ============ */
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
}

const DS_GROUPS = {
  "Identity & biographics": [
    "Surname", "Given Name", "Full Name in Native Alphabet", "Other Names Used",
    "Sex", "Marital Status", "Date of Birth", "City of Birth",
    "State/Province of Birth", "Country/Region of Birth",
    "Country/Region of Origin (Nationality)", "Nationality", "National Identification Number"
  ],
  "Passport & travel documents": [
    "Passport/Travel Document Number", "Passport Number", "Passport Book Number",
    "Country/Authority that Issued Passport/Travel Document",
    "Passport Issuance Date", "Passport Expiration Date"
  ],
  "Contact & trip details": [
    "Purpose of Trip to the U.S.", "Intended Date of Arrival",
    "Email Address", "Primary Phone Number"
  ],
  "U.S. identifiers": [
    "U.S. Social Security Number", "U.S. Taxpayer ID Number"
  ]
};

function dsGroup(label) {
  const lc = label.toLowerCase();
  for (const [group, fields] of Object.entries(DS_GROUPS)) {
    if (fields.some(f => lc === f.toLowerCase() || lc.startsWith(f.toLowerCase().replace(/s$/, ""))))
      return group;
  }
  return "Other fields";
}

function rowNeedsReview(row) {
  return row.cls === "miss" || row.cls === "warn";
}

function rowHint(row, kind) {
  if (row.severity === "critical")
    return "Critical — identity or passport data changed. Officers cross-check these fields against your documents; reconcile before your interview.";
  if (row.severity === "high")
    return "High priority — biographic or travel-document detail changed. Verify the current filing matches your supporting documents.";
  if (row.severity === "medium")
    return "Medium — contact or arrival details changed. Less likely to derail a case, but should still match what you plan to say at interview.";
  if (row.severity === "info")
    return "Expected change — this field typically updates between document versions (e.g. new passport number on renewal).";
  if (kind === "ds160") {
    if (row.status === "Changed")
      return "This answer differs between filings. Confirm which version is correct before your interview.";
    if (row.status === "A only")
      return "Present in the prior filing but missing from the current one — it may have been cleared or not extracted.";
    if (row.status === "B only")
      return "Only appears in the current filing — new information or a newly detected field.";
  }
  if (kind === "passport") {
    if (row.status === "Discrepancy")
      return "Identity data should stay the same across passport renewals. A mismatch may indicate an OCR error.";
    if (row.status === "Updated")
      return "Expected to change when a passport is renewed (new number or expiry).";
    if (row.status === "Unchanged")
      return "Passport number or expiry matched the prior version — unusual for a renewal; double-check.";
  }
  return "";
}

function fcardClass(row) {
  if (row.cls === "miss") return "issue";
  if (row.cls === "match") return "match-card";
  if (row.cls === "warn") return "warn-card";
  return "info-card";
}

function fcardSevBorder(row) {
  if (!rowNeedsReview(row) || !row.severity) return "";
  if (["critical", "high", "medium"].includes(row.severity))
    return ` sev-border-${row.severity}`;
  return "";
}

function severityBadge(row) {
  if (!row.severity || row.severity === "none") return "";
  return `<span class="sev sev-${row.severity}">${SEVERITY_LABEL[row.severity]}</span>`;
}

function renderSeveritySummary(rows) {
  const tiers = ["critical", "high", "medium", "low"];
  const counts = {};
  for (const row of rows.filter(rowNeedsReview))
    counts[row.severity] = (counts[row.severity] || 0) + 1;
  const pills = tiers.filter(t => counts[t]).map(t =>
    `<span class="sev-pill"><span class="sev sev-${t}">${SEVERITY_LABEL[t]}</span> <b>${counts[t]}</b></span>`);
  if (!pills.length) return "";
  return `<div class="severity-summary">${pills.join("")}</div>`;
}

function consistencySvg(pct) {
  const r = 36, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  const col = pct >= 90 ? "var(--match)" : pct >= 70 ? "var(--warn)" : "var(--miss)";
  return `<svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--line-soft)" stroke-width="7"/>
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="${col}" stroke-width="7"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
      stroke-linecap="round" transform="rotate(-90 42 42)"/>
  </svg>`;
}

function renderFieldCard(row, kind) {
  const hint = rowHint(row, kind);
  const av = row.av || "", bv = row.bv || "";
  const changed = av && bv && !normEq(av, bv);
  const avHtml = changed
    ? `<span class="val-old">${escapeHtml(av)}</span>`
    : (av ? escapeHtml(av) : `<span class="empty">Not found</span>`);
  const bvHtml = changed
    ? `<span class="val-new">${escapeHtml(bv)}</span>`
    : (bv ? escapeHtml(bv) : `<span class="empty">Not found</span>`);
  return `<article class="fcard ${fcardClass(row)}${fcardSevBorder(row)}" data-review="${rowNeedsReview(row)?"1":"0"}" data-match="${row.cls==="match"?"1":"0"}" data-severity="${row.severity||"none"}">
    <div class="fcard-head">
      <span class="fname">${escapeHtml(row.label)}</span>
      <span style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
        ${severityBadge(row)}
        <span class="pill ${row.cls}">${row.status}</span>
      </span>
    </div>
    <div class="fcard-body">
      <div class="fcard-col prior">
        <div class="flbl">Prior filing</div>
        <div class="fval ${av?"":"empty"}">${avHtml}</div>
      </div>
      <div class="fcard-col current">
        <div class="flbl">Current filing</div>
        <div class="fval ${bv?"":"empty"}">${bvHtml}</div>
      </div>
    </div>
    ${hint ? `<div class="fcard-note">${hint}</div>` : ""}
  </article>`;
}

function renderGroupedCards(rows, kind) {
  const groups = {};
  for (const row of rows) {
    const g = kind === "ds160" ? dsGroup(row.label) : "All fields";
    (groups[g] ||= []).push(row);
  }
  const order = kind === "ds160"
    ? [...Object.keys(DS_GROUPS), "Other fields"]
    : ["All fields"];
  return order.filter(g => groups[g]?.length).map(g => `
    <div class="field-group" data-group>
      <div class="field-group-title">${escapeHtml(g)}</div>
      <div class="field-cards">${sortBySeverity(groups[g]).map(r => renderFieldCard(r, kind)).join("")}</div>
    </div>`).join("");
}

function renderError(msg) {
  const r = $("#results");
  r.classList.add("show");
  r.innerHTML = `<div class="alertbar danger"><span>&#9888;</span><span>${escapeHtml(msg)}</span></div>`;
}

function diffHtml(diff) {
  const sym = { same: " ", del: "\u2212", add: "+" };
  return diff.map(d =>
    `<div class="dl ${d.t}"><div class="gut">${sym[d.t]}</div>` +
    `<div class="tx">${escapeHtml(d.x)}</div></div>`).join("");
}

function renderResults(res, a, b, kind, typeMismatch, isDemo) {
  const r = $("#results");
  const kindTag = { passport:"Passport ↔ Passport", ds160:"DS-160 ↔ DS-160",
                    general:"Document ↔ Document" }[kind];

  let html = "";
  if (isDemo || res.demo) {
    html += `<div class="demo-banner no-print"><span>&#9432;</span><span><b>Sample report</b> — fictional DS-160 data to preview the comparison UI. Upload your own Application PDFs for a real comparison; nothing is sent to any server.</span></div>`;
  }

  html += `
    <div class="res-head">
      <h2>Comparison report</h2>
      <span class="doc-kind">${kindTag}</span>
    </div>`;

  const total = res.consistent + res.discrepancies;
  const pct = total ? Math.round((res.consistent / total) * 100) : 100;
  const isFieldCompare = kind === "passport" || kind === "ds160";
  const issueRows = sortBySeverity((res.rows || []).filter(rowNeedsReview));
  const matchRows = (res.rows || []).filter(row => row.cls === "match");
  const criticalCount = issueRows.filter(row => row.severity === "critical").length;

  if (isFieldCompare) {
    let vCls, vIco, vTitle, vSub;
    if (res.discrepancies === 0) {
      vCls = "ok"; vIco = "✓";
      vTitle = "All clear — no issues flagged";
      vSub = `Every compared field ${kind === "passport" ? "that should stay consistent " : ""}matches between your prior and current ${kind === "ds160" ? "DS-160" : "passport"}. Still skim the full text diff below for anything the field parser may have missed.`;
    } else if (criticalCount > 0) {
      vCls = "alert"; vIco = "⚑";
      vTitle = `${criticalCount} critical + ${Math.max(0, res.discrepancies - criticalCount)} other difference${res.discrepancies > 1 ? "s" : ""}`;
      vSub = "Critical items are identity or passport fields that consular officers verify against your documents. Resolve these first, then review remaining changes.";
    } else if (res.discrepancies <= 2) {
      vCls = "warn"; vIco = "!";
      vTitle = `${res.discrepancies} item${res.discrepancies > 1 ? "s" : ""} to review`;
      vSub = "A small number of differences were found. Walk through each one below and confirm the current filing reflects what you intend to tell the consular officer.";
    } else {
      vCls = "alert"; vIco = "⚑";
      vTitle = `${res.discrepancies} differences need your attention`;
      vSub = "Multiple fields don't match between versions. Inconsistencies between a prior DS-160 and a refile are a common interview question — resolve each item before submitting or attending your appointment.";
    }
    html += `<div class="verdict ${vCls}">
      <div class="v-ico">${vIco}</div>
      <div class="v-body">
        <div class="v-title">${vTitle}</div>
        <div class="v-sub">${vSub}</div>
        ${issueRows.length ? `<div class="v-chips">${issueRows.slice(0, 6).map(row =>
          `<span class="v-chip">${escapeHtml(row.label)}</span>`).join("")}${issueRows.length > 6 ? `<span class="v-chip">+${issueRows.length - 6} more</span>` : ""}</div>` : ""}
      </div>
    </div>`;
  } else {
    html += `<div class="verdict ${res.discrepancies ? "warn" : "ok"}">
      <div class="v-ico">${res.discrepancies ? "≈" : "✓"}</div>
      <div class="v-body">
        <div class="v-title">${res.discrepancies ? `${res.discrepancies} line${res.discrepancies > 1 ? "s" : ""} differ` : "Documents appear identical"}</div>
        <div class="v-sub">Line-by-line text comparison of both documents. Use the diff view below to see exactly what changed.</div>
      </div>
    </div>`;
  }

  html += `<div class="summary-v2">
    <div class="summary-stats">
      <div class="stat"><div class="num">${total}</div><div class="cap">${isFieldCompare ? "Fields compared" : "Lines analysed"}</div></div>
      <div class="stat good"><div class="num">${res.consistent}</div><div class="cap">${isFieldCompare ? "Matching" : "Unchanged"}</div></div>
      <div class="stat ${res.discrepancies ? "bad" : ""}"><div class="num">${res.discrepancies}</div><div class="cap">${isFieldCompare ? "To review" : "Different"}</div></div>
    </div>
    ${isFieldCompare ? `<div class="consistency-ring">${consistencySvg(pct)}<div class="pct">${pct}%</div><div class="lbl">Consistent</div></div>` : ""}
  </div>`;

  if (isFieldCompare && issueRows.length)
    html += renderSeveritySummary(issueRows);

  if (typeMismatch) {
    html += `<div class="alertbar note"><span>&#9888;</span><span>These look like <b>different document types</b> (${a.kind.toUpperCase()} vs ${b.kind.toUpperCase()}). Showing a general text comparison — select DS-160 or Passport above if that's incorrect.</span></div>`;
  }

  if (kind === "passport") {
    html += `<div class="block"><h3>MRZ integrity check</h3>
      <div class="desc">ICAO check digits confirm the machine-readable zone was read correctly. A failed check usually means an OCR misread — re-paste the MRZ lines for best accuracy.</div>`;
    for (const [side, p] of [["Prior", res.pa], ["Current", res.pb]]) {
      html += `<div style="margin-bottom:8px"><b style="font-size:.85rem">${side} passport</b><div class="checks">`;
      for (const [name, ok] of Object.entries(p.checks))
        html += `<span class="chk ${ok?"pass":"fail"}">${ok?"\u2713":"\u2717"} ${name}</span>`;
      html += `</div></div>`;
    }
    html += `</div>`;
  }

  if (res.rows && res.rows.length) {
    const title = kind === "passport" ? "Passport fields" : "DS-160 key fields";
    const desc = kind === "passport"
      ? "Side-by-side view of identity and document data. Name and date of birth should match; passport number and expiry typically change on renewal."
      : "Important answers extracted from both DS-160 printouts. Focus on items flagged for review first — the full text diff below catches everything else.";

    if (issueRows.length) {
      html += `<div class="review-list">
        <h4>Quick review checklist — sorted by severity</h4>
        <ul>${issueRows.map(row => `<li class="sev-${row.severity}">${severityBadge(row)} ${escapeHtml(row.label)} — ${escapeHtml(row.status)}</li>`).join("")}</ul>
      </div>`;
    }

    html += `<div class="block"><h3>${title}</h3><div class="desc">${desc}</div>
      <div class="legend" style="margin-top:0;margin-bottom:14px">
        <span><span class="sev sev-critical">Critical</span> identity / passport</span>
        <span><span class="sev sev-high">High</span> biographics / travel docs</span>
        <span><span class="sev sev-medium">Medium</span> contact / dates</span>
        <span><span class="sev sev-low">Low</span> other</span>
      </div>
      <div class="res-toolbar no-print">
        <div class="res-filters" id="resFilters">
          <button type="button" data-filter="review" class="on">Needs review <span class="ct">(${issueRows.length})</span></button>
          <button type="button" data-filter="match">Matches <span class="ct">(${matchRows.length})</span></button>
          <button type="button" data-filter="all">All <span class="ct">(${res.rows.length})</span></button>
        </div>
        <div class="view-toggle">
          <label><input type="checkbox" id="tableViewToggle"> Show table view</label>
        </div>
      </div>
      <div class="field-cards-view" id="cardsView">`;

    if (issueRows.length) {
      html += renderGroupedCards(issueRows, kind);
    } else {
      html += `<p class="empty-note" style="margin-bottom:14px">No differences in detected fields — expand Matches below or check the full text diff.</p>`;
    }

    if (matchRows.length) {
      html += `<details class="match-panel" ${issueRows.length ? "" : "open"}>
        <summary><span class="cnt">${matchRows.length}</span> Consistent fields — click to expand</summary>
        <div class="match-inner">${renderGroupedCards(matchRows, kind)}</div>
      </details>`;
    }

    html += `</div>
      <div class="cmp-table-wrap" id="cmpTableWrap">
        <table class="cmp"><thead><tr>
          <th>Severity</th><th>Field</th><th>Prior filing</th><th>Current filing</th><th>Status</th>
        </tr></thead><tbody>`;
    for (const row of res.rows) {
      const rowCls = row.cls === "miss" ? "row-miss" : (row.cls === "match" ? "row-match" : "");
      html += `<tr class="${rowCls}" data-review="${rowNeedsReview(row)?"1":"0"}" data-match="${row.cls==="match"?"1":"0"}">
        <td class="sev-col">${severityBadge(row) || "—"}</td>
        <td class="field">${escapeHtml(row.label)}</td>
        <td class="val ${row.av?"":"empty"}">${escapeHtml(row.av || "—")}</td>
        <td class="val ${row.bv?"":"empty"}">${escapeHtml(row.bv || "—")}</td>
        <td><span class="pill ${row.cls}">${row.status}</span></td>
      </tr>`;
    }
    html += `</tbody></table></div></div>`;
  } else if (kind === "ds160") {
    html += `<div class="block"><h3>DS-160 key fields</h3>
      <p class="empty-note">No standard DS-160 labels were detected — use the full <i>Application</i> printout PDF (not the one-page confirmation). The full text diff below still shows every line change.</p></div>`;
  }

  const diffTitle = kind === "passport" ? "MRZ line comparison" : "Full text diff";
  const diffDesc = kind === "passport"
    ? "Raw machine-readable zone lines. Red = prior version, green = current."
    : "Every line from both documents. Red lines were removed or changed; green lines were added or changed. This catches fields the summary may miss.";
  html += `<div class="block"><h3>${diffTitle}</h3>
    <div class="desc">${diffDesc}</div>
    <div class="diffctl no-print">
      <label><input type="checkbox" id="hideSame" checked> Show only differences</label>
    </div>
    <div class="diff hidesame" id="diffView">${diffHtml(res.diff)}</div></div>`;

  html += `<div class="actions no-print">
      <button class="btn sm" id="printBtn">Print / Save as PDF</button>
      <button class="btn ghost sm" id="dlBtn">Download report (HTML)</button>
    </div>`;

  r.innerHTML = html;
  r.classList.add("show");

  $("#hideSame").addEventListener("change", e =>
    $("#diffView").classList.toggle("hidesame", e.target.checked));

  const applyFilter = (mode) => {
    $$("#resFilters button").forEach(b => b.classList.toggle("on", b.dataset.filter === mode));
    const show = el => {
      if (mode === "all") return true;
      if (mode === "review") return el.dataset.review === "1";
      return el.dataset.match === "1";
    };
    $$("#cardsView .fcard").forEach(c => { c.style.display = show(c) ? "" : "none"; });
    $$("#cardsView .field-group").forEach(g => {
      const vis = [...g.querySelectorAll(".fcard")].some(c => c.style.display !== "none");
      g.style.display = vis ? "" : "none";
    });
    $$("#cmpTableWrap tr[data-review]").forEach(tr => { tr.style.display = show(tr) ? "" : "none"; });
    const mp = $(".match-panel");
    if (mp) mp.open = mode === "all" || mode === "match";
  };

  const filters = $("#resFilters");
  if (filters) {
    filters.addEventListener("click", e => {
      const b = e.target.closest("button[data-filter]");
      if (b) applyFilter(b.dataset.filter);
    });
    applyFilter(issueRows.length ? "review" : "all");
  }

  const tableToggle = $("#tableViewToggle");
  if (tableToggle) {
    tableToggle.addEventListener("change", e => {
      $("#cmpTableWrap").classList.toggle("show-table", e.target.checked);
    });
  }

  $("#printBtn").addEventListener("click", () => window.print());
  $("#dlBtn").addEventListener("click", () => downloadReport(r));

  r.scrollIntoView({ behavior: "smooth", block: "start" });
}

function downloadReport(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll(".no-print").forEach(n => n.remove());
  clone.querySelectorAll(".diff").forEach(n => n.classList.remove("hidesame"));
  const css = document.querySelector("style").innerHTML;
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const doc = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>VisaDash report ${stamp}</title>
    <link href="https://fonts.googleapis.com/css2?family=Newsreader:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>${css}</style></head>
    <body><div class="wrap"><div style="font-family:'IBM Plex Mono',monospace;font-size:.72rem;color:#8b8a7d;margin-bottom:14px">VISADASH COMPARISON REPORT &middot; GENERATED ${stamp}</div>
    ${clone.innerHTML}</div></body></html>`;
  const blob = new Blob([doc], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `visadash-report-${stamp.replace(/[: ]/g, "-")}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
