"use strict";
/* VisaDash — shared nav: highlight the active toolkit link by pathname.
   Multi-page build: the nav is real <a> links, not SPA tab buttons. */
(function(){
  var path = location.pathname.replace(/index\.html$/,"");
  if(path.length>1) path = path.replace(/\/$/,"");
  var links = document.querySelectorAll("#tabnav a[data-path]");
  var best=null, bestLen=-1;
  links.forEach(function(a){
    var p=a.getAttribute("data-path");
    a.classList.remove("on");
    var hit = p==="/" ? (path==="" || path==="/") : (path===p || path.indexOf(p+"/")===0);
    if(hit && p.length>bestLen){ best=a; bestLen=p.length; }
  });
  if(best) best.classList.add("on");
})();
