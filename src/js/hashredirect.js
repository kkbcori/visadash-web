"use strict";
/* Preserve old single-page hash links (e.g. visadash.org/#wages) by redirecting
   to the new dedicated routes. Loaded only on the hub. */
(function(){
  var map = {
    "#compare":"/ds-160-compare",
    "#audit":"/ds-160-verify",
    "#verify":"/ds-160-verify",
    "#guides":"/form-guides",
    "#bulletin":"/visa-bulletin",
    "#processing":"/processing-times",
    "#wages":"/prevailing-wage",
    "#demo":"/ds-160-compare#demo"
  };
  var h = location.hash;
  if(h && map[h]) location.replace(map[h]);
})();
