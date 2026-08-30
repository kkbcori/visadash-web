# VisaDash — visadash.org

Free, **fully on-device** immigration toolkit. Static site, deployed via **GitHub Pages**
(`CNAME` → visadash.org, `_headers`, `404.html`, `robots.txt`). No backend, no uploads —
everything runs in the visitor's browser. Privacy promise is core to the brand; keep it.

## Architecture — templated multi-page build (Task 1, 2026-08)
**Changed from the old single `index.html` monolith to a Node build.** Source lives in `src/`;
the build **writes the served files into the repo root** (GitHub Pages serves root), so the
built `index.html` + route folders + `js/` + `styles.css` + `sitemap.xml` **are committed**.

- **`build.mjs`** (plain Node ESM, no framework): `node build.mjs` → multi-page;
  `node build.mjs --single-file` (= `npm run build`) also emits **`visadash-offline.html`**,
  the whole toolkit inlined into one `file://`-openable document (the offline-download promise).
- **`src/layout.mjs`** — the shared shell (head/meta, nav rail, footer, promo rail) in one place;
  `renderPage()` handles both multi and single modes.
- **`src/pages.mjs`** — per-route content + metadata (title/description/canonical/OG/JSON-LD).
- **`src/content/guides.mjs`** — form-guide data; the build renders the guides index **and**
  `/form-guides/{slug}` detail pages **statically** (FAQPage JSON-LD), no client JS.
- **`src/js/*.js`** — one lazy script per tool (`comparator.js` verbatim from the old file;
  `bulletin/processing/wages/sponsors/audit.js` split out of the old hub IIFE; shared
  `nav.js` = active-link highlight, `promo.js` = slider, `hashredirect.js` = old `#hash`→route).
  **Each tool page loads only its own script** — `/visa-bulletin` no longer ships the OCR engine.
- **`src/_reference/legacy-index.html`** — the old monolith, kept for reference only (not served).

**Rebuild after editing anything in `src/`:** `npm run build`, then commit the regenerated root
files. Don't hand-edit the root `index.html`/route folders — they're build output.

### Routes
`/` hub · `/ds-160-compare` · `/ds-160-audit` (engine lands in Task 3) · `/form-guides` +
`/form-guides/{ds-160,i-129,i-140,i-485,i-130,n-400}` · `/visa-bulletin` · `/processing-times`
· `/prevailing-wage` · `/h1b-sponsors`. (Old `/#wages` etc. redirect via `hashredirect.js`.)

Tools: **compare** = DS-160/passport comparator (verbatim, pdf.js+tesseract, MRZ check digits).
**bulletin** = `VB_MONTHS`/`BULLETIN` EB dates + "Am I current?". **processing** = `PROCESSING`
by form×center. **wages** = `WAGES` prevailing-wage + offer check. **sponsors** = `EMPLOYERS`
H-1B grades (sortable). **audit** = single-doc cross-check (scaffold now, engine Task 3).

## Document-type engine (Task 2, 2026-08)
`src/engine/doctypes.mjs` — **pure ESM, no DOM/OCR/network**, runs in the browser (loaded on
compare/audit as `<script type="module">` → `window.VDEngine`) and under `node --test`
(`test/doctypes.test.mjs`, synthetic fixtures only). It's a declarative `DocumentType` registry:
each type has `detect(text)`, `extract({text,lines})→{fields}`, a `fieldSchema` (key, normalizer,
`same|differ|either` semantics, severity) and data-driven flag `rules`. Every extracted field is
`{value, confidence, source:{line,snippet}}`; a mismatch between two <0.5-confidence reads is
`unreadable`, never a hard discrepancy.

Six types: `ds160`, `passport` (MRZ check digits drive confidence), `i797` (classification-change
+ validity-gap flags), `i20` (loud SEVIS-ID-change flag), `ead` (category-code flag), and the
cross-type `lca`↔`offer` (wage-below-LCA = blocker, worksite/dates checks). `detectType` scores
all and flags ambiguity; mixed types with no defined comparison are refused, not diffed.

