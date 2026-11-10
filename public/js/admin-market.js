// Admin → Marketplace management
(function () {
  const esc = GP.escapeHtml;
  let root;
  let sub = "listings";
  let statusFilter = "PENDING_REVIEW";
  let search = "";
  let categories = [];

  async function load() {
    root = document.getElementById("mk-admin");
    root.innerHTML = `<div class="mk-skel" style="height:240px"></div>`;
    let ov;
    try {
      ov = await GP.api("/api/admin/marketplace/overview");
    } catch (e) {
      root.innerHTML = GP.emptyState("fa-triangle-exclamation", "Couldn't load the marketplace", e.message);
      return;
    }
    const c = ov.counts;
    root.innerHTML = `
      <div class="gp-stats">
        <div class="gp-stat"><div class="k">Waiting for review</div><div class="v">${c.PENDING_REVIEW || 0}</div></div>
        <div class="gp-stat"><div class="k">Live listings</div><div class="v">${c.ACTIVE || 0}</div></div>
        <div class="gp-stat"><div class="k">Sold</div><div class="v">${c.SOLD || 0}</div></div>
        <div class="gp-stat"><div class="k">Declined / removed</div><div class="v">${(c.DECLINED || 0) + (c.REMOVED || 0)}</div></div>
        <div class="gp-stat"><div class="k">Sellers</div><div class="v">${ov.sellers}${ov.suspendedSellers ? ` <span class="gp-small">(${ov.suspendedSellers} suspended)</span>` : ""}</div></div>
        <div class="gp-stat"><div class="k">Open reports</div><div class="v">${ov.openReports}</div></div>
        <div class="gp-stat"><div class="k">Buyer inquiries</div><div class="v">${ov.inquiries}</div></div>
      </div>
      <div class="admin-toolbar" style="margin:0 0 1.6rem"><div class="hint">GamePro's own products are listed from the seller dashboard, with photos.</div>
        <div class="actions"><a class="btn btn-admin" href="/sell#new"><i class="fas fa-plus"></i> Add product</a></div></div>
      <div class="gp-tabs" role="tablist" aria-label="Marketplace management">
        <button class="gp-tab" data-sub="listings">Listings</button>
        <button class="gp-tab" data-sub="categories">Categories</button>
        <button class="gp-tab" data-sub="sellers">Sellers</button>
        <button class="gp-tab" data-sub="reports">Reports ${ov.openReports ? `<span class="gp-count">${ov.openReports}</span>` : ""}</button>
        <button class="gp-tab" data-sub="recent">Recent activity</button>
      </div>
      <div id="mk-sub"></div>`;
    root.querySelector(".gp-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-sub]");
      if (b) showSub(b.dataset.sub, ov);
    });
    showSub(sub, ov);
  }

  function showSub(s, ov) {
    sub = s;
    root.querySelectorAll("[data-sub]").forEach((b) => b.classList.toggle("active", b.dataset.sub === s));
    ({ listings: renderListings, categories: renderCategories, sellers: renderSellers, reports: renderReports, recent: () => renderRecent(ov) })[s]();
  }

  const subEl = () => document.getElementById("mk-sub");
  const reload = async () => {
    await load();
    window.AdminSections?.refreshBadges();
  };

  // ── Listings ────────────────────────────────────────────
  async function renderListings() {
    const el = subEl();
    el.innerHTML = `
      <div class="admin-toolbar" style="margin:0 0 1.4rem">
        <div class="mk-toolbar" style="margin:0;flex:1">
          <select id="mk-status" aria-label="Filter by status">
            ${[["PENDING_REVIEW", "Waiting for review"], ["ACTIVE", "Live"], ["SOLD", "Sold"], ["DECLINED", "Declined"], ["INACTIVE", "Hidden by seller"], ["REMOVED", "Removed"], ["", "All listings"]]
              .map(([v, l]) => `<option value="${v}" ${v === statusFilter ? "selected" : ""}>${l}</option>`)
              .join("")}
          </select>
          <form class="mk-search" id="mk-search"><i class="fas fa-magnifying-glass"></i><input type="search" placeholder="Search title or seller" value="${esc(search)}" aria-label="Search listings" /></form>
        </div>
      </div>
      <div id="mk-list"><div class="mk-skel" style="height:200px"></div></div>`;
    el.querySelector("#mk-status").addEventListener("change", (e) => {
      statusFilter = e.target.value;
      fetchListings();
    });
    el.querySelector("#mk-search").addEventListener("submit", (e) => {
      e.preventDefault();
      search = e.target.querySelector("input").value.trim();
      fetchListings();
    });
    fetchListings();
  }

  async function fetchListings() {
    const list = document.getElementById("mk-list");
    try {
      const rows = await GP.api(`/api/admin/marketplace/products?${new URLSearchParams({ status: statusFilter, q: search })}`);
      if (!rows.length) {
        list.innerHTML = GP.emptyState("fa-check", statusFilter === "PENDING_REVIEW" ? "Nothing to review" : "No listings", statusFilter === "PENDING_REVIEW" ? "New listings waiting for approval will show up here." : "Try another filter.");
        return;
      }
      list.innerHTML = `<section class="admin-panel"><table class="admin-table">
        <thead><tr><th style="width:36%">Listing</th><th>Seller</th><th>Price</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
        <tbody>${rows
          .map((p) => {
            const acts = [`<a class="btn btn-ghost" href="/marketplace/${esc(p.id)}" target="_blank" rel="noopener">View</a>`];
            if (["PENDING_REVIEW", "DECLINED"].includes(p.status)) acts.push(`<button class="btn" data-pact="approve" data-id="${esc(p.id)}">Approve</button>`);
            if (p.status === "PENDING_REVIEW") acts.push(`<button class="btn btn-ghost" data-pact="decline" data-id="${esc(p.id)}">Decline</button>`);
            if (p.status !== "REMOVED") acts.push(`<button class="btn btn-ghost" data-pact="remove" data-id="${esc(p.id)}">Remove</button>`);
            if (p.status === "REMOVED") acts.push(`<button class="btn btn-ghost" data-pact="restore" data-id="${esc(p.id)}">Restore</button>`);
            return `<tr>
              <td data-label="Listing"><div style="display:flex;gap:1rem;align-items:center">
                <img src="${esc(p.imageUrl || "/images/market/controller.svg")}" alt="" style="width:64px;height:52px;object-fit:cover;border-radius:.8rem;flex:0 0 auto" loading="lazy" />
                <div class="cell-title"><div class="name gp-normal">${esc(p.title)}</div>
                <div class="sub">${esc(p.category)} · ${p.condition === "NEW" ? "New" : "Used"} · ${esc(GP.timeAgo(p.updatedAt))}${p.openReports ? ` · <span style="color:#fca5a5"><i class="fas fa-flag"></i> ${p.openReports} report(s)</span>` : ""}</div>
                ${p.declineReason ? `<div class="sub gp-normal" style="color:#fca5a5">${esc(p.declineReason)}</div>` : ""}</div></div></td>
              <td data-label="Seller"><div class="gp-normal">${esc(p.seller.displayName)}</div><div class="sub gp-normal">${esc(p.seller.email)}${p.seller.status === "SUSPENDED" ? " · suspended" : ""}</div></td>
              <td data-label="Price">${esc(GP.money(p.price, p.currency))}</td>
              <td data-label="Status">${GP.pill(p.status)}</td>
              <td data-label="Actions"><div class="row-actions">${acts.join("")}</div></td>
            </tr>`;
          })
          .join("")}</tbody></table></section>`;
    } catch (e) {
      list.innerHTML = GP.emptyState("fa-triangle-exclamation", "Couldn't load listings", e.message);
    }
  }

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-pact]");
    if (!b || !root?.contains(b)) return;
    const action = b.dataset.pact;
    let reason = null;
    if (action === "decline" || action === "remove") {
      reason = await GP.prompt(action === "decline" ? "Decline listing" : "Remove listing", {
        label: "Reason (sent to the seller)",
        placeholder: action === "decline" ? "e.g. Photos don't show the actual item" : "e.g. Prohibited item",
        required: true,
        confirmLabel: action === "decline" ? "Decline" : "Remove",
        danger: true
      });
      if (reason == null) return;
    }
    GP.setLoading(b, true, "");
    try {
      await GP.api(`/api/admin/marketplace/products/${encodeURIComponent(b.dataset.id)}/${action}`, { method: "POST", body: { reason } });
      GP.toast(`Listing ${action === "approve" ? "approved" : action === "decline" ? "declined" : action === "remove" ? "removed" : "restored"}`, "success");
      await reload();
    } catch (err) {
      GP.toast(err.message, "error");
      GP.setLoading(b, false);
    }
  });

  // ── Categories ──────────────────────────────────────────
  async function renderCategories() {
    const el = subEl();
    el.innerHTML = `<div class="mk-skel" style="height:200px"></div>`;
    try {
      categories = await GP.api("/api/admin/marketplace/categories");
    } catch (e) {
      el.innerHTML = GP.emptyState("fa-triangle-exclamation", "Couldn't load categories", e.message);
      return;
    }
    const top = categories.filter((c) => !c.parentId);
    const row = (c, child) => `<tr>
      <td data-label="Category"><div class="cell-title"><div class="name" style="${child ? "padding-left:2.4rem;font-weight:600;font-size:1.4rem" : ""}"><span style="color:var(--gp-accent);margin-right:.6rem">${GP.icon(c.icon)}</span>${esc(c.name)}</div></div></td>
      <td data-label="Listings">${c._count.products}</td>
      <td data-label="Order">${c.sortOrder}</td>
      <td data-label="Status">${c.isActive ? GP.pill("ACTIVE") : `<span class="gp-pill muted">Disabled</span>`}</td>
      <td data-label="Actions"><div class="row-actions">
        ${!child ? `<button class="btn btn-ghost" data-cat-add="${esc(c.id)}">+ Subcategory</button>` : ""}
        <button class="btn btn-ghost" data-cat-edit="${esc(c.id)}">Edit</button>
        <button class="btn btn-ghost" data-cat-toggle="${esc(c.id)}">${c.isActive ? "Disable" : "Enable"}</button>
        ${!c._count.products && !c._count.children ? `<button class="btn btn-ghost" data-cat-del="${esc(c.id)}" aria-label="Delete"><i class="fas fa-trash"></i></button>` : ""}
      </div></td></tr>`;
    el.innerHTML = `
      <div class="admin-toolbar" style="margin:0 0 1.4rem"><div class="hint">Disabled categories are hidden from sellers and buyers. Categories with listings can't be deleted.</div>
        <div class="actions"><button class="btn btn-admin" data-cat-add="">+ Main category</button></div></div>
      <section class="admin-panel"><table class="admin-table">
        <thead><tr><th style="width:40%">Category</th><th>Listings</th><th>Order</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
        <tbody>${top.map((t) => row(t, false) + categories.filter((c) => c.parentId === t.id).map((c) => row(c, true)).join("")).join("")}</tbody>
      </table></section>`;
    el.onclick = async (e) => {
      const add = e.target.closest("[data-cat-add]");
      const edit = e.target.closest("[data-cat-edit]");
      const toggle = e.target.closest("[data-cat-toggle]");
      const del = e.target.closest("[data-cat-del]");
      try {
        if (add || edit) {
          const cat = edit ? categories.find((c) => c.id === edit.dataset.catEdit) : { parentId: add.dataset.catAdd || null, icon: "fa-gamepad", sortOrder: 0 };
          const r = await GP.modal({
            title: edit ? "Edit category" : cat.parentId ? "New subcategory" : "New main category",
            html: `<label class="gp-label" for="c-name">Name</label><input id="c-name" name="name" maxlength="60" value="${esc(cat.name || "")}" />
                   <label class="gp-label" for="c-icon">Icon (Font Awesome name)</label><input id="c-icon" name="icon" maxlength="40" value="${esc(cat.icon)}" placeholder="fa-gamepad" />
                   <label class="gp-label" for="c-sort">Display order</label><input id="c-sort" name="sortOrder" type="number" min="0" max="999" value="${cat.sortOrder}" />
                   <p class="gp-field-error" hidden></p>`,
            actions: [
              { label: "Cancel", value: null },
              {
                label: "Save",
                value: "save",
                kind: "primary",
                validate: (f) => {
                  const ok = f.name.value.trim().length >= 2 && /^fa-[a-z0-9-]+$/.test(f.icon.value.trim());
                  const er = f.querySelector(".gp-field-error");
                  er.textContent = "Enter a name (2+ characters) and an icon like fa-gamepad";
                  er.hidden = ok;
                  return ok;
                }
              }
            ]
          });
          if (r.value !== "save") return;
          const body = { name: r.form.name.value.trim(), icon: r.form.icon.value.trim(), sortOrder: Number(r.form.sortOrder.value || 0) };
          if (edit) await GP.api(`/api/admin/marketplace/categories/${encodeURIComponent(cat.id)}`, { method: "PATCH", body });
          else await GP.api("/api/admin/marketplace/categories", { method: "POST", body: { ...body, parentId: cat.parentId } });
          GP.toast("Category saved", "success");
        } else if (toggle) {
          const c = categories.find((x) => x.id === toggle.dataset.catToggle);
          await GP.api(`/api/admin/marketplace/categories/${encodeURIComponent(c.id)}`, { method: "PATCH", body: { isActive: !c.isActive } });
          GP.toast(c.isActive ? "Category disabled" : "Category enabled", "success");
        } else if (del) {
          const c = categories.find((x) => x.id === del.dataset.catDel);
          if (!(await GP.confirm("Delete category?", `"${c.name}" will be deleted.`, { confirmLabel: "Delete", danger: true }))) return;
          await GP.api(`/api/admin/marketplace/categories/${encodeURIComponent(c.id)}`, { method: "DELETE" });
          GP.toast("Category deleted", "success");
        } else return;
        renderCategories();
      } catch (err) {
        GP.toast(err.message, "error");
      }
    };
  }

  // ── Sellers ─────────────────────────────────────────────
  async function renderSellers() {
    const el = subEl();
    el.innerHTML = `<div class="mk-skel" style="height:200px"></div>`;
    try {
      const rows = await GP.api("/api/admin/marketplace/sellers");
      if (!rows.length) {
        el.innerHTML = GP.emptyState("fa-store", "No sellers yet", "Sellers appear here once they set up a seller profile.");
        return;
      }
      el.innerHTML = `<section class="admin-panel"><table class="admin-table">
        <thead><tr><th>Seller</th><th>Contact</th><th>Listings</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
        <tbody>${rows
          .map(
            (s) => `<tr>
            <td data-label="Seller"><div class="cell-title"><div class="name gp-normal">${esc(s.displayName)}</div><div class="sub">${s.type === "STORE" ? "Store" : "Individual"} · ${esc(s.location)} · since ${esc(GP.date(s.createdAt))}</div></div></td>
            <td data-label="Contact"><div class="gp-normal">${esc(s.email)}</div><div class="sub">${esc(s.phone)}</div></td>
            <td data-label="Listings">${s.activeListings} live · ${s.soldListings} sold · ${s.listings} total</td>
            <td data-label="Status">${GP.pill(s.status)}</td>
            <td data-label="Actions"><div class="row-actions">${
              s.status === "ACTIVE"
                ? `<button class="btn btn-ghost" data-seller="${esc(s.id)}" data-to="SUSPENDED">Suspend</button>`
                : `<button class="btn" data-seller="${esc(s.id)}" data-to="ACTIVE">Reactivate</button>`
            }</div></td></tr>`
          )
          .join("")}</tbody></table></section>`;
      el.onclick = async (e) => {
        const b = e.target.closest("[data-seller]");
        if (!b) return;
        let reason = null;
        if (b.dataset.to === "SUSPENDED") {
          reason = await GP.prompt("Suspend seller", { label: "Reason (sent to the seller). All their listings will be hidden.", required: true, confirmLabel: "Suspend", danger: true });
          if (reason == null) return;
        }
        try {
          await GP.api(`/api/admin/marketplace/sellers/${encodeURIComponent(b.dataset.seller)}/status`, { method: "POST", body: { status: b.dataset.to, reason } });
          GP.toast("Seller updated", "success");
          renderSellers();
        } catch (err) {
          GP.toast(err.message, "error");
        }
      };
    } catch (e) {
      el.innerHTML = GP.emptyState("fa-triangle-exclamation", "Couldn't load sellers", e.message);
    }
  }

  // ── Reports ─────────────────────────────────────────────
  async function renderReports(status = "OPEN") {
    const el = subEl();
    el.innerHTML = `<div class="mk-skel" style="height:200px"></div>`;
    try {
      const rows = await GP.api(`/api/admin/marketplace/reports?status=${status}`);
      el.innerHTML = `
        <div class="admin-toolbar" style="margin:0 0 1.4rem"><div class="gp-choice">
          ${["OPEN", "RESOLVED", "DISMISSED"].map((s) => `<label><input type="radio" name="rep-status" value="${s}" ${s === status ? "checked" : ""} /><span>${GP.label(s)}</span></label>`).join("")}
        </div></div>
        ${
          rows.length
            ? `<div class="gp-notes">${rows
                .map(
                  (r) => `<div class="gp-note ${r.status === "OPEN" ? "unread" : ""}">
                    <div class="ic"><i class="fas fa-flag"></i></div>
                    <div><h4>${esc(r.reason)} · <a href="/marketplace/${esc(r.product.id)}" target="_blank" rel="noopener" style="color:var(--gp-accent)" class="gp-normal">${esc(r.product.title)}</a> ${GP.pill(r.product.status)}</h4>
                      ${r.details ? `<p>${esc(r.details)}</p>` : ""}
                      <p class="gp-small gp-normal">${esc(r.reporter?.email || "Guest")} · ${esc(GP.timeAgo(r.createdAt))}</p></div>
                    <div class="row-actions">${
                      r.status === "OPEN"
                        ? `${r.product.status !== "REMOVED" ? `<button class="btn btn-ghost" data-rep-remove="${esc(r.id)}" data-product="${esc(r.product.id)}">Remove listing</button>` : ""}
                           <button class="btn" data-rep="${esc(r.id)}" data-to="RESOLVED">Resolved</button>
                           <button class="btn btn-ghost" data-rep="${esc(r.id)}" data-to="DISMISSED">Dismiss</button>`
                        : ""
                    }</div></div>`
                )
                .join("")}</div>`
            : GP.emptyState("fa-flag", status === "OPEN" ? "No open reports" : "Nothing here", "Reports from buyers about listings appear here.")
        }`;
      el.querySelectorAll('[name="rep-status"]').forEach((r) => r.addEventListener("change", () => renderReports(r.value)));
      el.onclick = async (e) => {
        const rm = e.target.closest("[data-rep-remove]");
        const b = e.target.closest("[data-rep]");
        try {
          if (rm) {
            const reason = await GP.prompt("Remove listing", { label: "Reason (sent to the seller)", required: true, confirmLabel: "Remove", danger: true });
            if (reason == null) return;
            await GP.api(`/api/admin/marketplace/products/${encodeURIComponent(rm.dataset.product)}/remove`, { method: "POST", body: { reason } });
            await GP.api(`/api/admin/marketplace/reports/${encodeURIComponent(rm.dataset.repRemove)}`, { method: "POST", body: { status: "RESOLVED" } });
            GP.toast("Listing removed and report resolved", "success");
          } else if (b) {
            await GP.api(`/api/admin/marketplace/reports/${encodeURIComponent(b.dataset.rep)}`, { method: "POST", body: { status: b.dataset.to } });
            GP.toast("Report updated", "success");
          } else return;
          await reload();
        } catch (err) {
          GP.toast(err.message, "error");
        }
      };
    } catch (e) {
      el.innerHTML = GP.emptyState("fa-triangle-exclamation", "Couldn't load reports", e.message);
    }
  }

  function renderRecent(ov) {
    const el = subEl();
    if (!ov.activity.length) {
      el.innerHTML = GP.emptyState("fa-clock-rotate-left", "No marketplace activity yet", "Approvals, removals and category changes will appear here.");
      return;
    }
    el.innerHTML = `<div class="gp-notes">${ov.activity
      .map(
        (a) => `<div class="gp-note"><div class="ic"><i class="fas fa-user-shield"></i></div>
          <div><h4>${esc(a.action)}</h4><p class="gp-normal">${esc(a.details?.title || a.details?.name || "")}${a.details?.reason ? ` · ${esc(a.details.reason)}` : ""}</p><p class="gp-small gp-normal">${esc(a.actor?.email || "system")}</p></div>
          <span class="gp-small">${esc(GP.timeAgo(a.createdAt))}</span></div>`
      )
      .join("")}</div>`;
  }

  window.AdminMarket = { load };
})();
