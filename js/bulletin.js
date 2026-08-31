"use strict";
/* VisaDash — Visa Bulletin tool (lazy-loaded only on /visa-bulletin). */
(function(){
  const qs  = (s,r=document)=>r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const getData = window.VDData;   // shared data + freshness helper

  /* ---- data: versioned snapshot from data/visa_bulletin.json (injected at build) ---- */
  const DATA = getData("visa_bulletin");
  const BULLETIN = DATA ? {
    month: DATA.month, fetched: DATA.fetched_at, source: DATA.source,
    months: DATA.months, eb: DATA.months[DATA.months.length-1].eb
  } : null;

  const COUNTRIES=["All","China","India","Mexico","Philippines"];
  function fmtDate(s){
    if(s==="C") return "Current";
    if(s==="U") return "Unavailable";
    const d=new Date(s+"T00:00:00");
    return d.toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"});
  }
  function cutoffRank(v){
    if(v==="U") return -2;
    if(v==="C") return 1e15;
    return new Date(v+"T00:00:00").getTime();
  }
  function movementLabel(from, to){
    if(from===to) return {text:"No change", cls:"neutral"};
    if(to==="U") return from==="U" ? {text:"Still unavailable", cls:"neutral"} : {text:"Became unavailable", cls:"bad"};
    if(from==="U") return {text:"Reopened", cls:"good"};
    if(from==="C" && to!=="C") return {text:"Retrogressed from current", cls:"bad"};
    if(to==="C") return {text:"Advanced to current", cls:"good"};
    const days=Math.round((cutoffRank(to)-cutoffRank(from))/86400000);
    if(days>0){
      const mo=Math.abs(days/30.4);
      const t=mo>=1.8 ? `+${mo.toFixed(1)} mo` : `+${Math.round(days/7)} wk`;
      return {text:t, cls:"good"};
    }
    if(days<0){
      const mo=Math.abs(days/30.4);
      const t=mo>=1.8 ? `${mo.toFixed(1)} mo back` : `${Math.round(Math.abs(days)/7)} wk back`;
      return {text:t, cls:"bad"};
    }
    return {text:"No change", cls:"neutral"};
  }
  function cellClass(from, to){
    if(from===to) return "";
    if(to==="U" || (from==="C" && to!=="C")) return "cell-retro";
    if(to==="C" || (from==="U" && to!=="U")) return "cell-advance";
    const r=cutoffRank(to)-cutoffRank(from);
    return r>0 ? "cell-advance" : r<0 ? "cell-retro" : "";
  }
  function renderBulletinCompare(){
    const el=qs("#vb-compare");
    if(!el) return;
    const months=BULLETIN.months;
    if(!months || months.length<2){
      el.innerHTML=`<tbody><tr><td colspan="6" style="color:var(--ink-faint);font-style:italic;padding:16px">Comparison data is loading…</td></tr></tbody>`;
      return;
    }
    let h=`<colgroup>
      <col style="width:52px"><col style="width:88px">
      <col style="width:108px"><col style="width:108px"><col style="width:108px">
      <col style="width:128px"></colgroup>
      <thead><tr><th>Cat.</th><th>Country</th>`;
    months.forEach(m=>{ h+=`<th class="num">${esc(m.label.replace(" 2026",""))}&nbsp;'26</th>`; });
    h+=`<th>Jun &rarr; Aug</th></tr></thead><tbody>`;
    for(const cat of ["EB1","EB2","EB3"]){
      for(const country of COUNTRIES){
        const vals=months.map(m=>m.eb[cat][country]);
        const mov=movementLabel(vals[0], vals[vals.length-1]);
        h+=`<tr><td><b>${cat}</b></td><td>${country}</td>`;
        vals.forEach((v,i)=>{
          const cls=["num"];
          if(v==="U") cls.push("cell-u");
          else if(i>0) { const cc=cellClass(vals[i-1], v); if(cc) cls.push(cc); }
          const inner=v==="C"?'<span class="grade A" style="min-width:auto">C</span>':v==="U"?"U":fmtDate(v);
          h+=`<td class="${cls.join(" ")}">${inner}</td>`;
        });
        h+=`<td class="mov ${mov.cls}">${esc(mov.text)}</td></tr>`;
      }
    }
    el.innerHTML=h+"</tbody>";
  }
  function computeMovement(){
    const first=BULLETIN.months[0], last=BULLETIN.months[BULLETIN.months.length-1];
    const out=[];
    for(const cat of ["EB1","EB2","EB3"]){
      for(const c of ["China","India"]){
        const from=first.eb[cat][c], to=last.eb[cat][c];
        const mov=movementLabel(from,to);
        if(mov.text!=="No change") out.push([`${cat} · ${c}`, mov.text, mov.cls]);
      }
    }
    return out;
  }
  function renderBulletin(){
    window.VDFresh(qs("#bulletin-fresh"), DATA, `${BULLETIN.month} Visa Bulletin`);
    let h=`<thead><tr><th>Category</th>${COUNTRIES.map(c=>`<th class="num">${c}</th>`).join("")}</tr></thead><tbody>`;
    for(const cat of ["EB1","EB2","EB3"]){
      h+=`<tr><td><b>${cat}</b></td>`+COUNTRIES.map(c=>{
        const v=BULLETIN.eb[cat][c];
        return v==="C"
          ? `<td class="num"><span class="grade A" style="min-width:auto">C</span></td>`
          : v==="U"
          ? `<td class="num cell-u"><b>U</b></td>`
          : `<td class="num">${fmtDate(v)}</td>`;
      }).join("")+`</tr>`;
    }
    qs("#vb-table").innerHTML=h+"</tbody>";
    renderBulletinCompare();
    const moves=computeMovement();
    qs("#vb-movement").innerHTML=`<h3 class="secTitle">Jun → Aug highlights</h3>
      <p class="secSub">Biggest shifts for India and China chargeability over the last three bulletins.</p>
      <div class="cards">`+(moves.length?moves.map(([k,v,cls])=>
        `<div class="mini"><div class="k">${esc(k)}</div><div class="v ${cls==="good"?"good":cls==="bad"?"bad":"warn"}">${esc(v)}</div></div>`
      ).join(""):`<div class="mini"><div class="k">All tracked rows</div><div class="v warn">No change</div><div class="n">Cutoffs unchanged Jun–Aug for India/China EB rows shown above.</div></div>`)+`</div>`;
  }
  function checkCurrent(){
    const cat=qs("#vb-cat").value, country=qs("#vb-country").value, pd=qs("#vb-pd").value;
    const out=qs("#vb-result");
    if(!pd){ out.innerHTML=""; return; }
    const cutoff=BULLETIN.eb[cat][country];
    const pdDate=new Date(pd+"T00:00:00");
    let cls,big,sub;
    if(cutoff==="C"){
      cls="safe"; big="Current ✓";
      sub=`${cat} for ${country} is <b>current</b> — a visa number is available regardless of your priority date.`;
    } else if(cutoff==="U"){
      cls="danger"; big="Unavailable";
      sub=`${cat} for ${country} is <b>unavailable</b> this month — no immigrant visas are being issued in this category (common for India EB-2 near fiscal year-end). Expect a reset when the new fiscal year begins in October.`;
    } else {
      const cut=new Date(cutoff+"T00:00:00");
      if(pdDate < cut){
        cls="safe"; big="You're current ✓";
        sub=`Your priority date (${fmtDate(pd)}) is <b>earlier</b> than the ${cat} · ${country} cutoff of <b>${fmtDate(cutoff)}</b> — a number is available this month.`;
      } else {
        const days=Math.round((pdDate-cut)/86400000);
        cls="danger"; big="Not yet";
        sub=`Your priority date (${fmtDate(pd)}) is <b>${days.toLocaleString()} days after</b> the ${cat} · ${country} cutoff of <b>${fmtDate(cutoff)}</b>. Keep watching — the cutoff moves forward over time.`;
      }
    }
    out.innerHTML=`<div class="callout ${cls}"><div class="lbl">${cat} · ${country}</div><div class="big">${big}</div><div class="sub">${sub}</div></div>`;
  }

  if(!BULLETIN){ window.VDFresh(qs("#bulletin-fresh"), null); return; }
  renderBulletin();
  ["vb-cat","vb-country","vb-pd"].forEach(id=>qs("#"+id).addEventListener("input",checkCurrent));
  checkCurrent();
})();
