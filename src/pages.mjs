// Per-route content + metadata. Form-guide detail pages are generated in build.mjs
// from src/content/guides.mjs; everything else is declared here.
import { SITE, NAV } from "./layout.mjs";

const OCR_LIBS = `<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/4.1.1/tesseract.min.js"></script>`;
const OCR_HEAD = `${OCR_LIBS}
<script type="module">import * as E from "/engine/doctypes.mjs"; window.VDEngine = E; window.dispatchEvent(new Event("vdengine-ready"));</script>`;

const softwareApp = (name, desc, url) => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name, description: desc,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  isAccessibleForFree: true,
  provider: { "@type": "Organization", name: "KKB CoRi", url: "https://www.kkbcori.com" },
});

const slot = (tag, title, when) => `      <div class="slot">
        <div class="slot-head">
          <span class="slot-tag">${tag}</span>
          <h3>${title}</h3>
          <span class="when">${when}</span>
        </div>
        <div class="slot-body" data-slot="${tag}">
          <div class="drop" tabindex="0">
            <div class="ico">&#128228;</div>
            <p>Drop files here, or click to browse</p>
            <div class="hint">PDF, JPG or PNG &middot; multiple files allowed</div>
          </div>
          <input type="file" multiple accept=".pdf,image/*">
          <div class="filelist"></div>
        </div>
      </div>`;

