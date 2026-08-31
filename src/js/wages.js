"use strict";
/* VisaDash — Prevailing-wage check (lazy-loaded only on /prevailing-wage). */
(function(){
  const qs  = (s,r=document)=>r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const money = n => "$"+Math.round(n).toLocaleString("en-US");

  const DATA = window.VDData("wage_data");
  const SOC_TITLES = DATA ? DATA.soc_titles : {};
  const WAGES = DATA ? DATA.wages : [];

  function renderWages(){
    window.VDFresh(qs("#wg-fresh"), DATA, "DOL prevailing wage");
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

  if(!DATA){ window.VDFresh(qs("#wg-fresh"), null); } else { renderWages(); }
})();
