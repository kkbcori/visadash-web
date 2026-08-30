"use strict";
/* VisaDash — DS-160 single-document audit.
   Task 1 ships the route + scaffold; the cross-validation engine lands in Task 3.
   This renders the planned inputs so the page is honest about what's coming and
   makes clear that, like every VisaDash tool, it will run entirely on-device. */
(function(){
  var root = document.getElementById("audit-app");
  if(!root) return;
  var inputs = [
    ["DS-160 full application printout", "required"],
    ["Passport photo page (or pasted MRZ)", "optional"],
    ["Prior U.S. visa foil scan", "optional"],
    ["I-797 approval notice", "optional"],
    ["I-20 / DS-2019", "optional"],
    ["I-94 travel history PDF", "optional"],
    ["Other supporting scans (best-effort)", "optional"]
  ];
  root.innerHTML =
    '<div class="callout note"><div class="lbl">In active development</div>'
    + '<div class="sub">The audit engine &mdash; DS-160 &harr; passport / prior visa / I-797 / I-20 / I-94 cross-checks, graded Blocker / Warning / Info &mdash; is being finalized in the next build. It will run entirely on this device, exactly like the compare tool. In the meantime, the <a href="/ds-160-compare">DS-160 Compare</a> tool already diffs two DS-160 versions on-device.</div></div>'
    + '<div class="tool-notes" style="margin-top:16px"><b>Inputs it will accept</b><br>'
    + inputs.map(function(i){ return '&bull; ' + i[0] + ' <span style="color:var(--ink-faint)">(' + i[1] + ')</span>'; }).join('<br>')
    + '</div>';
})();
