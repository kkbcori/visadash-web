"use strict";
/* VisaDash — H-1B sponsor grades table (lazy-loaded only on /h1b-sponsors). */
(function(){
  const qs  = (s,r=document)=>r.querySelector(s);
  const qsa = (s,r=document)=>[...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  const DATA = window.VDData("employers");
  const EMPLOYERS = DATA ? DATA.employers : [];

  window.VDFresh(qs("#emp-fresh"), DATA, "H-1B sponsors");
  if(!DATA) return;

  let empSort={key:"total",dir:-1};
  function renderEmployers(){
    const q=(qs("#emp-search").value||"").toLowerCase().trim();
    let rows=EMPLOYERS.filter(e=>e.name.toLowerCase().includes(q));
    rows.sort((a,b)=>{
      let x=a[empSort.key],y=b[empSort.key];
      if(typeof x==="string"){x=x.toLowerCase();y=y.toLowerCase();}
      return (x<y?-1:x>y?1:0)*empSort.dir;
    });
    const arr=k=> empSort.key===k ? `<span class="arr">${empSort.dir>0?"▲":"▼"}</span>` : "";
    const gradeClass=g=>g[0];
    let h=`<thead><tr>
      <th class="sortable" data-k="name">Employer ${arr("name")}</th>
      <th class="sortable" data-k="state">State ${arr("state")}</th>
      <th class="sortable num" data-k="total">Petitions ${arr("total")}</th>
      <th class="sortable num" data-k="rate">Approval ${arr("rate")}</th>
      <th class="sortable" data-k="grade">Grade ${arr("grade")}</th>
    </tr></thead><tbody>`;
    h+=rows.map(e=>`<tr>
      <td>${esc(e.name)}${e.dep?'<span class="tag warn">Dependent</span>':""}</td>
      <td>${e.state}</td>
      <td class="num">${e.total.toLocaleString()}</td>
      <td class="num">${e.rate.toFixed(1)}%</td>
      <td><span class="grade ${gradeClass(e.grade)}">${e.grade}</span></td>
    </tr>`).join("");
    if(!rows.length) h+=`<tr><td colspan="5" style="color:var(--ink-faint);font-style:italic">No employer matches that filter.</td></tr>`;
    qs("#emp-table").innerHTML=h+"</tbody>";
    qsa("#emp-table th.sortable").forEach(th=>th.addEventListener("click",()=>{
      const k=th.dataset.k;
      if(empSort.key===k) empSort.dir*=-1;
      else empSort={key:k,dir:(k==="name"||k==="state")?1:-1};
      renderEmployers();
    }));
  }
  renderEmployers();
  qs("#emp-search").addEventListener("input",renderEmployers);
})();
