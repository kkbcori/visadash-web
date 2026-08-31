// VisaDash shared layout — navigation, footer, disclaimer and <head> live here once.
// renderPage() emits a complete HTML document for one route, in either
// "multi" mode (links CSS/JS as separate cached files) or "single" mode
// (everything inlined into one file:// -openable document).

export const SITE = {
  origin: "https://visadash.org",
  name: "VisaDash",
  tagline: "Immigration Toolkit",
};

// Order here is the order shown in the toolkit rail.
export const NAV = [
  { path: "/ds-160-compare",   ico: "&#128196;", label: "DS-160 Compare" },
  { path: "/ds-160-audit",     ico: "&#129534;", label: "DS-160 Audit" },
  { path: "/form-guides",      ico: "&#128221;", label: "Form Guides" },
  { path: "/visa-bulletin",    ico: "&#128197;", label: "Visa Bulletin" },
  { path: "/processing-times", ico: "&#9203;",   label: "Processing Times" },
  { path: "/prevailing-wage",  ico: "&#128176;", label: "Prevailing Wage" },
  { path: "/h1b-sponsors",     ico: "&#127970;", label: "H-1B Sponsors" },
];

export const PROMO_APPS = [
  { href:"https://statusvault.org", img:"statusvault.png", name:"StatusVault", desc:"Track visa &amp; immigration document expiry with smart alerts." },
  { href:"https://www.kkbcori.com/passportsnap/", img:"passportsnap.png", name:"PassportSnap", desc:"AI passport &amp; visa photos that pass &mdash; in 2 minutes." },
  { href:"https://www.kkbcori.com/proteus/", img:"proteus.png", name:"Proteus", desc:"Every unit, one app &mdash; conversions, 165+ currencies &amp; AI." },
  { href:"https://www.kkbcori.com/stowbuddy/", img:"stowbuddy.png", name:"StowBuddy", desc:"Snap a photo; on-device AI files every item in your home." },
  { href:"https://www.kkbcori.com/shadowline/", img:"shadowline.png", name:"Shadowline", desc:"Every city on one 24-hour dial. World clocks &amp; meeting planner." },
  { href:"https://www.kkbcori.com/steadytools/", img:"steadytools.png", name:"Steady Tools", desc:"Calm, focused tools for ADHD &amp; neurodivergent minds." },
];

const promoRail = () => `  <aside class="promo-rail" id="promoRail" aria-label="More apps from KKB CoRi">
    <div class="promo-head">More from KKB CoRi</div>
    <div class="promo-viewport">
      <div class="promo-track" id="promoTrack">
${PROMO_APPS.map(a=>`        <a class="promo-slide" href="${a.href}" target="_blank" rel="noopener">
          <div class="promo-img"><img src="/promo/${a.img}" alt="${a.name} app icon" width="88" height="88" loading="lazy"></div>
          <div class="promo-name">${a.name}</div>
          <div class="promo-desc">${a.desc}</div>
          <span class="promo-cta">Get the app &rarr;</span>
        </a>`).join("\n")}
      </div>
    </div>
    <div class="promo-dots" id="promoDots" role="tablist" aria-label="Choose app"></div>
  </aside>`;

const footer = () => `  <footer class="site-footer">
    <b>VisaDash is not legal advice and is not affiliated with USCIS, the Department of State, or the Department of Labor.</b>
    It is a free educational toolkit &mdash; the comparison tools, guides, and lookups help you spot issues and understand the process, for a human to verify.
    Everything runs in your browser: no file is uploaded, nothing is stored on a server (the OCR engine downloads once, then caches locally for offline use).
    Bulletin, processing-time, wage and sponsor figures are periodic snapshots &mdash; always confirm against the official sources before you rely on them.
  </footer>`;

const nav = (route) => `  <nav class="nav-main no-print" id="tabnav" aria-label="Toolkit sections">
    <span class="nav-label" aria-hidden="true">Toolkit</span>
${NAV.map(n=>`    <a href="${n.path}" data-path="${n.path}"${n.path===route?' class="on" aria-current="page"':''}>
      <span class="nav-ico" aria-hidden="true">${n.ico}</span>
      <span>${n.label}</span>
    </a>`).join("\n")}
  </nav>`;

const header = () => `  <header>
    <div class="brand">
      <a href="/" id="homeLink" title="VisaDash home">
        <h1>${SITE.name}</h1>
        <div class="sub">${SITE.tagline}</div>
      </a>
    </div>
  </header>`;

function head(page, mode, styles) {
  const url = SITE.origin + (page.route === "/" ? "/" : page.route);
  const ogTitle = page.ogTitle || page.title;
  const ogDesc  = page.ogDescription || page.description;
  const styleTag = mode === "single"
    ? `<style>\n${styles}\n</style>`
    : `<link rel="stylesheet" href="/styles.css">`;
  const jsonld = (page.jsonld || [])
    .map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${page.title}</title>
<meta name="description" content="${page.description}">
<meta name="theme-color" content="#1f3b54">
<meta name="color-scheme" content="light">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:title" content="${ogTitle}">
<meta property="og:description" content="${ogDesc}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${ogTitle}">
<meta name="twitter:description" content="${ogDesc}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
${(page.headExtra || "").trim()}
${styleTag}
${jsonld}
</head>`;
}

// scripts: array of {src} for multi mode or {inline} for single mode.
// In single mode caller passes resolved inline code; in multi mode caller passes src paths.
function scriptTags(page, mode, resolve) {
  const shared = ["/js/nav.js", ...(page.scripts || []), "/js/promo.js"];
  return shared.map(src => {
    if (mode === "single") return `<script>\n${resolve(src)}\n</script>`;
    return `<script defer src="${src}"></script>`;
  }).join("\n");
}

export function renderPage(page, { mode = "multi", styles = "", resolve = () => "", dataJson = "" } = {}) {
  const dataScript = dataJson
    ? `\n  <script type="application/json" id="vd-data">${dataJson}</script>` : "";
  return `${head(page, mode, styles)}
<body>
<div class="wrap">

${header()}

${nav(page.route)}

  <div class="page">

${page.hero ? `  <section class="hero no-print" aria-label="Introduction">
    <p class="hero-lede">${page.hero}</p>
  </section>\n` : ""}
  <div class="content">
${page.bodyHtml}${dataScript}
  </div><!-- /.content -->
  </div><!-- /.page -->

${promoRail()}

${footer()}

</div>
${scriptTags(page, mode, resolve)}
</body>
</html>`;
}