export const PAGES = [
  /* ─────────────── Hub ─────────────── */
  {
    route: "/", dir: "",
    title: "VisaDash — On-Device Immigration Toolkit: DS-160, Visa Bulletin, Processing Times & Wages",
    description: "A free, 100% on-device immigration toolkit: compare two DS-160 versions, follow form-filling guides, track the Visa Bulletin & priority dates, check USCIS processing times, and look up prevailing wages & H-1B sponsors. Nothing is uploaded.",
    ogTitle: "VisaDash — Free On-Device Immigration Toolkit",
    ogDescription: "DS-160 compare, form guides, Visa Bulletin, processing times, prevailing wages & H-1B sponsors. 100% on-device — nothing is uploaded.",
    hero: "Compare DS-160 versions, track priority dates, and check processing times &mdash; entirely in your browser.",
    jsonld: [{
      "@context": "https://schema.org", "@type": "WebSite",
      name: SITE.name, url: SITE.origin + "/",
      description: "Free on-device U.S. immigration toolkit.",
    }, softwareApp("VisaDash", "Free on-device U.S. immigration toolkit.", SITE.origin + "/")],
    scripts: ["/js/hashredirect.js"],
    bodyHtml: `
  <div class="privacy no-print" style="margin-top:0">
    <span>&#128274;</span>
    <span><b>Nothing leaves this machine.</b> Every tool below runs entirely in your browser &mdash; no file is uploaded, no document text is sent anywhere, and nothing is stored on a server. You can even <a href="/visadash-offline.html" download>download the whole toolkit as a single offline file</a> and run it with no internet.</span>
  </div>

  <div class="hub-grid">
${NAV.map(n=>`    <a class="hub-card" href="${n.path}">
      <span class="hub-ico" aria-hidden="true">${n.ico}</span>
      <span class="hub-title">${n.label}</span>
    </a>`).join("\n")}
  </div>

  <div class="tool-notes no-print" style="margin-top:26px">
    <b>What VisaDash is &mdash; and isn't.</b><br>
    &bull; It is a free educational toolkit to help you <i>spot</i> issues before they reach a consular officer or adjudicator.<br>
    &bull; It is <b>not legal advice</b> and is not affiliated with USCIS, the Department of State, or the Department of Labor.<br>
    &bull; Every output is something for a human to verify against the official instructions on <i>uscis.gov</i> and <i>travel.state.gov</i>.
  </div>`,
  },

  /* ─────────────── DS-160 / passport compare ─────────────── */
  {
    route: "/ds-160-compare", dir: "ds-160-compare",
    title: "DS-160 Compare — On-Device A/B Document Diff | VisaDash",
    description: "Compare two versions of a DS-160 side by side and get a field-by-field report of every difference before it reaches a consular officer. Runs entirely in your browser — nothing is uploaded.",
    ogTitle: "DS-160 Compare — On-Device Document Diff",
    ogDescription: "Field-by-field A/B comparison of DS-160 printouts, entirely on-device.",
    hero: "Upload two versions of the same DS-160 and get a clear, field-by-field report of every difference.",
    headExtra: OCR_HEAD,
    scripts: ["/js/comparator.js"],
    jsonld: [softwareApp("DS-160 Compare", "On-device A/B comparison of DS-160 printouts.", SITE.origin + "/ds-160-compare")],
    bodyHtml: `
  <div class="compare-trust no-print">
    <div class="stamp"><span class="lock">&#128274;</span>On-device<br>processing</div>
  </div>

  <p class="intro">Upload two versions of the same DS-160 &mdash; a prior filing against a refile &mdash; and get a clear, field-by-field report of every difference before it reaches a consular officer.</p>

  <div class="privacy no-print">
    <span>&#128274;</span>
    <span><b>Nothing leaves this machine.</b> All text extraction, OCR and comparison run inside your browser. No file is uploaded to any server. Keep this HTML file locally and you can run it fully offline (the OCR engine downloads once on first use, then caches).</span>
  </div>

  <div class="compare-steps no-print" aria-hidden="true">
    <span class="on">1 · Prior version</span>
    <span class="on">2 · Current version</span>
    <span>3 · Review report</span>
  </div>
  <div class="modebar no-print">
    <span class="lbl">Comparison&nbsp;type</span>
    <div class="seg" id="modeSeg">
      <button data-m="auto" class="on">Auto-detect</button>
      <button data-m="ds160">DS-160</button>
      <button data-m="general">Other docs</button>
    </div>
  </div>

  <div class="slots no-print">
${slot("A", "Earlier version", "prior filing")}

${slot("B", "Later version", "current filing")}
  </div>

  <div class="actions no-print">
    <button class="btn" id="runBtn">Compare documents</button>
    <button class="btn ghost sm" id="demoBtn">View sample report</button>
    <button class="btn ghost sm" id="resetBtn">Clear all</button>
  </div>

  <div id="log" class="no-print"></div>

  <section id="results"></section>

  <div class="tool-notes no-print">
    <b>How to get the cleanest results.</b><br>
    &bull; <b>DS-160:</b> use the full <i>Application</i> printout (the multi-page PDF from the review screen), not the one-page confirmation &mdash; only the full printout carries every answer.<br>
    &bull; <b>Born-digital PDFs</b> (with a real text layer) compare instantly; scanned PDFs and photos are run through OCR, which takes a few seconds per page.
  </div>`,
  },

  /* ─────────────── Form guides index ─────────────── */
  {
    route: "/form-guides", dir: "form-guides",
    title: "U.S. Immigration Form Guides — DS-160, I-129, I-140, I-485, I-130, N-400 | VisaDash",
    description: "Field-by-field help for the U.S. immigration forms that come up most — what each form is for, who files it, the answers that trip people up, and the documents to have ready before you start.",
    ogTitle: "U.S. Immigration Form Guides",
    ogDescription: "Plain-language, field-by-field guides for DS-160, I-129, I-140, I-485, I-130 and N-400.",
    hero: "Field-by-field help for the U.S. immigration forms that come up most.",
    // bodyHtml injected by build.mjs (static guide list)
    isGuidesIndex: true,
  },

  /* ─────────────── Visa Bulletin ─────────────── */
  {
    route: "/visa-bulletin", dir: "visa-bulletin", data: "visa_bulletin",
    title: "Visa Bulletin Tracker & Priority Date Checker — Employment-Based | VisaDash",
    description: "Employment-based Final Action Dates from the latest Visa Bulletin, a 3-month comparison showing what advanced or retrogressed, and an 'am I current?' priority-date checker. On-device.",
    ogTitle: "Visa Bulletin Tracker & Priority Date Checker",
    ogDescription: "Latest EB Final Action Dates, 3-month movement, and an 'am I current?' checker.",
    hero: "Employment-based Final Action Dates, three-month movement, and a quick priority-date check.",
    scripts: ["/js/vddata.js", "/js/bulletin.js"],
    jsonld: [softwareApp("Visa Bulletin Tracker", "Employment-based Visa Bulletin tracker and priority-date checker.", SITE.origin + "/visa-bulletin")],
    bodyHtml: `
    <div class="freshness" id="bulletin-fresh"><span class="dot"></span> Loading latest bulletin…</div>

    <h3 class="secTitle">Final Action Dates &mdash; Employment-Based (latest)</h3>
    <p class="secSub">&ldquo;C&rdquo; means current (no backlog). A date means only priority dates <i>earlier</i> than it can receive a visa number. <b>U</b> = unavailable this month.</p>
    <div class="tbl-wrap"><table class="dt vb-current" id="vb-table"></table></div>

    <h3 class="secTitle">3-month comparison</h3>
    <p class="secSub">Final Action Dates for June, July, and August 2026 side by side &mdash; green cells advanced, red cells retrogressed or became unavailable.</p>
    <div class="tbl-wrap"><table class="dt vb-compare" id="vb-compare" aria-label="Three month visa bulletin comparison"></table></div>
    <div id="vb-movement"></div>

    <h3 class="secTitle">Am I current?</h3>
    <p class="secSub">Enter your category, country of chargeability and priority date to see if a green-card number is available this month.</p>
    <div class="ctrls">
      <div class="ctrl">
        <label for="vb-cat">Category</label>
        <select id="vb-cat"><option>EB1</option><option selected>EB2</option><option>EB3</option></select>
      </div>
      <div class="ctrl">
        <label for="vb-country">Country of chargeability</label>
        <select id="vb-country"><option>All</option><option selected>India</option><option>China</option><option>Mexico</option><option>Philippines</option></select>
      </div>
      <div class="ctrl">
        <label for="vb-pd">Priority date</label>
        <input type="date" id="vb-pd" value="2014-06-01">
      </div>
    </div>
    <div id="vb-result"></div>`,
  },

  /* ─────────────── Processing times ─────────────── */
  {
    route: "/processing-times", dir: "processing-times", data: "processing_times",
    title: "USCIS Processing Times — Median, 75th & 90th Percentile by Form & Center | VisaDash",
    description: "Typical USCIS processing times by form and service center — median plus the 75th and 90th percentile so you can see the long tail, not just the average. Estimate your wait on-device.",
    ogTitle: "USCIS Processing Times by Form & Service Center",
    ogDescription: "Median, 75th and 90th-percentile USCIS processing times, with a wait estimator.",
    hero: "Typical USCIS processing times by form and service center &mdash; median, plus the long tail.",
    scripts: ["/js/vddata.js", "/js/processing.js"],
    jsonld: [softwareApp("USCIS Processing Time Lookup", "USCIS processing-time percentiles by form and service center.", SITE.origin + "/processing-times")],
    bodyHtml: `
    <div class="freshness" id="pt-fresh"><span class="dot"></span> Loading snapshot…</div>

    <h3 class="secTitle">Estimate my wait</h3>
    <p class="secSub">Pick a form and the service center on your receipt notice (the three-letter prefix on your receipt number).</p>
    <div class="ctrls">
      <div class="ctrl">
        <label for="pt-form">Form</label>
        <select id="pt-form"></select>
      </div>
      <div class="ctrl">
        <label for="pt-center">Service center</label>
        <select id="pt-center"></select>
      </div>
    </div>
    <div id="pt-result"></div>

    <h3 class="secTitle">All processing times</h3>
    <div class="tbl-wrap"><table class="dt" id="pt-table"></table></div>`,
  },

  /* ─────────────── Prevailing wage ─────────────── */
  {
    route: "/prevailing-wage", dir: "prevailing-wage", data: "wage_data",
    title: "Prevailing Wage Check — DOL Wage Levels for H-1B & PERM | VisaDash",
    description: "Look up the DOL prevailing wage for an occupation, state and wage level, then compare it to a salary offer to see whether an LCA at that level would be certifiable. On-device.",
    ogTitle: "Prevailing Wage Check for H-1B & PERM",
    ogDescription: "DOL prevailing-wage lookup by SOC, state and level, with an offer comparison.",
    hero: "Is the offered salary at or above the DOL prevailing wage for that occupation, area and level?",
    scripts: ["/js/vddata.js", "/js/wages.js"],
    jsonld: [softwareApp("Prevailing Wage Check", "DOL prevailing-wage lookup and offer comparison for H-1B and PERM.", SITE.origin + "/prevailing-wage")],
    bodyHtml: `
    <div class="freshness" id="wg-fresh"><span class="dot"></span> Loading snapshot…</div>

    <h3 class="secTitle">Prevailing-wage check</h3>
    <p class="secSub">Look up the DOL prevailing wage for an occupation, state and wage level, then compare it to a salary offer.</p>
    <div class="ctrls">
      <div class="ctrl">
        <label for="wg-soc">Occupation (SOC)</label>
        <select id="wg-soc"></select>
      </div>
      <div class="ctrl">
        <label for="wg-state">Worksite state</label>
        <select id="wg-state"></select>
      </div>
      <div class="ctrl">
        <label for="wg-level">Wage level</label>
        <select id="wg-level"><option>I</option><option selected>II</option><option>III</option><option>IV</option></select>
      </div>
      <div class="ctrl">
        <label for="wg-offer">Offered salary (optional)</label>
        <input type="number" id="wg-offer" placeholder="e.g. 120000" min="0" step="1000">
      </div>
    </div>
    <div id="wg-result"></div>`,
  },

  /* ─────────────── H-1B sponsors ─────────────── */
  {
    route: "/h1b-sponsors", dir: "h1b-sponsors", data: "employers",
    title: "H-1B Sponsor Grades — Top Sponsors, Approval Rates & Risk Flags | VisaDash",
    description: "Top H-1B sponsors by petition volume, with approval rate, H-1B-dependent flags, and a risk grade. Sortable and filterable, entirely on-device.",
    ogTitle: "H-1B Sponsor Grades & Approval Rates",
    ogDescription: "Top H-1B sponsors by volume with approval rates and risk flags, sortable on-device.",
    hero: "Top H-1B sponsors by petition volume, with approval rate and risk flags.",
    scripts: ["/js/vddata.js", "/js/sponsors.js"],
    jsonld: [softwareApp("H-1B Sponsor Grades", "H-1B sponsor grades, approval rates and risk flags.", SITE.origin + "/h1b-sponsors")],
    bodyHtml: `
    <div class="freshness" id="emp-fresh"><span class="dot"></span> Loading snapshot…</div>

    <h3 class="secTitle">H-1B sponsor grades</h3>
    <p class="secSub">Top sponsors by petition volume, with approval rate and risk flags. Click a column to sort.</p>
    <div class="ctrls">
      <div class="ctrl">
        <label for="emp-search">Filter employer</label>
        <input type="text" id="emp-search" placeholder="Type a company name…">
      </div>
    </div>
    <div class="tbl-wrap"><table class="dt" id="emp-table"></table></div>
    <div class="legend">
      <span><span class="grade A" style="min-width:auto">A</span> 92%+ approvals</span>
      <span><span class="grade B" style="min-width:auto">B</span> 84–92%</span>
      <span><span class="grade C" style="min-width:auto">C</span> &lt;84%</span>
      <span><span class="tag warn">Dependent</span> H-1B-dependent employer (extra attestations)</span>
    </div>`,
  },
];
