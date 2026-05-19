(function(){
  const TRACK_URL =
    "https://vitalink-app.netlify.app/.netlify/functions/track-site-traffic";

  try{
    const ignored =
      navigator.doNotTrack === "1" ||
      window.doNotTrack === "1";

    if(ignored){
      return;
    }

    const visitorKey =
      "vitalink_site_visitor";
    const sessionKey =
      "vitalink_site_session";

    let visitorId =
      localStorage.getItem(visitorKey);

    if(!visitorId){
      visitorId =
        crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      localStorage.setItem(visitorKey, visitorId);
    }

    let sessionId =
      sessionStorage.getItem(sessionKey);

    if(!sessionId){
      sessionId =
        crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      sessionStorage.setItem(sessionKey, sessionId);
    }

    const referrer =
      document.referrer
        ? new URL(document.referrer).host
        : "";

    const body =
      JSON.stringify({
        page_path:window.location.pathname,
        page_title:document.title,
        referrer_host:referrer,
        visitor_id:visitorId,
        session_id:sessionId
      });

    if(navigator.sendBeacon){
      navigator.sendBeacon(
        TRACK_URL,
        new Blob([body], { type:"application/json" })
      );
      return;
    }

    fetch(TRACK_URL,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body,
      keepalive:true
    }).catch(()=>{});
  }catch(_err){}
})();