**UI wiring:** `comparator.js` routes the **four new types + LCA↔offer** through the engine via
`engineCompare()`/`renderEngineResult()` (confidence badges + hover-for-source). **DS-160/passport
still use the original rich renderer** — the engine implements+tests them too, but the UI switch
is deferred to avoid regressing the Task-1 results UI. `npm run build` inlines the engine as a
global into `visadash-offline.html` (module imports can't resolve from `file://`).

## DS-160 audit (Task 3, 2026-08)
`src/engine/audit.mjs` — pure, tested (`test/audit.test.mjs`, 13 tests). `runAudit(docs,{now})`
validates ONE DS-160 against supporting docs via a data-driven `RULES` array
(`{id,severity,requires,evaluate(ctx)}`). Severities **blocker / warning / info** only; it
**never** implies the form is ready ("N blockers, M warnings — review each…"). Name matching
reports exact / normalized / mismatch as distinct outcomes; passport-number O/0 & I/1 confusions
are called out; **two <0.5-confidence reads downgrade to info, never a blocker**. Rules cover
DS-160 ↔ passport / I-797 / I-20 / I-94 and DS-160 internal consistency; skipped rules (missing
doc) are reported. `src/js/audit.js` is the real UI: on-device pdf.js→tesseract extraction,
builds typed docs via `window.VDEngine`, runs `window.VDAudit`, renders findings by severity
with source snippets + a client-side "download report". Audit page head (`AUDIT_HEAD` in
pages.mjs) imports both engines as modules; build inlines both into `visadash-offline.html`.

## Updating the data (snapshots, still embedded in the tool JS)
Data remains **hard-coded as consts inside each tool's `src/js/*.js`** (keeps single-file/offline
promise), with `*_FETCHED`/`*_SOURCE` freshness strings. To refresh: edit the const + the
snapshot string in the relevant `src/js/*.js`, then `npm run build`. These are **periodic
snapshots**, not live — the footer says so; keep that disclaimer. (Task 4 will move these into
versioned `data/*.json` with a schema + a CI refresh; not done yet.)

## Verify a change (no test suite)
Rebuild, then headless-Chrome screenshots of the built **routes** (not hashes):
```
npm run build
python3 -m http.server 8731 &
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for r in "" ds-160-compare/ form-guides/ visa-bulletin/ processing-times/ prevailing-wage/ h1b-sponsors/; do
  n=$(echo "$r" | tr -d /); n=${n:-hub}
  "$CHROME" --headless --disable-gpu --virtual-time-budget=3000 \
    --window-size=1180,1500 --screenshot=/tmp/$n.png "http://localhost:8731/$r"; done
```
Also open `visadash-offline.html` from `file://` to confirm the single-file build works.
JS sanity: `npm run check` (`node --check` over `src/js/*.js`).

## Main menu (2026-08)
The toolkit menu is a **left-side vertical rail**, not the old horizontal tab bar. **`.wrap`
itself is the grid** (`216px | minmax(0,1fr)`, `align-items:start`): `<header>` spans both
columns (`grid-column:1/-1`) as a full-width bar; the `#tabnav` `.nav-main` rail is column 1;
`.page` (hero + `.content` tabs + footer) is column 2. `.nav-main` is `position:sticky; top:18px`,
vertical, with a "Toolkit" `.nav-label`. **Below 760px `.wrap` collapses to one column** — nav
becomes a sticky (`top:0`) horizontal scroll bar in the old underlined-tab look, stacking
brand → nav → content. Same buttons throughout, so routing JS (`button[data-tab]`) is untouched.
`.page`/`.content` carry `min-width:0` so the wide sponsor table can't blow out the grid.

## KKB CoRi promo rail (2026-08)
Right-hand **third column** advertising sibling apps: an auto-rotating one-by-one slider
(`#promoRail` / `#promoTrack`, 6 slides — StatusVault, PassportSnap, Proteus, StowBuddy,
Shadowline, Steady Tools; each = icon + name + short desc + CTA). It's a grid child of `.wrap`;
the footer was pulled out of `.page` to become a full-width `grid-column:1/-1` row so the rail
sits beside content and the footer spans under all columns. **Shown only at `min-width:1121px`**
(where `.wrap` widens to 1300px + a 3rd `248px` column); hidden below that, so the 2-col rail /
mobile layouts are unchanged. Slider is a **separate trailing `<script>`** (don't fold into the
comparator/hub scripts): CSS transform track, builds dots, 4.2s interval, pauses on hover/focus
and when the tab is hidden. Images are **local** (`promo/*.png`, logos downscaled with `sips` to
~130px, ~128KB total) — deliberately not hot-linked from kkbcori.com, to keep the "nothing leaves
your browser" promise. To add/remove an app: edit the `.promo-slide` list (dots auto-generate).

## Gotchas
- **zsh** here does **not** word-split unquoted `$vars` — use explicit lists in shell loops.
- The comparator's exported report still self-labels "Casefile" / `casefile-report-*.html`
  (internal to the export). Left as-is; rebrand only if asked.
- Brand is **VisaDash** (site) ; "DS-160 Comparison Tool" is the first tab's label.
- **Comparison results UI (2026-08):** issue-first card layout with verdict hero, consistency ring, filter tabs (Needs review / Matches / All), DS-160 field grouping, collapsible matches panel, optional table view, **severity tiers** (Critical / High / Medium / Low), **sample report** button + `#demo` hash. Export filenames use `visadash-report-*`. Single **nav-main** toolbar (icons + short hints) — no duplicate card grid.
