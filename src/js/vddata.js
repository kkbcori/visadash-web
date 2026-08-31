"use strict";
/* VisaDash — shared dataset access + freshness badge.
   Data is injected at build time as <script type="application/json" id="vd-data[-name]">.
   VDFresh renders a "Data as of {date}" badge and a staleness warning past 45 days. */
(function(){
  window.VDData = function(name){
    var el = document.getElementById("vd-data-" + name) || document.getElementById("vd-data");
    if(!el) return null;
    try { return JSON.parse(el.textContent); } catch(e){ return null; }
  };
  window.VDFresh = function(el, d, label){
    if(!el) return;
    if(!d || !d.fetched_at){ el.innerHTML = '<span class="dot"></span> Data unavailable'; return; }
    var days = Math.floor((Date.now() - Date.parse(d.fetched_at + "T00:00:00")) / 86400000);
    var stale = days > 45;
    el.classList.toggle("is-stale", stale);
    el.innerHTML = '<span class="dot' + (stale ? " dot-stale" : "") + '"></span> '
      + (label ? label + " &middot; " : "")
      + "Data as of " + d.fetched_at + " &middot; source: " + d.source
      + (stale ? ' &middot; <b class="stale-warn">' + days + " days old — may be out of date; confirm against the official source</b>" : "");
  };
})();
