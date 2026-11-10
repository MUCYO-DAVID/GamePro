(function () {
  const esc = GP.escapeHtml;
  const grid = document.getElementById("grid");
  const pager = document.getElementById("pager");
  const countEl = document.getElementById("result-count");
  const catsEl = document.getElementById("cats");
  const form = document.getElementById("filter-form");
  const sub = document.getElementById("f-sub");
  const q = document.getElementById("q");
  const sort = document.getElementById("sort");
  let categories = [];

  // The URL is the single source of truth for filters, so results can be shared and survive refresh
  function state() {
    const p = new URLSearchParams(location.search);
    return Object.fromEntries([...p.entries()].filter(([, v]) => v !== ""));
  }
  function go(changes, { resetPage = true } = {}) {
    const s = { ...state(), ...changes };
    if (resetPage) delete s.page;
    Object.keys(s).forEach((k) => (s[k] === "" || s[k] == null) && delete s[k]);
    history.pushState(null, "", `/marketplace${Object.keys(s).length ? `?${new URLSearchParams(s)}` : ""}`);
    syncInputs();
    load();
  }

  function topSlugOf(slug) {
    for (const t of categories) {
      if (t.slug === slug) return t.slug;
      if (t.children.some((c) => c.slug === slug)) return t.slug;
    }
    return null;
  }

  function renderCats() {
    const active = topSlugOf(state().category || "");
    catsEl.innerHTML =
      `<button type="button" class="mk-cat ${!active ? "active" : ""}" data-cat=""><i class="fas fa-border-all"></i> All</button>` +
      categories
        .map(
          (c) => `<button type="button" class="mk-cat ${active === c.slug ? "active" : ""}" data-cat="${esc(c.slug)}">
            ${GP.icon(c.icon)} ${esc(c.name)} <span class="count">${c.count}</span></button>`
        )
        .join("");
    sub.innerHTML =
      `<option value="">All categories</option>` +
      categories
        .map(
          (t) => `<optgroup label="${esc(t.name)}">
            <option value="${esc(t.slug)}">All ${esc(t.name)}</option>
            ${t.children.map((c) => `<option value="${esc(c.slug)}">${esc(c.name)}${c.count ? ` (${c.count})` : ""}</option>`).join("")}
          </optgroup>`
        )
        .join("");
    sub.value = state().category || "";
  }

  function syncInputs() {
    const s = state();
    q.value = s.q || "";
    sort.value = s.sort || "newest";
    sub.value = s.category || "";
    form.minPrice.value = s.minPrice || "";
    form.maxPrice.value = s.maxPrice || "";
    form.location.value = s.location || "";
    form.querySelectorAll('input[name="condition"]').forEach((r) => (r.checked = r.value === (s.condition || "")));
    renderCats();
    document.getElementById("saved-link").classList.toggle("btn-secondary", s.favorites === "1");
  }

  async function load() {
    const s = state();
    grid.innerHTML = Array.from({ length: 6 }, () => `<div class="mk-skel"></div>`).join("");
    pager.innerHTML = "";
    countEl.textContent = "";
    try {
      const data = await GP.api(`/api/marketplace/products?${new URLSearchParams(s)}`);
      const filtered = Object.keys(s).some((k) => !["page", "sort"].includes(k));
      countEl.textContent = s.favorites
        ? `${data.total} saved item${data.total === 1 ? "" : "s"}`
        : `${data.total} item${data.total === 1 ? "" : "s"}${filtered ? " match your filters" : " for sale"}`;
      if (!data.items.length) {
        grid.innerHTML = s.favorites
          ? GP.emptyState("fa-heart", "No saved items yet", "Tap the heart on any listing to save it here.", `<a class="btn btn-secondary" href="/marketplace">Browse the marketplace</a>`)
          : filtered
            ? GP.emptyState("fa-magnifying-glass", "No items found", "Try a different search or clear some filters.", `<button class="btn btn-secondary" type="button" data-clear>Clear filters</button>`)
            : GP.emptyState("fa-store", "The marketplace is just getting started", "Be the first to list your console, controller or gaming gear.", `<a class="btn btn-secondary" href="/sell">Sell an item</a>`);
        return;
      }
      grid.innerHTML = data.items.map(GP.productCard).join("");
      if (data.pages > 1) {
        pager.innerHTML = `
          <button class="btn gp-btn-ghost btn-sm" data-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}><i class="fas fa-chevron-left"></i> Previous</button>
          <span>Page ${data.page} of ${data.pages}</span>
          <button class="btn gp-btn-ghost btn-sm" data-page="${data.page + 1}" ${data.page >= data.pages ? "disabled" : ""}>Next <i class="fas fa-chevron-right"></i></button>`;
      }
    } catch (e) {
      if (e.status === 401) {
        grid.innerHTML = GP.emptyState("fa-heart", "Sign in to see saved items", "Your saved items are linked to your account.", `<a class="btn btn-secondary" href="/signin?next=${encodeURIComponent("/marketplace?favorites=1")}">Sign in</a>`);
        return;
      }
      grid.innerHTML = GP.emptyState("fa-triangle-exclamation", "Couldn't load the marketplace", e.message, `<button class="btn btn-secondary" type="button" data-retry>Try again</button>`);
    }
  }

  catsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (b) go({ category: b.dataset.cat });
  });
  sub.addEventListener("change", () => go({ category: sub.value }));
  sort.addEventListener("change", () => go({ sort: sort.value === "newest" ? "" : sort.value }));
  document.getElementById("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    go({ q: q.value.trim() });
  });
  let t;
  q.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => go({ q: q.value.trim() }), 450);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const min = form.minPrice.value;
    const max = form.maxPrice.value;
    if (min && max && Number(min) > Number(max)) return GP.toast("Minimum price is higher than maximum", "error");
    go({ minPrice: min, maxPrice: max, location: form.location.value.trim(), condition: form.querySelector('input[name="condition"]:checked').value });
    document.getElementById("filters").classList.remove("open");
  });
  form.querySelectorAll('input[name="condition"]').forEach((r) => r.addEventListener("change", () => go({ condition: r.value })));
  const clear = () => {
    history.pushState(null, "", "/marketplace");
    syncInputs();
    load();
  };
  document.getElementById("clear-filters").addEventListener("click", clear);
  document.getElementById("filter-toggle").addEventListener("click", () => document.getElementById("filters").classList.toggle("open"));
  grid.addEventListener("click", (e) => {
    if (e.target.closest("[data-clear]")) clear();
    if (e.target.closest("[data-retry]")) load();
  });
  pager.addEventListener("click", (e) => {
    const b = e.target.closest("[data-page]");
    if (!b) return;
    go({ page: b.dataset.page }, { resetPage: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  grid.addEventListener("gp:fav", (e) => {
    if (state().favorites && !e.detail.isFavorite) load();
  });
  window.addEventListener("popstate", () => {
    syncInputs();
    load();
  });
  GP.bindFavorites(grid);

  (async function init() {
    try {
      categories = await GP.api("/api/marketplace/categories");
    } catch {
      categories = [];
    }
    syncInputs();
    load();
    GP.api("/api/marketplace/locations")
      .then((locs) => {
        document.getElementById("loc-list").innerHTML = locs.map((l) => `<option value="${esc(l)}"></option>`).join("");
      })
      .catch(() => {});
  })();
})();
