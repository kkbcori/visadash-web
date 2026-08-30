"use strict";
/* VisaDash — USCIS Processing Times tool (lazy-loaded only on /processing-times). */
(function(){
  const qs  = (s,r=document)=>r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  const PT_FETCHED="2026-03-18", PT_SOURCE="egov.uscis.gov/processing-times";
  const PROCESSING = {"I-129_WAC":{form:"I-129",center:"WAC",median_months:4.2,p75_months:6.1,p90_months:8.4,recent_approvals:847},"I-129_LIN":{form:"I-129",center:"LIN",median_months:3.8,p75_months:5.6,p90_months:7.2,recent_approvals:1203},"I-129_VSC":{form:"I-129",center:"VSC",median_months:4.6,p75_months:6.4,p90_months:8.9,recent_approvals:621},"I-129_EAC":{form:"I-129",center:"EAC",median_months:3.2,p75_months:4.8,p90_months:6.5,recent_approvals:982},"I-140_WAC":{form:"I-140",center:"WAC",median_months:6.2,p75_months:9.1,p90_months:14.3,recent_approvals:412},"I-140_VSC":{form:"I-140",center:"VSC",median_months:5.8,p75_months:8.4,p90_months:12.1,recent_approvals:389},"I-765_NBC":{form:"I-765",center:"NBC",median_months:3.1,p75_months:4.2,p90_months:5.8,recent_approvals:2841},"I-485_NBC":{form:"I-485",center:"NBC",median_months:18.4,p75_months:24.2,p90_months:36.1,recent_approvals:1204}};
  const FORM_LABEL = {"I-129":"I-129 — Nonimmigrant worker (H-1B/L/O/etc.)","I-140":"I-140 — Immigrant petition (EB green card)","I-485":"I-485 — Adjustment of status","I-765":"I-765 — Employment authorization (EAD)"};
  const CENTER_LABEL = {WAC:"WAC — California (CSC)",LIN:"LIN — Nebraska (NSC)",VSC:"VSC — Vermont (VSC)",EAC:"EAC — Vermont (EAC)",NBC:"NBC — National Benefits Center"};

  function months(n){ return n>=12 ? (n/12).toFixed(1)+" yr" : n+" mo"; }
  function renderProcessing(){
    qs("#pt-fresh").innerHTML=`<span class="dot"></span> Snapshot ${PT_FETCHED} &middot; source: ${PT_SOURCE}`;
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

  renderProcessing();
})();
