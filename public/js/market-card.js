// Product card used on the marketplace grid, product "related" list and favorites
(function () {
  const esc = GP.escapeHtml;
  const availText = { AVAILABLE: "Available", RESERVED: "Reserved", OUT_OF_STOCK: "Out of stock" };

  GP.productCard = function (p) {
    const img = GP.productImage(p);
    const isArt = !p.imageUrl;
    const badge = p.status === "SOLD" ? `<span class="mk-badge sold">Sold</span>` : `<span class="mk-badge ${p.condition === "NEW" ? "new" : "used"}">${p.condition === "NEW" ? "New" : "Used"}</span>`;
    const href = `/marketplace/${encodeURIComponent(p.id)}`;
    return `
      <article class="mk-card">
        <a class="mk-card-img" href="${href}" tabindex="-1" aria-hidden="true">
          <img src="${esc(img)}" alt="" loading="lazy" class="${isArt ? "art" : ""}" />
          ${badge}
        </a>
        <button type="button" class="mk-fav ${p.isFavorite ? "on" : ""}" data-fav="${esc(p.id)}" aria-pressed="${p.isFavorite ? "true" : "false"}" aria-label="${p.isFavorite ? "Remove from saved" : "Save item"}">
          <i class="${p.isFavorite ? "fas" : "far"} fa-heart"></i>
        </button>
        <div class="mk-card-body">
          <div class="mk-card-cat">${GP.icon(p.category.icon)} ${esc(p.category.name)}</div>
          <a href="${href}" class="mk-card-title gp-normal">${esc(p.title)}</a>
          <div class="mk-price">${esc(GP.money(p.price, p.currency))}</div>
          <div class="mk-card-meta">
            <span class="gp-normal"><i class="fas ${p.seller.type === "STORE" ? "fa-store" : "fa-user"}"></i>${esc(p.seller.displayName)}</span>
            <span class="gp-normal"><i class="fas fa-location-dot"></i>${esc(p.location)}</span>
          </div>
          <div class="mk-card-foot">
            <span class="mk-avail ${esc(p.availability)}">${esc(availText[p.availability] || p.availability)}</span>
            <a class="btn btn-sm" href="${href}">View details</a>
          </div>
        </div>
      </article>`;
  };

  // Delegate favorite clicks inside a container
  GP.bindFavorites = function (root) {
    root.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-fav]");
      if (!btn) return;
      e.preventDefault();
      btn.disabled = true;
      try {
        const r = await GP.api(`/api/marketplace/products/${encodeURIComponent(btn.dataset.fav)}/favorite`, { method: "POST" });
        btn.classList.toggle("on", r.isFavorite);
        btn.setAttribute("aria-pressed", String(r.isFavorite));
        btn.setAttribute("aria-label", r.isFavorite ? "Remove from saved" : "Save item");
        btn.querySelector("i").className = `${r.isFavorite ? "fas" : "far"} fa-heart`;
        GP.toast(r.isFavorite ? "Saved to your favorites" : "Removed from favorites", "success");
        btn.dispatchEvent(new CustomEvent("gp:fav", { bubbles: true, detail: r }));
      } catch (err) {
        if (err.status === 401) {
          GP.toast("Sign in to save items", "info");
          setTimeout(() => (location.href = `/signin?next=${encodeURIComponent(location.pathname + location.search)}`), 900);
        } else GP.toast(err.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
  };
})();
