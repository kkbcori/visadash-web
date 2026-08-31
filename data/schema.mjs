// VisaDash dataset schema + sanity checks. Pure ESM — used by scripts/validate_data.mjs
// (CI + local) and scripts/refresh_data.mjs (before it ever commits refreshed data).
// A silently-broken parser shipping wrong dates is far worse than stale data, so these
// checks are deliberately strict and refuse implausible values.

const isISO = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const isCutoff = s => s === "C" || s === "U" || isISO(s);
const CATS = ["EB1", "EB2", "EB3"];
const COUNTRIES = ["All", "China", "India", "Mexico", "Philippines"];

function base(obj, name, errors) {
  if (!obj || typeof obj !== "object") { errors.push("not an object"); return false; }
  if (obj.dataset !== name) errors.push(`dataset should be "${name}", got "${obj.dataset}"`);
  if (typeof obj.schema_version !== "number") errors.push("missing numeric schema_version");
  if (!isISO(obj.fetched_at)) errors.push("fetched_at must be YYYY-MM-DD");
  if (!obj.source || typeof obj.source !== "string") errors.push("missing source");
  return true;
}

const rankCutoff = v => v === "U" ? -Infinity : v === "C" ? Infinity : Date.parse(v + "T00:00:00");

const VALIDATORS = {
  visa_bulletin(obj, errors) {
    if (!base(obj, "visa_bulletin", errors)) return;
    if (!Array.isArray(obj.months) || obj.months.length < 1) { errors.push("months[] required"); return; }
    for (const m of obj.months) {
      if (!m.label) errors.push("month missing label");
      for (const cat of CATS) {
        if (!m.eb?.[cat]) { errors.push(`${m.label}: missing ${cat}`); continue; }
        for (const c of COUNTRIES)
          if (!isCutoff(m.eb[cat][c])) errors.push(`${m.label} ${cat}/${c}: bad cutoff "${m.eb[cat][c]}"`);
      }
    }
    // sanity: a cutoff shouldn't retrogress by more than ~5 years month-over-month
    for (let i = 1; i < obj.months.length; i++) {
      for (const cat of CATS) for (const c of COUNTRIES) {
        const prev = obj.months[i - 1].eb?.[cat]?.[c], cur = obj.months[i].eb?.[cat]?.[c];
        if (!isISO(prev) || !isISO(cur)) continue;
        const backYears = (rankCutoff(prev) - rankCutoff(cur)) / (365.25 * 86400000);
        if (backYears > 5) errors.push(`${cat}/${c}: implausible ${backYears.toFixed(1)}yr retrogression ${prev}→${cur}`);
      }
    }
  },

  processing_times(obj, errors) {
    if (!base(obj, "processing_times", errors)) return;
    const p = obj.processing;
    if (!p || !Object.keys(p).length) { errors.push("processing{} required"); return; }
    for (const [k, r] of Object.entries(p)) {
      for (const f of ["median_months", "p75_months", "p90_months"])
        if (typeof r[f] !== "number" || r[f] < 0 || r[f] > 120) errors.push(`${k}.${f} out of range: ${r[f]}`);
      if (!(r.median_months <= r.p75_months && r.p75_months <= r.p90_months))
        errors.push(`${k}: percentiles not ordered (median≤p75≤p90)`);
      if (typeof r.recent_approvals !== "number" || r.recent_approvals < 0) errors.push(`${k}.recent_approvals invalid`);
    }
  },

  wage_data(obj, errors) {
    if (!base(obj, "wage_data", errors)) return;
    if (!Array.isArray(obj.wages) || !obj.wages.length) { errors.push("wages[] required"); return; }
    for (const w of obj.wages) {
      if (!/^\d{2}-\d{4}$/.test(w.soc || "")) errors.push(`bad SOC "${w.soc}"`);
      if (!["I", "II", "III", "IV"].includes(w.level)) errors.push(`bad level "${w.level}"`);
      if (typeof w.wage !== "number" || w.wage < 15000 || w.wage > 1000000) errors.push(`wage out of range: ${w.wage} (${w.soc}/${w.state}/${w.level})`);
    }
  },

  employers(obj, errors) {
    if (!base(obj, "employers", errors)) return;
    if (!Array.isArray(obj.employers) || !obj.employers.length) { errors.push("employers[] required"); return; }
    for (const e of obj.employers) {
      if (!e.name) errors.push("employer missing name");
      if (typeof e.rate !== "number" || e.rate < 0 || e.rate > 100) errors.push(`${e.name}: rate out of range ${e.rate}`);
      if (typeof e.total !== "number" || e.total < 0) errors.push(`${e.name}: total invalid`);
      if (!/^[A-C][+-]?$/.test(e.grade || "")) errors.push(`${e.name}: bad grade "${e.grade}"`);
    }
  },
};

export function validateDataset(name, obj) {
  const errors = [];
  const v = VALIDATORS[name];
  if (!v) return { ok: false, errors: [`no validator for dataset "${name}"`] };
  v(obj, errors);
  return { ok: errors.length === 0, errors };
}

export const DATASETS = [
  { name: "visa_bulletin", file: "visa_bulletin.json" },
  { name: "processing_times", file: "processing_times.json" },
  { name: "wage_data", file: "wage_data.json" },
  { name: "employers", file: "employers.json" },
];

export const STALE_DAYS = 45;
export function daysSince(fetched_at, now = Date.now()) {
  return Math.floor((now - Date.parse(fetched_at + "T00:00:00")) / 86400000);
}
