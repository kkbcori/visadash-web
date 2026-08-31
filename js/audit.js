"use strict";
/* VisaDash — DS-160 single-document audit UI.
   Reads documents on-device (pdf.js text layer → tesseract OCR fallback), builds the
   typed docs via window.VDEngine, and runs window.VDAudit.runAudit. Nothing is uploaded. */
(function(){
  var root = document.getElementById("audit-app");
  if(!root) return;

  var SLOTS = [
    { key:"ds160",    label:"DS-160 application printout", required:true },
    { key:"passport", label:"Passport photo page or MRZ", mrz:true },
    { key:"priorVisa",label:"Prior U.S. visa foil" },
    { key:"i797",     label:"I-797 approval notice" },
    { key:"i20",      label:"I-20 / DS-2019" },
    { key:"i94",      label:"I-94 travel history" },
  ];
  var files = {};   // key -> File
  var mrzText = "";

  root.innerHTML =
    '<div class="slots no-print audit-slots">'
    + SLOTS.map(function(s, i){
        return '<div class="slot">'
          + '<div class="slot-head"><span class="slot-tag">'+(i+1)+'</span><h3>'+s.label+'</h3>'
          + '<span class="when">'+(s.required?'required':'optional')+'</span></div>'
          + '<div class="slot-body">'
          + '<div class="drop" tabindex="0" role="button" data-k="'+s.key+'">'
          + '<div class="ico">&#128228;</div><p>Drop file here, or click to browse</p>'
          + '<div class="hint">PDF, JPG or PNG</div></div>'
          + '<input type="file" accept=".pdf,image/*,.txt" data-k="'+s.key+'" hidden>'
          + '<div class="filelist" data-list="'+s.key+'"></div>'
          + (s.mrz ? '<textarea class="mrz" data-mrz="1" spellcheck="false" placeholder="…or paste the passport MRZ (two lines) instead" style="margin-top:8px;width:100%;min-height:56px"></textarea>' : '')
          + '</div></div>';
      }).join("")
    + '</div>'
    + '<div class="actions no-print" style="margin-top:14px">'
    + '<button class="btn" id="auditRun">Run audit</button>'
    + '<button class="btn ghost sm" id="auditReset">Clear all</button></div>'
    + '<div id="audit-log" class="no-print" style="font:.8rem/1.5 \'IBM Plex Mono\',monospace;color:var(--ink-soft);margin:10px 0"></div>'
    + '<section id="audit-results"></section>';

  var log = function(m){ document.getElementById("audit-log").textContent = m; };

  function showFile(key){
    var list = root.querySelector('[data-list="'+key+'"]');
    var f = files[key];
    list.innerHTML = f
      ? '<div class="fileitem"><span>&#128196; '+esc(f.name)+'</span><button type="button" class="x" data-rm="'+key+'">&times;</button></div>'
      : "";
  }
  // wire each drop zone to its hidden input, with drag-and-drop
  root.querySelectorAll('.slot-body').forEach(function(body){
    var drop = body.querySelector('.drop'), input = body.querySelector('input[type=file]');
    var key = drop.dataset.k;
    drop.addEventListener("click", function(){ input.click(); });
    drop.addEventListener("keydown", function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); input.click(); } });
    ["dragover","dragenter"].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave","drop"].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function(e){ if(e.dataTransfer.files[0]){ files[key]=e.dataTransfer.files[0]; showFile(key); } });
    input.addEventListener("change", function(){ files[key]=input.files[0]||null; showFile(key); input.value=""; });
  });
  root.addEventListener("click", function(e){
    var b = e.target.closest("button[data-rm]"); if(!b) return;
    files[b.dataset.rm]=null; showFile(b.dataset.rm);
  });
  var mrzBox = root.querySelector('textarea[data-mrz]');
  if(mrzBox) mrzBox.addEventListener("input", function(){ mrzText = mrzBox.value.trim(); });
  document.getElementById("auditReset").addEventListener("click", function(){ location.reload(); });
  document.getElementById("auditRun").addEventListener("click", run);

  /* ---- on-device extraction ---- */
  function itemsToLines(items){
    var lines = items.filter(function(it){return it.str.trim().length;})
      .map(function(it){return {s:it.str,x:it.transform[4],y:it.transform[5]};})
      .sort(function(a,b){return (b.y-a.y)||(a.x-b.x);});
    var out=[], cur=[], lastY=null;
    lines.forEach(function(i){
      if(lastY===null||Math.abs(i.y-lastY)<4){ cur.push(i); }
      else { out.push(cur); cur=[i]; }
      lastY=i.y;
    });
    if(cur.length) out.push(cur);
    return out.map(function(ln){ return ln.sort(function(a,b){return a.x-b.x;}).map(function(i){return i.s;}).join(" ").replace(/\s+/g," ").trim(); });
  }
  async function readAny(file){
    var isPdf = file.type==="application/pdf" || /\.pdf$/i.test(file.name);
    var isImg = /^image\//.test(file.type) || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(file.name);
    if(isPdf){
      var buf = await file.arrayBuffer();
      var pdf = await window.pdfjsLib.getDocument({data:buf}).promise;
      var lines=[], raw=0;
      for(var p=1;p<=pdf.numPages;p++){
        var page=await pdf.getPage(p), tc=await page.getTextContent();
        raw += tc.items.reduce(function(s,it){return s+it.str.length;},0);
        lines = lines.concat(itemsToLines(tc.items));
      }
      if(raw < 30*pdf.numPages){ // scanned → OCR first few pages
        var otext="";
        for(var q=1;q<=Math.min(pdf.numPages,8);q++){
          var pg=await pdf.getPage(q), vp=pg.getViewport({scale:2});
          var cv=document.createElement("canvas"); cv.width=vp.width; cv.height=vp.height;
          await pg.render({canvasContext:cv.getContext("2d"),viewport:vp}).promise;
          var r=await window.Tesseract.recognize(cv,"eng"); otext+="\n"+r.data.text;
        }
        lines = otext.split(/\n/).map(function(s){return s.trim();}).filter(Boolean);
        return {text:otext, lines:lines};
      }
      return {text:lines.join("\n"), lines:lines};
    }
    if(isImg){
      var res=await window.Tesseract.recognize(file,"eng");
      var t=res.data.text; return {text:t, lines:t.split(/\n/).map(function(s){return s.trim();}).filter(Boolean)};
    }
    var txt=await file.text();
    return {text:txt, lines:txt.split(/\n/).map(function(s){return s.trim();}).filter(Boolean)};
  }

  async function run(){
    var E=window.VDEngine, A=window.VDAudit;
    if(!E||!A){ log("Engine not loaded — check your connection and reload."); return; }
    if(!files.ds160){ log("A DS-160 printout is required."); return; }
    var btn=document.getElementById("auditRun"); btn.disabled=true; btn.textContent="Reading…";
    try{
      var docs={};
      log("Reading DS-160 on-device…");
      var ds=await readAny(files.ds160);
      docs.ds160 = E.TYPE_BY_ID.ds160.extract({text:ds.text,lines:ds.lines});

      if(mrzText){
        var pm=E.parseMRZ(mrzText.split(/\n/).map(function(s){return s.trim();}), mrzText);
        if(pm) docs.passport={fields:pm.fields, mrz:{checks:pm.checks}};
      } else if(files.passport){
        log("Reading passport on-device…");
        var pp=await readAny(files.passport);
        var pm2=E.parseMRZ(pp.lines, pp.text);
        if(pm2) docs.passport={fields:pm2.fields, mrz:{checks:pm2.checks}};
      }
      if(files.priorVisa){ log("Reading prior visa…"); var pv=await readAny(files.priorVisa); docs.priorVisa=A.parseVisaFoil(pv.lines); }
      if(files.i797){ log("Reading I-797…"); var n=await readAny(files.i797); docs.i797=E.TYPE_BY_ID.i797.extract({text:n.text,lines:n.lines}); }
      if(files.i20){ log("Reading I-20/DS-2019…"); var g=await readAny(files.i20); docs.i20=E.TYPE_BY_ID.i20.extract({text:g.text,lines:g.lines}); }
      if(files.i94){ log("Reading I-94…"); var w=await readAny(files.i94); docs.i94=A.parseI94(w.text); }

      log("Running "+A.RULES.length+" checks on-device…");
      var report=A.runAudit(docs);
      render(report, docs);
      log("Done — nothing was uploaded.");
    }catch(err){ log("Error: "+err.message); }
    finally{ btn.disabled=false; btn.textContent="Run audit"; }
  }

  var SEV={ blocker:{cls:"sev-crit",label:"Blocker",box:"danger"},
            warning:{cls:"sev-high",label:"Warning",box:"note"},
            info:{cls:"sev-info",label:"Info",box:"note"} };
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }

  function render(report, docs){
    var order=["blocker","warning","info"];
    var bySev=order.map(function(sev){
      var items=report.findings.filter(function(f){return f.severity===sev;});
      if(!items.length) return "";
      return items.map(function(f){
        var sv=SEV[f.severity];
        var vals="";
        if(f.ds160Value||f.docValue){
          vals='<div class="sub"><table class="dt" style="margin-top:6px"><tbody>'
            +'<tr><td style="width:120px;color:var(--ink-faint)">DS-160</td><td>'+esc(f.ds160Value||"—")+(f.ds160Source?' <span class="conf conf-mid" title="'+esc(f.ds160Source.snippet||"")+'">source</span>':'')+'</td></tr>'
            +'<tr><td style="color:var(--ink-faint)">Document</td><td>'+esc(f.docValue||"—")+(f.docSource?' <span class="conf conf-mid" title="'+esc(f.docSource.snippet||"")+'">source</span>':'')+'</td></tr>'
            +'</tbody></table></div>';
        }
        return '<div class="callout '+sv.box+'"><div class="lbl"><span class="eng-chip '+sv.cls+'">'+sv.label+'</span> '+esc(f.category)+'</div>'
          +'<div class="sub">'+esc(f.message)+(f.lowConfidence?' <i>(low-confidence extraction)</i>':'')+'</div>'+vals+'</div>';
      }).join("");
    }).join("");

    var skipped = report.skipped.length
      ? '<div class="tool-notes"><b>Checks skipped</b> — a required document wasn\'t provided:<br>'
        + report.skipped.map(function(s){return "&bull; "+esc(s.id)+" — needs "+esc(s.missing.join(", "));}).join("<br>")+'</div>'
      : "";

    var el=document.getElementById("audit-results");
    el.innerHTML =
      '<div class="verdict '+(report.counts.blocker?"verdict-bad":report.counts.warning?"verdict-warn":"verdict-ok")+'">'
      + '<div class="v-title">Audit findings</div><div class="v-sub">'+esc(report.summary)+'</div></div>'
      + (bySev || '<div class="callout note"><div class="sub">No rule fired on the documents provided. This does not mean the DS-160 is correct — review every field against your originals.</div></div>')
      + skipped
      + '<div class="actions no-print" style="margin-top:12px"><button class="btn ghost sm" id="auditDownload">Download report</button></div>'
      + '<div class="tool-notes">This is not legal advice and never says your DS-160 is ready to submit. Every finding is for you to verify against your original documents.</div>';
    el.classList.add("show");
    var dl=document.getElementById("auditDownload");
    if(dl) dl.addEventListener("click", function(){ downloadReport(report); });
    el.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function downloadReport(report){
    var rows=report.findings.map(function(f){
      return "<tr><td>"+esc(f.severity.toUpperCase())+"</td><td>"+esc(f.category)+"</td><td>"+esc(f.message)
        +"</td><td>"+esc(f.ds160Value||"")+"</td><td>"+esc(f.docValue||"")+"</td></tr>";
    }).join("");
    var doc="<!doctype html><meta charset=utf-8><title>VisaDash DS-160 audit</title>"
      +"<body style='font-family:sans-serif;max-width:820px;margin:24px auto;padding:0 16px'>"
      +"<h2>VisaDash — DS-160 audit report</h2><p>"+esc(report.summary)+"</p>"
      +"<p style='color:#666'>Generated on-device. Not legal advice. Verify every finding against your original documents.</p>"
      +"<table border=1 cellpadding=6 cellspacing=0 style='border-collapse:collapse;font-size:13px'>"
      +"<thead><tr><th>Severity</th><th>Category</th><th>Finding</th><th>DS-160</th><th>Document</th></tr></thead><tbody>"
      +rows+"</tbody></table></body>";
    var blob=new Blob([doc],{type:"text/html"});
    var a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download="visadash-ds160-audit.html"; a.click(); URL.revokeObjectURL(a.href);
  }
})();
