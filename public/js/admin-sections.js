// Switches between admin sections (Bookings / Marketplace / Advertising / Activity) using the URL hash
(function () {
  const esc = GP.escapeHtml;
  const tabs = document.querySelector(".admin-sections");
  const loaders = {
    marketplace: () => window.AdminMarket?.load(),
    advertising: () => window.AdminAds?.load(),
    activity: loadAudit
  };
  const loaded = new Set();

  function show(section) {
    if (!["bookings", "marketplace", "advertising", "activity"].includes(section)) section = "bookings";
    tabs.querySelectorAll(".gp-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.section === section);
      b.setAttribute("aria-selected", String(b.dataset.section === section));
    });
    document.querySelectorAll("[data-section-panel]").forEach((p) => (p.hidden = p.dataset.sectionPanel !== section));
    if (location.hash !== `#${section}`) history.replaceState(null, "", `#${section}`);
    if (!loaded.has(section) && loaders[section]) {
      loaded.add(section);
      loaders[section]();
    }
  }

  async function loadAudit() {
    const el = document.getElementById("audit");
    el.innerHTML = `<div class="mk-skel" style="height:200px"></div>`;
    try {
      const rows = await GP.api("/api/admin/audit?limit=100");
      if (!rows.length) {
        el.innerHTML = GP.emptyState("fa-clock-rotate-left", "No admin activity yet", "Approvals, declines, price changes and payment checks will be listed here.");
        return;
      }
      el.innerHTML = `<section class="admin-panel"><table class="admin-table">
        <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Details</th></tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>
              <td data-label="When">${esc(GP.date(r.createdAt, true))}</td>
              <td data-label="Admin" class="gp-normal">${esc(r.actor?.email || "system")}</td>
              <td data-label="Action"><span class="gp-pill muted">${esc(r.action)}</span></td>
              <td data-label="Details" class="gp-normal sub">${esc(summarize(r.details))}</td>
            </tr>`
          )
          .join("")}</tbody></table></section>`;
    } catch (e) {
      el.innerHTML = GP.emptyState("fa-triangle-exclamation", "Couldn't load activity", e.message);
    }
  }

  function summarize(d) {
    if (!d || typeof d !== "object") return "";
    return Object.entries(d)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join(" · ")
      .slice(0, 300);
  }

  // Badges with items needing attention
  window.AdminSections = {
    async refreshBadges() {
      try {
        const [mk, ad] = await Promise.all([GP.api("/api/admin/marketplace/overview"), GP.api("/api/admin/ads/overview")]);
        const m = (mk.counts.PENDING_REVIEW || 0) + (mk.openReports || 0);
        const a = (ad.counts.PENDING_APPROVAL || 0) + (ad.pendingPayments || 0);
        const mb = document.getElementById("mk-badge");
        const ab = document.getElementById("ad-badge");
        mb.textContent = m;
        mb.hidden = !m;
        ab.textContent = a;
        ab.hidden = !a;
      } catch {
        /* not fatal */
      }
    }
  };

  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-section]");
    if (b) show(b.dataset.section);
  });

  (async function init() {
    const me = await GP.me();
    if (!me?.user?.isAdmin) return; // admin.js handles the redirect
    tabs.style.display = "";
    show(location.hash.replace("#", ""));
    window.AdminSections.refreshBadges();
  })();
})();
