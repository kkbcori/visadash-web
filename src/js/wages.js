"use strict";
/* VisaDash — Prevailing-wage check (lazy-loaded only on /prevailing-wage). */
(function(){
  const qs  = (s,r=document)=>r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const money = n => "$"+Math.round(n).toLocaleString("en-US");

  const WG_FETCHED="2026-03-18", WG_SOURCE="DOL OFLC LCA Disclosure Data FY2025 Q4";
  const SOC_TITLES={"15-1252":"Software Developers & Engineers","15-1211":"Computer Systems Analysts","15-2051":"Data Scientists"};
  const WAGES=[{soc:"15-1252",state:"TX",level:"I",wage:78540},{soc:"15-1252",state:"TX",level:"II",wage:98000},{soc:"15-1252",state:"TX",level:"III",wage:112847},{soc:"15-1252",state:"TX",level:"IV",wage:138290},{soc:"15-1252",state:"CA",level:"I",wage:112000},{soc:"15-1252",state:"CA",level:"II",wage:142000},{soc:"15-1252",state:"CA",level:"III",wage:172500},{soc:"15-1252",state:"CA",level:"IV",wage:215000},{soc:"15-1252",state:"NY",level:"I",wage:98000},{soc:"15-1252",state:"NY",level:"II",wage:122000},{soc:"15-1252",state:"NY",level:"III",wage:148000},{soc:"15-1252",state:"NY",level:"IV",wage:182000},{soc:"15-1252",state:"WA",level:"I",wage:105000},{soc:"15-1252",state:"WA",level:"II",wage:130000},{soc:"15-1252",state:"WA",level:"III",wage:158000},{soc:"15-1252",state:"WA",level:"IV",wage:195000},{soc:"15-1211",state:"TX",level:"I",wage:72100},{soc:"15-1211",state:"TX",level:"II",wage:89400},{soc:"15-1211",state:"TX",level:"III",wage:104200},{soc:"15-1211",state:"TX",level:"IV",wage:126800},{soc:"15-2051",state:"TX",level:"I",wage:82000},{soc:"15-2051",state:"TX",level:"II",wage:104000},{soc:"15-2051",state:"TX",level:"III",wage:124000},{soc:"15-2051",state:"TX",level:"IV",wage:152000}];

  function renderWages(){
    qs("#wg-fresh").innerHTML=`<span class="dot"></span> ${WG_SOURCE} &middot; snapshot ${WG_FETCHED}`;
    const socs=[...new Set(WAGES.map(w=>w.soc))];
    qs("#wg-soc").innerHTML=socs.map(s=>`<option value="${s}">${esc(SOC_TITLES[s]||s)} (${s})</option>`).join("");
    refreshStates();
    qs("#wg-soc").addEventListener("change",()=>{refreshStates();wgCheck();});
    ["wg-state","wg-level","wg-offer"].forEach(id=>qs("#"+id).addEventListener("input",wgCheck));
    wgCheck();
  }
  function refreshStates(){
    const soc=qs("#wg-soc").value;
    const states=[...new Set(WAGES.filter(w=>w.soc===soc).map(w=>w.state))];
    qs("#wg-state").innerHTML=states.map(s=>`<option value="${s}">${s}</option>`).join("");
  }
  function wgCheck(){
    const soc=qs("#wg-soc").value, state=qs("#wg-state").value, level=qs("#wg-level").value;
    const row=WAGES.find(w=>w.soc===soc&&w.state===state&&w.level===level);
    const out=qs("#wg-result");
    if(!row){ out.innerHTML=`<div class="callout note"><div class="sub">No wage data for that occupation, state and level combination in this snapshot.</div></div>`; return; }
    const offer=parseFloat(qs("#wg-offer").value);
    let extra="", cls="";
    if(!isNaN(offer)&&offer>0){
      const diff=offer-row.wage, pct=(diff/row.wage*100);
      if(diff>=0){ cls="safe"; extra=`<div class="sub">The offer of <b>${money(offer)}</b> is <b>${money(diff)} (${pct.toFixed(1)}%) above</b> the prevailing wage — compliant for this level. ✓</div>`; }
      else { cls="danger"; extra=`<div class="sub">The offer of <b>${money(offer)}</b> is <b>${money(-diff)} (${Math.abs(pct).toFixed(1)}%) below</b> the prevailing wage. An LCA at this level would not be certifiable — raise the wage or lower the level.</div>`; }
    }
    out.innerHTML=`<div class="callout ${cls}"><div class="lbl">${esc(SOC_TITLES[soc]||soc)} · ${state} · Level ${level}</div>
      <div class="big">${money(row.wage)} <span style="font-size:.6em;color:var(--ink-faint)">prevailing / yr</span></div>${extra}</div>`;
  }

  renderWages();
})();
