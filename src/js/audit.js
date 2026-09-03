"use strict";
/* VisaDash — DS-160 verification UI.
   Separate cards for each source (upload a doc OR paste details). Extracts on-device
   via pdf.js → tesseract, consolidates via VDEngine + VDAudit, shows verified matches
   and issues. Nothing is uploaded. */
(function () {
  var root = document.getElementById("audit-app");
  if (!root) return;

  /* Card definitions: upload and/or paste fields */
  var CARDS = [
    {
      key: "ds160", tag: "1", title: "DS-160 printout", when: "required", required: true,
      hint: "Full Application PDF from CEAC (not the one-page confirmation)",
      upload: true, paste: false
    },
    {
      key: "passport", tag: "2", title: "Passport", when: "recommended",
      hint: "Photo page scan, or paste the two MRZ lines",
      upload: true, mrz: true,
      fields: [
        { id: "surname", label: "Surname" },
        { id: "given", label: "Given names" },
        { id: "docNumber", label: "Passport number" },
        { id: "dob", label: "Date of birth", ph: "01-JAN-1990" },
        { id: "sex", label: "Sex", ph: "M / F" },
        { id: "expiry", label: "Expiration", ph: "01-JAN-2030" }
      ]
    },
    {
      key: "personal", tag: "3", title: "Personal details", when: "optional",
      hint: "Paste what you entered (or intended to enter) on the DS-160",
      upload: false,
      fields: [
        { id: "surname", label: "Surname" },
        { id: "given", label: "Given names" },
        { id: "dob", label: "Date of birth", ph: "01-JAN-1990" },
        { id: "sex", label: "Sex", ph: "Male / Female" },
        { id: "nationality", label: "Nationality" },
        { id: "countryOfBirth", label: "Country of birth" },
        { id: "nationalId", label: "National ID number" }
      ]
    },
    {
      key: "address", tag: "4", title: "Addresses & contact", when: "optional",
      hint: "Home address and contact info from your records",
      upload: false,
      fields: [
        { id: "homeAddress", label: "Street address" },
        { id: "homeCity", label: "City" },
        { id: "homeState", label: "State / province" },
        { id: "homePostal", label: "Postal / ZIP" },
        { id: "homeCountry", label: "Country" },
        { id: "homePhone", label: "Primary phone" },
        { id: "email", label: "Email" }
      ]
    },
    {
      key: "priorVisa", tag: "5", title: "Visa copy", when: "optional",
      hint: "Prior U.S. visa foil photo or PDF",
      upload: true,
      fields: [
        { id: "foilNumber", label: "Visa / control number" },
        { id: "visaClass", label: "Visa class", ph: "H1B, B1/B2…" },
        { id: "issueDate", label: "Issue date" },
        { id: "expiration", label: "Expiration" }
      ]
    },
    {
      key: "i797", tag: "6", title: "I-797 notice", when: "optional",
      hint: "Approval / receipt notice (petitioned visas)",
      upload: true
    },
    {
      key: "i20", tag: "7", title: "I-20 / DS-2019", when: "optional",
      hint: "Student or exchange-visitor certificate",
      upload: true
    },
    {
      key: "i94", tag: "8", title: "I-94 history", when: "optional",
      hint: "Travel history export, or paste arrival/departure lines",
      upload: true,
      pasteArea: true
    }
  ];

  var files = {};
  var state = { ready: false };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function fieldHtml(card) {
    if (!card.fields || !card.fields.length) return "";
    return '<div class="verify-fields" data-fields="' + card.key + '">'
      + card.fields.map(function (f) {
        return '<label class="vf"><span>' + esc(f.label) + '</span>'
          + '<input type="text" data-fk="' + card.key + '" data-fid="' + f.id + '"'
          + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : "") + ' autocomplete="off" spellcheck="false"></label>';
      }).join("")
      + "</div>";
  }

  function cardHtml(card) {
    var pasteToggle = (card.fields || card.mrz || card.pasteArea)
      ? '<button type="button" class="paste-tog" data-tog="' + card.key + '">or paste details</button>'
      : "";
    var uploadBlock = card.upload
      ? '<div class="drop" tabindex="0" role="button" data-k="' + card.key + '">'
        + '<div class="ico">&#128228;</div><p>Drop file, or click to browse</p>'
        + '<div class="hint">' + esc(card.hint) + "</div></div>"
        + '<input type="file" accept=".pdf,image/*,.txt" data-k="' + card.key + '" hidden>'
        + '<div class="filelist" data-list="' + card.key + '"></div>'
      : '<p class="verify-hint">' + esc(card.hint) + "</p>";
    var pasteBlock = '<div class="paste-panel" data-paste="' + card.key + '" hidden>'
      + (card.mrz
        ? '<label class="vf full"><span>Passport MRZ (two lines)</span>'
          + '<textarea class="mrz" data-mrz="1" spellcheck="false" rows="2"'
          + ' placeholder="P&lt;UTOERIKSSON&lt;&lt;ANNA&lt;MARIA&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&#10;L898902C36UTO7408122F1204159ZE184226B&lt;&lt;&lt;&lt;&lt;10"></textarea></label>'
        : "")
      + (card.pasteArea
        ? '<label class="vf full"><span>Paste I-94 travel lines</span>'
          + '<textarea data-i94="1" rows="4" spellcheck="false"'
          + ' placeholder="Arrival 2023-05-01 Departure 2023-05-20&#10;Entry 2024-02-10 2024-03-01"></textarea></label>'
        : "")
      + fieldHtml(card)
      + "</div>";
    return '<div class="slot verify-card" data-card="' + card.key + '">'
      + '<div class="slot-head"><span class="slot-tag">' + card.tag + "</span>"
      + "<h3>" + esc(card.title) + "</h3>"
      + '<span class="when">' + esc(card.when) + "</span></div>"
      + '<div class="slot-body">'
      + uploadBlock + pasteToggle + pasteBlock
      + "</div></div>";
  }

  root.innerHTML =
    '<div class="compare-steps no-print" aria-hidden="true">'
    + '<span class="on">1 · Add sources</span><span class="on">2 · DS-160 file</span><span>3 · Verified report</span></div>'
    + '<div class="slots no-print audit-slots">'
    + CARDS.map(cardHtml).join("")
    + "</div>"
    + '<div class="actions no-print" style="margin-top:14px">'
    + '<button class="btn" id="auditRun">Verify against DS-160</button>'
    + '<button class="btn ghost sm" id="auditDemo">View sample report</button>'
    + '<button class="btn ghost sm" id="auditReset">Clear all</button></div>'
    + '<div id="audit-log" class="no-print audit-log"></div>'
    + '<section id="audit-results"></section>';

  function log(m, cls) {
    var box = document.getElementById("audit-log");
    box.classList.add("show");
    var ln = document.createElement("div");
    ln.className = "ln" + (cls ? " " + cls : "");
    ln.textContent = m;
    box.appendChild(ln);
    box.scrollTop = box.scrollHeight;
  }
  function clearLog() {
    var box = document.getElementById("audit-log");
    box.innerHTML = "";
    box.classList.remove("show");
  }

  function showFile(key) {
    var list = root.querySelector('[data-list="' + key + '"]');
    if (!list) return;
    var f = files[key];
    list.innerHTML = f
      ? '<div class="fileitem"><span>&#128196; ' + esc(f.name) + '</span>'
        + '<span class="x" data-rm="' + key + '" title="Remove">&times;</span></div>'
      : "";
  }

  /* wire upload zones */
  root.querySelectorAll(".drop").forEach(function (drop) {
    var key = drop.dataset.k;
    var input = root.querySelector('input[type=file][data-k="' + key + '"]');
    if (!input) return;
    drop.addEventListener("click", function () { input.click(); });
    drop.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
    });
    ["dragover", "dragenter"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); });
    });
    drop.addEventListener("drop", function (e) {
      if (e.dataTransfer.files[0]) { files[key] = e.dataTransfer.files[0]; showFile(key); }
    });
    input.addEventListener("change", function () {
      files[key] = input.files[0] || null; showFile(key); input.value = "";
    });
  });

  root.addEventListener("click", function (e) {
    var rm = e.target.closest("[data-rm]");
    if (rm) { files[rm.dataset.rm] = null; showFile(rm.dataset.rm); return; }
    var tog = e.target.closest("[data-tog]");
    if (tog) {
      var panel = root.querySelector('[data-paste="' + tog.dataset.tog + '"]');
      if (!panel) return;
      var open = panel.hasAttribute("hidden");
      if (open) panel.removeAttribute("hidden"); else panel.setAttribute("hidden", "");
      tog.textContent = open ? "hide paste fields" : "or paste details";
      tog.classList.toggle("on", open);
    }
  });

  document.getElementById("auditReset").addEventListener("click", function () { location.reload(); });
  document.getElementById("auditRun").addEventListener("click", run);
  document.getElementById("auditDemo").addEventListener("click", showDemo);

  function waitEngine() {
    return new Promise(function (resolve) {
      if (window.VDEngine && window.VDAudit) return resolve();
      window.addEventListener("vdengine-ready", function () { resolve(); }, { once: true });
      setTimeout(resolve, 2500);
    });
  }

  function readPasteFields(key) {
    var out = {};
    root.querySelectorAll('input[data-fk="' + key + '"]').forEach(function (inp) {
      var v = inp.value.trim();
      if (v) out[inp.dataset.fid] = v;
    });
    return out;
  }

  /* ---- on-device extraction ---- */
  function itemsToLines(items) {
    var lines = items.filter(function (it) { return it.str.trim().length; })
      .map(function (it) { return { s: it.str, x: it.transform[4], y: it.transform[5] }; })
      .sort(function (a, b) { return (b.y - a.y) || (a.x - b.x); });
    var out = [], cur = [], lastY = null;
    lines.forEach(function (i) {
      if (lastY === null || Math.abs(i.y - lastY) < 4) { cur.push(i); }
      else { out.push(cur); cur = [i]; }
      lastY = i.y;
    });
    if (cur.length) out.push(cur);
    return out.map(function (ln) {
      return ln.sort(function (a, b) { return a.x - b.x; }).map(function (i) { return i.s; }).join(" ").replace(/\s+/g, " ").trim();
    });
  }

  async function readAny(file) {
    var isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    var isImg = /^image\//.test(file.type) || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(file.name);
    if (isPdf) {
      if (!window.pdfjsLib) throw new Error("PDF engine failed to load — check your connection and reload.");
      var buf = await file.arrayBuffer();
      var pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
      var lines = [], raw = 0;
      for (var p = 1; p <= pdf.numPages; p++) {
        var page = await pdf.getPage(p), tc = await page.getTextContent();
        raw += tc.items.reduce(function (s, it) { return s + it.str.length; }, 0);
        lines = lines.concat(itemsToLines(tc.items));
      }
      if (raw < 30 * pdf.numPages) {
        if (!window.Tesseract) throw new Error("OCR engine failed to load — check your connection and reload.");
        var otext = "";
        var MAX = 2600;
        for (var q = 1; q <= Math.min(pdf.numPages, 8); q++) {
          var pg = await pdf.getPage(q);
          var base = pg.getViewport({ scale: 1 });
          var scale = Math.min(2, MAX / Math.max(base.width, base.height));
          var vp = pg.getViewport({ scale: Math.max(1, scale) });
          var cv = document.createElement("canvas");
          cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
          await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
          var r = await window.Tesseract.recognize(cv, "eng");
          otext += "\n" + (r && r.data ? r.data.text : "");
          cv.width = cv.height = 0;
        }
        lines = otext.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
        return { text: otext, lines: lines };
      }
      return { text: lines.join("\n"), lines: lines };
    }
    if (isImg) {
      if (!window.Tesseract) throw new Error("OCR engine failed to load — check your connection and reload.");
      var res = await window.Tesseract.recognize(file, "eng");
      var t = res.data.text;
      return { text: t, lines: t.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean) };
    }
    var txt = await file.text();
    return { text: txt, lines: txt.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean) };
  }

  function mergePassport(base, pasted) {
    var fields = Object.assign({}, (base && base.fields) || {});
    Object.keys(pasted).forEach(function (k) {
      fields[k] = window.VDAudit ? window.VDEngine.mkField(pasted[k], 1.0, { snippet: "pasted: " + pasted[k] })
        : { value: pasted[k], confidence: 1, source: null };
    });
    return { fields: fields, mrz: base && base.mrz };
  }

  async function run() {
    clearLog();
    await waitEngine();
    var E = window.VDEngine, A = window.VDAudit;
    if (!E || !A) { log("Engine not loaded — check your connection and reload.", "err"); return; }
    if (!files.ds160) { log("A DS-160 Application printout is required (card 1).", "err"); return; }

    var btn = document.getElementById("auditRun");
    btn.disabled = true; btn.textContent = "Verifying…";
    try {
      var docs = {};
      log("Reading DS-160 on-device…");
      var ds = await readAny(files.ds160);
      docs.ds160 = E.TYPE_BY_ID.ds160.extract({ text: ds.text, lines: ds.lines });
      var extracted = Object.keys(docs.ds160.fields || {}).filter(function (k) {
        return docs.ds160.fields[k] && docs.ds160.fields[k].value;
      }).length;
      log("  extracted " + extracted + " DS-160 fields", "ok");

      /* Passport: MRZ paste > upload OCR > manual fields */
      var mrzBox = root.querySelector("textarea[data-mrz]");
      var mrzText = mrzBox ? mrzBox.value.trim() : "";
      var passPaste = readPasteFields("passport");
      var passport = null;
      if (mrzText) {
        var pm = E.parseMRZ(mrzText.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean), mrzText);
        if (pm) { passport = { fields: pm.fields, mrz: { checks: pm.checks } }; log("Passport from pasted MRZ", "ok"); }
        else log("Could not parse pasted MRZ — check the two lines.", "err");
      } else if (files.passport) {
        log("Reading passport on-device…");
        var pp = await readAny(files.passport);
        var pm2 = E.parseMRZ(pp.lines, pp.text);
        if (pm2) passport = { fields: pm2.fields, mrz: { checks: pm2.checks } };
        else {
          /* OCR passport without clear MRZ — use pasted fields if any, else label grab */
          passport = { fields: {
            surname: E.grabLabel(pp.lines, ["Surname", "Last Name"]),
            given: E.grabLabel(pp.lines, ["Given Names", "Given Name", "First Name"]),
            docNumber: E.grabLabel(pp.lines, ["Passport No", "Passport Number", "Document No"]),
            dob: E.grabLabel(pp.lines, ["Date of Birth", "Birth Date"]),
            sex: E.grabLabel(pp.lines, ["Sex", "Gender"]),
            expiry: E.grabLabel(pp.lines, ["Date of Expiry", "Expiry", "Expiration"])
          } };
        }
      }
      if (Object.keys(passPaste).length) {
        passport = mergePassport(passport, passPaste);
        log("Merged pasted passport fields", "ok");
      }
      if (passport && Object.keys(passport.fields).some(function (k) { return passport.fields[k] && passport.fields[k].value; }))
        docs.passport = passport;

      /* Personal + address pastes */
      var personal = readPasteFields("personal");
      if (Object.keys(personal).length) {
        docs.personal = A.fieldsFromPaste(personal, "personal");
        log("Personal details: " + Object.keys(personal).length + " fields", "ok");
      }
      var address = readPasteFields("address");
      if (Object.keys(address).length) {
        docs.address = A.fieldsFromPaste(address, "address");
        log("Address details: " + Object.keys(address).length + " fields", "ok");
      }

      /* Prior visa */
      var visaPaste = readPasteFields("priorVisa");
      if (files.priorVisa) {
        log("Reading visa foil…");
        var pv = await readAny(files.priorVisa);
        docs.priorVisa = A.parseVisaFoil(pv.lines);
      }
      if (Object.keys(visaPaste).length) {
        var vf = A.fieldsFromPaste(visaPaste, "visa");
        if (docs.priorVisa) Object.assign(docs.priorVisa.fields, vf.fields);
        else docs.priorVisa = vf;
      }

      if (files.i797) {
        log("Reading I-797…");
        var n = await readAny(files.i797);
        docs.i797 = E.TYPE_BY_ID.i797.extract({ text: n.text, lines: n.lines });
      }
      if (files.i20) {
        log("Reading I-20 / DS-2019…");
        var g = await readAny(files.i20);
        docs.i20 = E.TYPE_BY_ID.i20.extract({ text: g.text, lines: g.lines });
      }
      var i94ta = root.querySelector("textarea[data-i94]");
      var i94text = i94ta ? i94ta.value.trim() : "";
      if (files.i94) {
        log("Reading I-94…");
        var w = await readAny(files.i94);
        i94text = (i94text ? i94text + "\n" : "") + w.text;
      }
      if (i94text) docs.i94 = A.parseI94(i94text);

      var sources = Object.keys(docs).filter(function (k) { return k !== "ds160"; });
      if (!sources.length) {
        log("Add at least one supporting source (passport, personal details, address, visa, etc.).", "err");
        return;
      }

      log("Running " + A.RULES.length + " checks across " + sources.length + " source(s)…");
      var report = A.runAudit(docs);
      render(report, docs, sources);
      log("Done — nothing was uploaded.", "ok");
    } catch (err) {
      log("Error: " + (err && err.message ? err.message : err), "err");
    } finally {
      btn.disabled = false; btn.textContent = "Verify against DS-160";
    }
  }

  var SEV = {
    blocker: { cls: "sev-crit", label: "Blocker", box: "danger" },
    warning: { cls: "sev-high", label: "Warning", box: "note" },
    info: { cls: "sev-info", label: "Info", box: "note" }
  };

  function valueTable(f) {
    if (!(f.ds160Value || f.docValue)) return "";
    return '<div class="sub"><table class="dt verify-vals"><tbody>'
      + '<tr><td>DS-160</td><td>' + esc(f.ds160Value || "—")
      + (f.ds160Source ? ' <span class="conf conf-mid" title="' + esc(f.ds160Source.snippet || "") + '">src</span>' : "")
      + "</td></tr>"
      + '<tr><td>Source</td><td>' + esc(f.docValue || "—")
      + (f.docSource ? ' <span class="conf conf-mid" title="' + esc(f.docSource.snippet || "") + '">src</span>' : "")
      + "</td></tr></tbody></table></div>";
  }

  function render(report, docs, sources) {
    var order = ["blocker", "warning", "info"];
    var issues = order.map(function (sev) {
      var items = report.findings.filter(function (f) { return f.severity === sev; });
      if (!items.length) return "";
      return '<div class="verify-group">'
        + '<h3 class="secTitle">' + SEV[sev].label + "s · " + items.length + "</h3>"
        + items.map(function (f) {
          var sv = SEV[f.severity];
          return '<div class="callout ' + sv.box + '"><div class="lbl">'
            + '<span class="eng-chip ' + sv.cls + '">' + sv.label + "</span> " + esc(f.category) + "</div>"
            + '<div class="sub">' + esc(f.message)
            + (f.lowConfidence ? " <i>(low-confidence extraction)</i>" : "") + "</div>"
            + valueTable(f) + "</div>";
        }).join("")
        + "</div>";
    }).join("");

    var matchBlock = "";
    if (report.matches && report.matches.length) {
      matchBlock = '<details class="cmp-collapse verify-matches" open>'
        + "<summary>" + report.matches.length + " verified match"
        + (report.matches.length === 1 ? "" : "es") + "</summary>"
        + '<div class="verify-match-list">'
        + report.matches.map(function (m) {
          return '<div class="callout safe"><div class="lbl"><span class="eng-chip sev-ok">Verified</span> '
            + esc(m.category) + '</div><div class="sub">' + esc(m.message) + "</div>"
            + valueTable(m) + "</div>";
        }).join("")
        + "</div></details>";
    }

    var skipped = report.skipped.length
      ? '<details class="cmp-collapse"><summary>' + report.skipped.length
        + " checks skipped (source not provided)</summary>"
        + '<div class="tool-notes" style="margin:0">'
        + report.skipped.map(function (s) {
          return "&bull; " + esc(s.id) + " — needs " + esc(s.missing.join(", "));
        }).join("<br>") + "</div></details>"
      : "";

    var srcLine = sources.map(function (s) { return esc(s); }).join(", ");
    var el = document.getElementById("audit-results");
    var vcls = report.counts.blocker ? "verdict-bad" : report.counts.warning ? "verdict-warn" : "verdict-ok";
    el.innerHTML =
      '<div class="verdict ' + vcls + '">'
      + '<div class="v-title">Verification report</div>'
      + '<div class="v-sub">' + esc(report.summary) + "</div>"
      + '<div class="v-chips">'
      + '<span class="v-chip">' + report.counts.match + " verified</span>"
      + '<span class="v-chip">' + report.counts.blocker + " blockers</span>"
      + '<span class="v-chip">' + report.counts.warning + " warnings</span>"
      + '<span class="v-chip">' + report.counts.info + " info</span>"
      + "</div>"
      + '<div class="v-sub" style="margin-top:8px">Sources checked: ' + srcLine + "</div></div>"
      + (issues || '<div class="callout safe"><div class="sub">No mismatches fired on the sources you provided. This does not mean the DS-160 is ready to submit — review every field against your originals.</div></div>')
      + matchBlock
      + skipped
      + '<div class="actions no-print" style="margin-top:12px">'
      + '<button class="btn ghost sm" id="auditDownload">Download report</button>'
      + '<button class="btn ghost sm" id="auditPrint">Print / Save as PDF</button></div>'
      + '<div class="tool-notes">Not legal advice. VisaDash never says a DS-160 is ready to submit. Verify every finding against your original documents and the CEAC form.</div>';
    el.classList.add("show");
    document.getElementById("auditDownload").addEventListener("click", function () { downloadReport(report, sources); });
    document.getElementById("auditPrint").addEventListener("click", function () { printReport(report, sources); });
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function reportDoc(report, sources) {
    var rows = report.findings.map(function (f) {
      return "<tr><td>" + esc(f.severity.toUpperCase()) + "</td><td>" + esc(f.category)
        + "</td><td>" + esc(f.message) + "</td><td>" + esc(f.ds160Value || "")
        + "</td><td>" + esc(f.docValue || "") + "</td></tr>";
    }).join("");
    var matchRows = (report.matches || []).map(function (m) {
      return "<tr><td>VERIFIED</td><td>" + esc(m.category) + "</td><td>" + esc(m.message)
        + "</td><td>" + esc(m.ds160Value || "") + "</td><td>" + esc(m.docValue || "") + "</td></tr>";
    }).join("");
    return "<!doctype html><meta charset=utf-8><title>VisaDash DS-160 verification</title>"
      + "<body style='font-family:system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px'>"
      + "<h2>VisaDash — DS-160 verification report</h2>"
      + "<p>" + esc(report.summary) + "</p>"
      + "<p style='color:#666'>Sources: " + esc(sources.join(", "))
      + ". Generated on-device. Not legal advice. Verify every finding against your originals.</p>"
      + "<table border=1 cellpadding=6 cellspacing=0 style='border-collapse:collapse;font-size:13px;width:100%'>"
      + "<thead><tr><th>Status</th><th>Category</th><th>Finding</th><th>DS-160</th><th>Source</th></tr></thead><tbody>"
      + rows + matchRows + "</tbody></table></body>";
  }

  function downloadReport(report, sources) {
    var blob = new Blob([reportDoc(report, sources)], { type: "text/html" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "visadash-ds160-verify.html";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function printReport(report, sources) {
    var iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(iframe);
    var doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open(); doc.write(reportDoc(report, sources)); doc.close();
    setTimeout(function () {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(function () { iframe.remove(); }, 1000);
    }, 250);
  }

  function showDemo() {
    var A = window.VDAudit, E = window.VDEngine;
    if (!A || !E) {
      waitEngine().then(showDemo);
      return;
    }
    var dsText = [
      "Nonimmigrant Visa Application DS-160",
      "Name Provided: SHARMA, PRIYA",
      "Surnames: SHARMA",
      "Given Names: PRIYA",
      "Sex: FEMALE",
      "Date of Birth: 01-JAN-1990",
      "Country/Region of Origin (Nationality): INDIA",
      "Country/Region of Birth: INDIA",
      "Street Address (Line 1): 12 MG ROAD",
      "City: BENGALURU",
      "State/Province: KARNATAKA",
      "Postal Zone/ZIP Code: 560001",
      "Country/Region: INDIA",
      "Primary Phone Number: 919876543210",
      "E-mail Address: PRIYA@EXAMPLE.COM",
      "Passport/Travel Document Number: Z1234567",
      "Intended Date of Arrival: 15-DEC-2026",
      "Visa Number: 2020123456"
    ].join("\n");
    var docs = {
      ds160: E.TYPE_BY_ID.ds160.extract({ text: dsText, lines: dsText.split("\n") }),
      passport: (function () {
        var p = E.parseMRZ(
          ["P<INDSHARMA<<PRIYA<<<<<<<<<<<<<<<<<<<<<<<<<<<",
           "Z1234567<8IND9001011F3001012<<<<<<<<<<<<<<04"],
          "");
        return { fields: p.fields, mrz: { checks: p.checks } };
      })(),
      personal: A.fieldsFromPaste({
        surname: "SHARMA", given: "PRIYA", dob: "01-JAN-1990",
        sex: "Female", nationality: "INDIA", countryOfBirth: "INDIA"
      }),
      address: A.fieldsFromPaste({
        homeAddress: "12 MG Road", homeCity: "Bengaluru", homeState: "Karnataka",
        homePostal: "560001", homeCountry: "INDIA", email: "priya@example.com"
      }),
      priorVisa: A.fieldsFromPaste({ foilNumber: "2020999999", visaClass: "H1B" })
    };
    var report = A.runAudit(docs, { now: Date.parse("2026-08-30") });
    render(report, docs, ["passport", "personal", "address", "priorVisa"]);
    clearLog();
    log("Sample report — fictional data only.", "ok");
  }

  state.ready = true;
})();
