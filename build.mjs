#!/usr/bin/env node
// VisaDash static build.
//   node build.mjs                 → multi-page site to repo root (what GitHub Pages serves)
//   node build.mjs --single-file   → also emit visadash-offline.html (all-in-one, file://-safe)
// Plain Node, no framework. Nav/footer/disclaimer live in src/layout.mjs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderPage, SITE, NAV } from "./src/layout.mjs";
import { PAGES } from "./src/pages.mjs";
import { GUIDES } from "./src/content/guides.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SRC = path.join(ROOT, "src");
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

const read = p => fs.readFileSync(p, "utf8");
const styles = read(path.join(SRC, "styles.css"));

// Datasets (Task 4): loaded from data/*.json, validated, injected per page as JSON.
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = { visa_bulletin: "visa_bulletin.json", processing_times: "processing_times.json",
  wage_data: "wage_data.json", employers: "employers.json" };
const dataJsonFor = name => name && DATA_FILE[name]
  ? JSON.stringify(JSON.parse(read(path.join(DATA_DIR, DATA_FILE[name])))) : "";

// ---- resolver: map a "/js/foo.js" (or "/styles.css") ref to inline source for single-file mode
function resolveInline(ref) {
  if (ref === "/styles.css") return styles;
  const p = path.join(SRC, ref.replace(/^\//, ""));
  return read(p);
}

// ---- guide rendering (static; no client JS needed) ----
function guideBlock(g) {
  return `<article class="guide">
  <p>${g.purpose}</p>
  <h3>Key fields to get right</h3>
  <ul>${g.fields.map(f=>`<li>${f}</li>`).join("")}</ul>
  <h3>Common mistakes</h3>
  <ul>${g.mistakes.map(m=>`<li class="warn">${m}</li>`).join("")}</ul>
  <h3>Documents to have ready</h3>
  <ul>${g.docs.map(d=>`<li class="ok">${esc(d)}</li>`).join("")}</ul>
  <div class="tip"><b>Tip.</b> ${g.tip}</div>
  <h3>Frequently asked</h3>
  <div class="faq">${g.faq.map(f=>`<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>
</article>`;
}

function guidesIndexBody() {
  return `
    <div class="freshness"><span class="dot"></span> Educational guidance &middot; always confirm against the official instructions on uscis.gov &amp; travel.state.gov</div>
    <div class="hub-grid" style="margin-top:18px">
${GUIDES.map(g=>`      <a class="hub-card" href="/form-guides/${g.slug}">
        <span class="hub-ico" aria-hidden="true">&#128196;</span>
        <span><span class="hub-title">${esc(g.code)}</span><br><span style="color:var(--ink-faint);font-size:.82rem">${esc(g.name)}</span></span>
      </a>`).join("\n")}
    </div>
    <div id="guides-list" style="margin-top:26px">
${GUIDES.map(g=>`      <details class="acc">
        <summary>
          <span class="form-code">${esc(g.code)}</span>
          <span class="form-name">${esc(g.name)}</span>
          <span class="form-for">${esc(g.who)}</span>
        </summary>
        <div class="body">${guideBlock(g)}
          <p style="margin-top:12px"><a href="/form-guides/${g.slug}">Open the full ${esc(g.code)} guide &rarr;</a></p>
        </div>
      </details>`).join("\n")}
    </div>`;
}

function guideDetailPage(g) {
  const route = `/form-guides/${g.slug}`;
  return {
    route, dir: `form-guides/${g.slug}`,
    title: `${g.code} Guide — ${g.name} | VisaDash`,
    description: `Plain-language guide to the ${g.code} (${g.name}): what it is for, who files it, the fields that trip people up, common mistakes, and the documents to have ready.`,
    ogTitle: `${g.code} — ${g.name}`,
    ogDescription: `What the ${g.code} is for, who files it, and the mistakes to avoid.`,
    hero: esc(g.name),
    jsonld: [{
      "@context":"https://schema.org","@type":"FAQPage",
      mainEntity: g.faq.map(f=>({
        "@type":"Question", name:f.q,
        acceptedAnswer:{ "@type":"Answer", text:f.a }
      }))
    }],
    bodyHtml: `
  <nav class="crumbs"><a href="/form-guides">Form Guides</a> &rsaquo; ${esc(g.code)}</nav>
  <h2 style="margin:0 0 4px">${esc(g.code)} &mdash; ${esc(g.name)}</h2>
  <p class="who" style="color:var(--ink-faint);font-size:.85rem;margin:0 0 14px">Typically filed by: ${esc(g.who)}</p>
${guideBlock(g)}`,
  };
}

// ---- write one multi-page route ----
function writeMulti(page) {
  const html = renderPage(page, { mode: "multi", dataJson: dataJsonFor(page.data) });
  const outDir = path.join(ROOT, page.dir);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html);
  return page.route;
}

function build() {
  const singleFile = process.argv.includes("--single-file");

  // resolve guides-index body now (needs GUIDES)
  const pages = PAGES.map(p => p.isGuidesIndex ? { ...p, bodyHtml: guidesIndexBody() } : p);
  const guidePages = GUIDES.map(guideDetailPage);
  const allPages = [...pages, ...guidePages];

  // 1. copy static assets to root: styles.css + js/
  fs.writeFileSync(path.join(ROOT, "styles.css"), styles);
  const jsOut = path.join(ROOT, "js");
  fs.mkdirSync(jsOut, { recursive: true });
  for (const f of fs.readdirSync(path.join(SRC, "js"))) {
    fs.copyFileSync(path.join(SRC, "js", f), path.join(jsOut, f));
  }
  // engine (pure ESM module, loaded on compare/verify as <script type="module">)
  const engOut = path.join(ROOT, "engine");
  fs.mkdirSync(engOut, { recursive: true });
  for (const f of fs.readdirSync(path.join(SRC, "engine"))) {
    fs.copyFileSync(path.join(SRC, "engine", f), path.join(engOut, f));
  }

  // 2. render every route
  const routes = allPages.map(writeMulti);

  // 3. sitemap.xml + robots.txt
  const today = new Date().toISOString().slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map(r=>`  <url><loc>${SITE.origin}${r === "/" ? "/" : r}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap);
  fs.writeFileSync(path.join(ROOT, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${SITE.origin}/sitemap.xml\n`);

  // 4. single-file offline build (all tools, one document)
  if (singleFile) buildSingleFile(pages);

  console.log(`Built ${routes.length} routes${singleFile ? " + visadash-offline.html" : ""}:`);
  routes.forEach(r => console.log("  " + r));
}

// ---- single-file offline toolkit: all tools in one tabbed page, everything inlined ----
function buildSingleFile(pages) {
  const byRoute = Object.fromEntries(pages.map(p => [p.route, p]));
  // tab order + which script(s) each pulls in
  const TABS = [
    { id:"compare",    route:"/ds-160-compare",   label:"DS-160 Compare",   ico:"&#128196;" },
    { id:"verify",     route:"/ds-160-verify",    label:"DS-160 Verify",    ico:"&#9989;" },
    { id:"guides",     route:"/form-guides",      label:"Form Guides",      ico:"&#128221;" },
    { id:"bulletin",   route:"/visa-bulletin",    label:"Visa Bulletin",    ico:"&#128197;" },
    { id:"processing", route:"/processing-times", label:"Processing Times", ico:"&#9203;" },
    { id:"wages",      route:"/prevailing-wage",  label:"Prevailing Wage",  ico:"&#128176;" },
    { id:"sponsors",   route:"/h1b-sponsors",     label:"H-1B Sponsors",    ico:"&#127970;" },
  ];
  const guidesBody = guidesIndexBody();
  const TAB_DATA = { bulletin: "visa_bulletin", processing: "processing_times", wages: "wage_data", sponsors: "employers" };
  const sections = TABS.map((t, i) => {
    const body = t.id === "guides" ? guidesBody : byRoute[t.route].bodyHtml;
    const dj = TAB_DATA[t.id] ? dataJsonFor(TAB_DATA[t.id]) : "";
    const dataScript = dj ? `\n  <script type="application/json" id="vd-data-${TAB_DATA[t.id]}">${dj}</script>` : "";
    return `  <section class="tab${i===0?" active":""}" id="tab-${t.id}">\n${body}${dataScript}\n  </section>`;
  }).join("\n");

  // Inline the ESM engines as globals for the offline file (module imports can't
  // resolve from file://). Strip `export ` + the audit's internal import.
  const engineSrc = read(path.join(SRC, "engine", "doctypes.mjs")).replace(/^export\s+/gm, "");
  const auditSrc = read(path.join(SRC, "engine", "audit.mjs"))
    .replace(/^import[^\n]*\n/m, "")
    .replace(/^export\s+/gm, "");
  const engineGlobal = `(function(){\n${engineSrc}\n${auditSrc}\n`
    + `window.VDEngine={detectType,compareVersions,compareCross,parseMRZ,toISO,norm,grabLabel,mkField,compareValues,TYPE_BY_ID,DOC_TYPES};\n`
    + `window.VDAudit={runAudit,nameOutcome,parseVisaFoil,parseI94,fieldsFromPaste,RULES};\n})();`;

  const scriptFiles = ["vddata","comparator","audit","bulletin","processing","wages","sponsors"];
  const inlineJs = engineGlobal + "\n;\n" + scriptFiles.map(f => resolveInline(`/js/${f}.js`)).join("\n;\n");
  const promoJs = resolveInline("/js/promo.js");

  const navBtns = TABS.map((t,i)=>`    <button type="button" data-tab="${t.id}"${i===0?' class="on"':''}>
      <span class="nav-ico" aria-hidden="true">${t.ico}</span><span>${t.label}</span>
    </button>`).join("\n");

  const router = `
(function(){
  var TABS=${JSON.stringify(TABS.map(t=>t.id))};
  function show(name){
    if(TABS.indexOf(name)<0) name=TABS[0];
    document.querySelectorAll('#tabnav button').forEach(function(b){b.classList.toggle('on',b.dataset.tab===name);});
    document.querySelectorAll('.tab').forEach(function(s){s.classList.toggle('active',s.id==='tab-'+name);});
    window.scrollTo({top:0,behavior:'smooth'});
  }
  document.getElementById('tabnav').addEventListener('click',function(e){
    var b=e.target.closest('button[data-tab]'); if(b) show(b.dataset.tab);
  });
})();`;

  const doc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VisaDash — Offline Immigration Toolkit</title>
<meta name="description" content="The full VisaDash immigration toolkit in a single offline file. 100% on-device — nothing is uploaded.">
<meta name="theme-color" content="#1f3b54">
<meta name="color-scheme" content="light">
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/4.1.1/tesseract.min.js"></script>
<style>
${styles}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand"><a href="#" id="homeLink" title="VisaDash"><h1>${SITE.name}</h1><div class="sub">Immigration Toolkit &middot; offline</div></a></div>
  </header>
  <nav class="nav-main no-print" id="tabnav" aria-label="Toolkit sections">
    <span class="nav-label" aria-hidden="true">Toolkit</span>
${navBtns}
  </nav>
  <div class="page">
  <section class="hero no-print"><p class="hero-lede">The complete VisaDash toolkit, running from a single file with no internet.</p></section>
  <div class="content">
${sections}
  </div>
  </div>
  <footer class="site-footer"><b>VisaDash is not legal advice.</b> Free educational toolkit — everything runs in your browser; nothing is uploaded. Snapshots — confirm against official sources.</footer>
</div>
<script>
${inlineJs}
</script>
<script>
${promoJs}
</script>
<script>${router}</script>
</body>
</html>`;
  fs.writeFileSync(path.join(ROOT, "visadash-offline.html"), doc);
}

build();
