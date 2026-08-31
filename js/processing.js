"use strict";
/* VisaDash — USCIS Processing Times tool (lazy-loaded only on /processing-times). */
(function(){
  const qs  = (s,r=document)=>r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  const DATA = window.VDData("processing_times");
  const PROCESSING = DATA ? DATA.processing : {};
  const FORM_LABEL = DATA ? DATA.form_label : {};
  const CENTER_LABEL = DATA ? DATA.center_label : {};

  function months(n){ return n>=12 ? (n/12).toFixed(1)+" yr" : n+" mo"; }
  function renderProcessing(){
    window.VDFresh(qs("#pt-fresh"), DATA, "USCIS processing times");
    const forms=[...new Set(Object.values(PROCESSING).map(p=>p.form))];
    qs("#pt-form").innerHTML=forms.map(f=>`<option value="${f}">${esc(FORM_LABEL[f]||f)}</option>`).join("");
    syncCenters();
    qs("#pt-form").addEventListener("change",()=>{syncCenters();ptEstimate();});
    qs("#pt-center").addEventListener("change",ptEstimate);
    let h=`<thead><tr><th>Form</th><th>Center</th><th class="num">Median</th><th class="num">75%</th><th class="num">90%</th><th class="num">Recent approvals</th></tr></thead><tbody>`;
    h+=Object.values(PROCESSING).map(p=>`<tr><td><b>${p.form}</b></td><td>${p.center}</td><td class="num">${months(p.median_months)}</td><td class="num">${months(p.p75_months)}</td><td class="num">${months(p.p90_months)}</td><td class="num">${p.recent_approvals.toLocaleString()}</td></tr>`).join("");
    qs("#pt-table").innerHTML=h+"</tbody>";
    ptEstimate();
  }
  function syncCenters(){
    const form=qs("#pt-form").value;
    const centers=Object.values(PROCESSING).filter(p=>p.form===form).map(p=>p.center);
    qs("#pt-center").innerHTML=centers.map(c=>`<option value="${c}">${esc(CENTER_LABEL[c]||c)}</option>`).join("");
  }
  function ptEstimate(){
    const form=qs("#pt-form").value, center=qs("#pt-center").value;
    const p=PROCESSING[form+"_"+center]; if(!p){qs("#pt-result").innerHTML="";return;}
    qs("#pt-result").innerHTML=`<div class="callout"><div class="lbl">${p.form} · ${p.center}</div>
      <div class="big">${months(p.median_months)} <span style="font-size:.7em;color:var(--ink-faint)">typical</span></div>
      <div class="sub">Half of recent ${p.form} cases at this center finished within <b>${months(p.median_months)}</b>; 9 in 10 within <b>${months(p.p90_months)}</b>. Based on ${p.recent_approvals.toLocaleString()} recent approvals. If your case is past the 90% mark, an inquiry may be warranted.</div></div>`;
  }

  if(!DATA){ window.VDFresh(qs("#pt-fresh"), null); } else { renderProcessing(); }
})();
