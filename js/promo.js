/* KKB CoRi app promo rail: auto-rotating one-by-one slider (shared, all pages).
   Uses display toggling (not a horizontal flex+transform track) so inactive
   slides contribute zero min-content width — Chrome was letting the old track
   inflate .wrap past max-width and clip the rail. */
(function(){
  var track=document.getElementById('promoTrack');
  var dotsWrap=document.getElementById('promoDots');
  var rail=document.getElementById('promoRail');
  if(!track||!dotsWrap||!rail) return;
  var slides=track.children, n=slides.length, i=0, timer=null, DELAY=4200;
  for(var k=0;k<n;k++){
    var b=document.createElement('button');
    b.type='button'; b.setAttribute('role','tab');
    var nm=slides[k].querySelector('.promo-name');
    b.setAttribute('aria-label', nm?nm.textContent:('App '+(k+1)));
    (function(idx){ b.addEventListener('click',function(){ go(idx); reset(); }); })(k);
    dotsWrap.appendChild(b);
  }
  var dots=dotsWrap.children;
  function go(idx){
    i=(idx+n)%n;
    for(var s=0;s<n;s++){
      slides[s].classList.toggle('on', s===i);
      slides[s].setAttribute('aria-hidden', s===i ? 'false' : 'true');
    }
    for(var d=0;d<n;d++){ dots[d].classList.toggle('on', d===i); }
  }
  function start(){ if(!timer) timer=setInterval(function(){ go(i+1); }, DELAY); }
  function stop(){ if(timer){ clearInterval(timer); timer=null; } }
  function reset(){ stop(); start(); }
  rail.addEventListener('mouseenter', stop);
  rail.addEventListener('mouseleave', start);
  rail.addEventListener('focusin', stop);
  rail.addEventListener('focusout', start);
  document.addEventListener('visibilitychange', function(){ document.hidden?stop():start(); });
  go(0); start();
})();
