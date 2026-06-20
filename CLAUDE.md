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
- **bulletin** — `BULLETIN` (EB1/2/3 final action dates + movement) + an "Am I current?"
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

## Gotchas
- **zsh** here does **not** word-split unquoted `$vars` — use explicit lists in shell loops.
- The comparator's exported report still self-labels "Casefile" / `casefile-report-*.html`
  (internal to the export). Left as-is; rebrand only if asked.
- Brand is **VisaDash** (site) ; "DS-160 Comparison Tool" is the first tab's label.
