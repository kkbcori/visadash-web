# VisaDash — visadash.org

Free, **fully on-device** immigration toolkit. Static site, deployed via **GitHub Pages**
(`CNAME` → visadash.org, `_headers`, `404.html`, `robots.txt`). No backend, no build step,
no uploads — everything runs in the visitor's browser. Privacy promise is core to the brand;
keep it.

## Architecture — single file
The **entire app is `index.html`** (~1500 lines). One `<style>`, two `<script>` blocks:

1. **Comparator script** (first `<script>`) — the original "Casefile" DS-160 / passport /
   document comparator. Uses pdf.js + tesseract.js (CDN). **Do not refactor it casually**; it
   binds to its DOM by id/class at load. Its markup lives inside `<section id="tab-compare">`.
2. **Hub script** (second `<script>`, marked `VisaDash hub: tabs + data tools`) — tab routing
   + the four data tabs. Self-contained IIFE.

### Tabs
Top `<nav class="tabs" id="tabnav">` with `data-tab` buttons → `<section class="tab" id="tab-*">`
panels. Routing: hash (`#guides` etc.) + `localStorage("vd_tab")`, default `compare`.
Tab keys: `compare, guides, bulletin, processing, wages`.

- **compare** — DS-160 comparison tool (preserved verbatim).
- **guides** — `GUIDES[]` array of form-filling guides (DS-160, I-129, I-140, I-485, I-130,
  N-400) rendered as `<details>` accordions. Pure static content.
- **bulletin** — `VB_MONTHS` / `BULLETIN` (EB1/2/3 final action dates for last 3 months + comparison table) + "Am I current?"
  date check.
- **processing** — `PROCESSING` (USCIS times by form×center) + estimate callout.
- **wages** — `WAGES` (DOL prevailing wage) + offer check, and `EMPLOYERS` (H-1B sponsor
  grades, sortable/filterable).

## Updating the data (snapshots, embedded inline)
Data is **hard-coded as JS consts inside the hub script** — keeps the single-file/offline
promise. Source JSON originally came from the old VisaDash pipeline (`old_files.zip` →
`visadash-public/data/*.json`: visa_bulletin, processing_times, wage_data, employers; refresh
script `fetch_visa_bulletin.py`). To refresh figures, edit the `BULLETIN / PROCESSING / WAGES /
EMPLOYERS` consts and the `*_FETCHED` / freshness strings. These are **periodic snapshots**, not
live — the footer says so; keep that disclaimer.

## Verify a change (no test suite)
Headless Chrome screenshots — this is the quick smoke test:
```
python3 -m http.server 8731 &
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for t in compare guides bulletin processing wages; do
  "$CHROME" --headless --disable-gpu --virtual-time-budget=2500 \
    --window-size=1180,1500 --screenshot=/tmp/$t.png "http://localhost:8731/#$t"; done
```
JS sanity: extract the hub `<script>` and `node --check`.

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
