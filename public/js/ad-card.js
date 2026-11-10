// One advertisement card. Used on the homepage, in the advertiser's live preview and in the admin preview.
(function () {
  const esc = GP.escapeHtml;
  const PLACEHOLDER_BANNER = "/images/market/service.svg";

  GP.adCard = function (ad, { preview = false } = {}) {
    const initial = esc((ad.businessName || "?").trim().charAt(0).toUpperCase() || "?");
    const logo = ad.logoUrl ? `<img class="ad-logo" src="${esc(ad.logoUrl)}" alt="" />` : `<div class="ad-logo fallback">${initial}</div>`;
    const phone = String(ad.phone || "").replace(/[^0-9+]/g, "");
    let cta = "";
    if (preview) {
      cta = `<span class="btn btn-secondary ad-cta" aria-disabled="true">${esc(ad.ctaLabel || "Learn More")}</span>`;
    } else if (ad.hasLink) {
      cta = `<a class="btn btn-secondary ad-cta" href="/api/ads/${encodeURIComponent(ad.id)}/click" target="_blank" rel="sponsored noopener noreferrer nofollow">${esc(ad.ctaLabel || "Learn More")} <i class="fas fa-arrow-up-right-from-square"></i></a>`;
    } else if (phone) {
      cta = `<a class="btn btn-secondary ad-cta" href="tel:${esc(phone)}" data-ad-call="${esc(ad.id)}"><i class="fas fa-phone"></i> ${esc(ad.ctaLabel || "Call now")}</a>`;
    }
    return `
      <article class="ad-card ${ad.isFeatured ? "featured" : ""}" data-ad-id="${esc(ad.id || "")}" aria-label="Sponsored: ${esc(ad.businessName || "")}">
        <span class="ad-label">Sponsored</span>
        <div class="ad-banner"><img src="${esc(ad.bannerUrl || PLACEHOLDER_BANNER)}" alt="${esc(ad.title || "")}" loading="lazy" /></div>
        <div class="ad-body">
          <div class="ad-brand">${logo}<span class="ad-business gp-normal">${esc(ad.businessName || "Your business name")}</span></div>
          <div class="ad-title gp-normal">${esc(ad.title || "Your advertisement title")}</div>
          <p class="ad-msg">${esc(ad.message || "A short message about your offer, store or event.")}</p>
          ${ad.location ? `<div class="ad-loc gp-normal"><i class="fas fa-location-dot"></i> ${esc(ad.location)}</div>` : ""}
          ${cta}
        </div>
      </article>`;
  };

  // Count "Call" clicks (links go through /api/ads/:id/click instead)
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-ad-call]");
    if (a && navigator.sendBeacon) navigator.sendBeacon(`/api/ads/${encodeURIComponent(a.dataset.adCall)}/click`);
  });
})();
