// Homepage sponsored column: loads live ads and counts an impression once each ad is actually seen
(function () {
  const list = document.getElementById("home-ads");
  if (!list) return;

  function trackImpressions() {
    const cards = [...list.querySelectorAll("[data-ad-id]")];
    if (!cards.length) return;
    const seen = new Set();
    let timer = null;
    const flush = () => {
      timer = null;
      const ids = [...seen].filter((id) => !flush.sent?.has(id));
      if (!ids.length) return;
      flush.sent = new Set([...(flush.sent || []), ...ids]);
      fetch("/api/ads/impressions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }), keepalive: true }).catch(() => {});
    };
    if (!("IntersectionObserver" in window)) {
      cards.forEach((c) => seen.add(c.dataset.adId));
      return flush();
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            seen.add(e.target.dataset.adId);
            io.unobserve(e.target);
          }
        });
        if (!timer) timer = setTimeout(flush, 800);
      },
      { threshold: 0.5 }
    );
    cards.forEach((c) => io.observe(c));
  }

  (async function load() {
    try {
      const res = await fetch("/api/ads/active?placement=HOME_SIDEBAR");
      if (!res.ok) throw new Error();
      const ads = await res.json();
      if (!ads.length) return; // only the "Advertise with us" note is shown
      list.innerHTML = ads.map((a) => GP.adCard(a)).join("");
      document.querySelector(".home-ads-head").hidden = false;
      trackImpressions();
    } catch {
      list.innerHTML = "";
    }
  })();
})();
