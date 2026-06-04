# Casefile — Immigration Document Comparator

A single-page web app for immigration practitioners that compares two versions
of a document — an earlier DS-160 against a refile, an expiring passport
against a renewal, or any supporting paperwork — and surfaces every
discrepancy before it reaches a consular officer.

**Everything runs in the browser.** No file is ever uploaded. There is no
server, no database, and no analytics. The only network requests are for the
PDF/OCR libraries and web fonts, which load once and then cache.

## What it does

- **DS-160 ↔ DS-160** — extracts text from both printout PDFs, detects key
  identity/passport fields, and produces a full line-by-line diff.
- **Passport ↔ Passport** — parses the Machine-Readable Zone (ICAO 9303 TD3),
  validates it with check digits, and flags identity fields that should match
  but don't. Accepts a passport photo (OCR) or pasted MRZ lines.
- **Other documents** (visa foils, I-797, etc.) — general text comparison.
- Auto-detects document type; exports a printable report.

## Tech

Plain HTML, CSS, and JavaScript in one file (`index.html`). No build step, no
framework. Libraries (`pdf.js`, `tesseract.js`) load from CDN at runtime.
Keeping it framework-free makes the whole app auditable and trivial to host.

## Run locally

Just open `index.html` in a browser. For OCR features, serve it over HTTP so
web workers behave consistently:

```bash
# Python
python3 -m http.server 8000
# or Node
npx serve .
```

Then visit `http://localhost:8000`.

## Repository structure

```
casefile/
├── index.html      # the app
├── favicon.svg     # site icon
├── 404.html        # not-found page
├── robots.txt      # crawler directives
├── CNAME           # custom domain for GitHub Pages — EDIT THIS
├── _headers        # security headers (Cloudflare Pages / Netlify only)
├── .gitignore
├── LICENSE
└── README.md
```

## Deploy — GitHub Pages

1. Push this repository to GitHub.
2. In the repo: **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**, branch `main`, folder
   `/ (root)`, then **Save**.
4. The site goes live at `https://<username>.github.io/<repo>/` within a
   minute or two.

### Custom domain

1. Edit the `CNAME` file so it contains only your domain (e.g.
   `casefile.example.com` or `example.com`) and commit it. Or type the domain
   into **Settings → Pages → Custom domain**, which writes the file for you.
2. At your DNS provider, add records:

   **Subdomain** (e.g. `app.example.com`) — one CNAME record:
   ```
   app   CNAME   <username>.github.io
   ```

   **Apex/root** (e.g. `example.com`) — four A records:
   ```
   @   A   185.199.108.153
   @   A   185.199.109.153
   @   A   185.199.110.153
   @   A   185.199.111.153
   ```
   (Optionally add AAAA records for IPv6: `2606:50c0:8000::153` through
   `2606:50c0:8003::153`. Always confirm the current values against the
   [GitHub Pages docs](https://docs.github.com/pages) — IPs can change.)

3. DNS can take up to 24 hours to propagate. Once it resolves, return to
   **Settings → Pages** and tick **Enforce HTTPS**.
4. Replace `YOUR-DOMAIN` in `index.html` (the `canonical` and `og:url` tags)
   with your live domain and commit.

## Deploy — Cloudflare Pages or Netlify (alternative)

Both connect directly to the GitHub repo, deploy on every push, and — unlike
GitHub Pages — honor the `_headers` file. Build command: none. Output
directory: `/` (root). Use one of these if you want the security headers and
Content-Security-Policy applied.

## Security headers

`_headers` ships with safe, non-breaking headers active. It also contains a
commented-out **Content-Security-Policy**. Because the app pulls `pdf.js` and
`tesseract.js` (including WebAssembly) from CDNs, a too-strict CSP will break
OCR. Enable the CSP only after testing OCR on your host, or after vendoring
the libraries locally (below). GitHub Pages ignores `_headers` entirely.

## Optional: vendor the libraries (fully self-hosted)

To remove the runtime CDN dependency — useful for offline use or a strict CSP —
download `pdf.js`, `pdf.worker.js`, and `tesseract.js` (plus its core WASM and
the `eng` traineddata) into a local `vendor/` folder and update the `<script>`
tags and Tesseract `workerPath`/`corePath`/`langPath` in `index.html`.

## Disclaimer

Casefile is a review aid, not legal advice and not a filing tool. It does not
transmit, store, or submit anything. DS-160 field detection is heuristic — the
full text diff is the authoritative output. Always verify findings against the
source documents.

## License

MIT — see `LICENSE`.
