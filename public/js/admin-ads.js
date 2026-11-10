// Admin → Advertising management
(function () {
  const esc = GP.escapeHtml;
  let root;
  let sub = "ads";
  let statusFilter = "PENDING_APPROVAL";
  let ov = null;
  let adsCache = [];

  async function load() {
    root = document.getElementById("ad-admin");
    root.innerHTML = `<div class="mk-skel" style="height:240px"></div>`;
    try {
      ov = await GP.api("/api/admin/ads/overview");
    } catch (e) {
      root.innerHTML = GP.emptyState("fa-triangle-exclamation", "Couldn't load advertising", e.message);
      return;
    }
    const c = ov.counts;
    const ps = ov.paymentSetup;
    root.innerHTML = `
      ${
        !ps.online && !ps.manual
          ? `<div class="mk-notice warn"><i class="fas fa-triangle-exclamation"></i><div><b>No payment method is set up.</b> Advertisers can submit ads but can't pay yet. Add <code>FLW_SECRET_KEY</code> (Flutterwave: Mobile Money &amp; cards) and/or <code>MANUAL_PAYMENT_INSTRUCTIONS</code> (MoMo transfer verified by an admin) in Vercel's environment variables.</div></div>`
          : !ps.online
            ? `<div class="mk-notice info"><i class="fas fa-circle-info"></i><div>Online payment (Flutterwave) isn't configured, so advertisers pay by Mobile Money transfer and you verify each payment under <b>Payments</b>.</div></div>`
            : ""
      }
      <div class="gp-stats">
        <div class="gp-stat"><div class="k">Total ads</div><div class="v">${ov.total}</div></div>
        <div class="gp-stat"><div class="k">Live now</div><div class="v">${c.ACTIVE || 0}</div></div>
        <div class="gp-stat"><div class="k">Awaiting approval</div><div class="v">${c.PENDING_APPROVAL || 0}</div></div>
        <div class="gp-stat"><div class="k">Payments to check</div><div class="v">${ov.pendingPayments}</div></div>
        <div class="gp-stat"><div class="k">Declined</div><div class="v">${c.DECLINED || 0}</div></div>
        <div class="gp-stat"><div class="k">Expired</div><div class="v">${c.EXPIRED || 0}</div></div>
        <div class="gp-stat"><div class="k">Revenue</div><div class="v" style="font-size:1.9rem">${esc(GP.money(ov.revenue, ov.currency))}</div>${ov.refunded ? `<div class="gp-small">${esc(GP.money(ov.refunded, ov.currency))} refunded</div>` : ""}</div>
      </div>
      <div class="gp-tabs" role="tablist" aria-label="Advertising management">
        <button class="gp-tab" data-asub="ads">Advertisements</button>
        <button class="gp-tab" data-asub="payments">Payments ${ov.pendingPayments ? `<span class="gp-count">${ov.pendingPayments}</span>` : ""}</button>
        <button class="gp-tab" data-asub="packages">Packages &amp; pricing</button>
        <button class="gp-tab" data-asub="analytics">Analytics</button>
      </div>
      <div id="ad-sub"></div>`;
    root.querySelector(".gp-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-asub]");
      if (b) showSub(b.dataset.asub);
    });
    showSub(sub);
  }

  function showSub(s) {
    sub = s;
    root.querySelectorAll("[data-asub]").forEach((b) => b.classList.toggle("active", b.dataset.asub === s));
    ({ ads: renderAds, payments: renderPayments, packages: renderPackages, analytics: renderAnalytics })[s]();
  }
  const subEl = () => document.getElementById("ad-sub");
  const reload = async () => {
    await load();
    window.AdminSections?.refreshBadges();
  };

  // ── Advertisements ──────────────────────────────────────
  const STATUSES = [
    ["PENDING_APPROVAL", "Awaiting approval"],
    ["PAYMENT_PENDING_VERIFICATION", "Payment being verified"],
    ["PENDING_PAYMENT", "Awaiting payment"],
    ["ACTIVE", "Live"],
    ["APPROVED", "Approved (queued)"],
    ["SUSPENDED", "Suspended"],
    ["DECLINED", "Declined"],
    ["EXPIRED", "Expired"],
    ["DRAFT", "Drafts"],
    ["", "All advertisements"]
  ];

  function adActions(a) {
    const b = (act, label, kind = "btn-ghost") => `<button class="btn ${kind}" data-aact="${act}" data-id="${esc(a.id)}">${label}</button>`;
    const acts = [b("preview", "Preview")];
    if (a.status === "PENDING_APPROVAL") acts.push(b("approve", "Approve", ""), b("decline", "Decline"));
    if (["DRAFT", "PENDING_PAYMENT", "PAYMENT_PENDING_VERIFICATION", "APPROVED"].includes(a.status)) acts.push(b("decline", "Decline"));
    if (["ACTIVE", "APPROVED"].includes(a.status)) acts.push(b("suspend", "Suspend"));
    if (a.status === "SUSPENDED") acts.push(b("resume", "Resume", ""));
    if (["ACTIVE", "SUSPENDED", "APPROVED", "PENDING_APPROVAL", "EXPIRED"].includes(a.status)) acts.push(b("extend", "Extend"));
    acts.push(b("edit", "Edit"), b("payments", "Payments"), `<button class="btn btn-ghost" data-aact="delete" data-id="${esc(a.id)}" aria-label="Delete"><i class="fas fa-trash"></i></button>`);
    return acts.join("");
  }

  async function renderAds() {
    const el = subEl();
    el.innerHTML = `
      <div class="admin-toolbar" style="margin:0 0 1.4rem"><div class="mk-toolbar" style="margin:0">
        <select id="ad-status" aria-label="Filter by status">${STATUSES.map(([v, l]) => `<option value="${v}" ${v === statusFilter ? "selected" : ""}>${l}</option>`).join("")}</select>
      </div></div>
      <div id="ad-list"><div class="mk-skel" style="height:200px"></div></div>`;
    el.querySelector("#ad-status").addEventListener("change", (e) => {
      statusFilter = e.target.value;
      fetchAds();
    });
    fetchAds();
  }

  async function fetchAds() {
    const list = document.getElementById("ad-list");
    try {
      adsCache = await GP.api(`/api/admin/ads?status=${encodeURIComponent(statusFilter)}`);
      if (!adsCache.length) {
        list.innerHTML = GP.emptyState("fa-bullhorn", statusFilter === "PENDING_APPROVAL" ? "Nothing waiting for approval" : "No advertisements", "Paid advertisements that need review show up here.");
        return;
      }
      list.innerHTML = `<section class="admin-panel"><table class="admin-table">
        <thead><tr><th style="width:32%">Advertisement</th><th>Package &amp; payment</th><th>Status</th><th>Schedule</th><th style="text-align:right">Actions</th></tr></thead>
        <tbody>${adsCache
          .map((a) => {
            const lastPay = a.payments[0];
            return `<tr>
              <td data-label="Advertisement"><div style="display:flex;gap:1rem;align-items:center">
                <img src="${esc(a.bannerUrl || "/images/market/service.svg")}" alt="" style="width:80px;height:45px;object-fit:cover;border-radius:.6rem;flex:0 0 auto" loading="lazy" />
                <div class="cell-title"><div class="name gp-normal">${esc(a.title)}</div><div class="sub gp-normal">${esc(a.businessName)} · ${esc(a.ownerEmail)}</div>
                ${a.declineReason && a.status === "DECLINED" ? `<div class="sub gp-normal" style="color:#fca5a5">${esc(a.declineReason)}</div>` : ""}</div></div></td>
              <td data-label="Package & payment"><div>${esc(a.packageName)} · ${esc(GP.money(a.amount, a.currency))}</div>
                <div class="sub">${a.amount === 0 ? "Free" : lastPay ? `${GP.pill(lastPay.status)} ${lastPay.provider === "MANUAL" ? "MoMo transfer" : "Online"}` : "No payment yet"}</div></td>
              <td data-label="Status">${GP.pill(a.status)}<div class="sub" style="margin-top:.4rem">Submitted ${esc(GP.date(a.submittedAt || a.createdAt))}</div></td>
              <td data-label="Schedule"><div>${a.durationDays} days</div><div class="sub">${a.endsAt ? `${esc(GP.date(a.startsAt))} → ${esc(GP.date(a.endsAt))}` : a.preferredStartDate ? `Wants to start ${esc(GP.date(a.preferredStartDate))}` : "Starts on approval"}</div>
                ${a.impressions ? `<div class="sub">${a.impressions} views · ${a.clicks} clicks · ${a.ctr}%</div>` : ""}</td>
              <td data-label="Actions"><div class="row-actions">${adActions(a)}</div></td></tr>`;
          })
          .join("")}</tbody></table></section>`;
    } catch (e) {
      list.innerHTML = GP.emptyState("fa-triangle-exclamation", "Couldn't load advertisements", e.message);
    }
  }

  async function adAction(btn) {
    const a = adsCache.find((x) => x.id === btn.dataset.id);
    if (!a) return;
    const act = btn.dataset.aact;
    const url = `/api/admin/ads/${encodeURIComponent(a.id)}`;
    if (act === "preview") {
      return GP.modal({
        title: "Advertisement preview",
        html: `<div style="max-width:320px;margin:0 auto">${GP.adCard({ ...a, hasLink: !!a.linkUrl }, { preview: true })}</div>
               <p class="gp-small gp-normal" style="text-align:center">${a.linkUrl ? `Links to <a href="${esc(a.linkUrl)}" target="_blank" rel="noopener noreferrer nofollow" style="color:var(--gp-accent)">${esc(a.linkUrl)}</a>` : `No website (button calls ${esc(a.phone)})`}</p>
               <p class="gp-small gp-normal" style="text-align:center">Contact: ${esc(a.contactName)} · ${esc(a.email)} · ${esc(a.phone)}${a.location ? ` · ${esc(a.location)}` : ""}</p>`
      });
    }
    if (act === "payments") {
      const rows = a.payments.length
        ? `<table class="mk-specs"><tr><th>Reference</th><th>Status</th></tr>${a.payments
            .map((p) => `<tr><td class="gp-normal">${esc(p.txRef)}<div class="gp-small">${p.provider === "MANUAL" ? `MoMo ID ${esc(p.payerReference || "—")}` : `Online${p.method ? ` · ${esc(p.method)}` : ""}`} · ${esc(GP.money(p.amount, p.currency))} · ${esc(GP.date(p.createdAt, true))}</div>${p.failureReason ? `<div class="gp-small gp-normal">${esc(p.failureReason)}</div>` : ""}</td><td>${GP.pill(p.status)}${p.paidAt ? `<div class="gp-small">Paid ${esc(GP.date(p.paidAt, true))}</div>` : ""}</td></tr>`)
            .join("")}</table>`
        : `<p class="gp-muted">No payment attempts yet.</p>`;
      return GP.modal({ title: `Payments · ${a.title}`, html: rows, wide: true });
    }
    try {
      if (act === "approve") {
        if (!(await GP.confirm("Approve advertisement?", `"${a.title}" will go live on the homepage${a.preferredStartDate && new Date(a.preferredStartDate) > new Date() ? ` on ${GP.date(a.preferredStartDate)}` : " now (or as soon as a slot is free)"} for ${a.durationDays} days.`, { confirmLabel: "Approve" }))) return;
        const r = await GP.api(`${url}/approve`, { method: "POST" });
        GP.toast(r.status === "ACTIVE" ? "Approved. The ad is live." : "Approved. It's queued for the next free slot or its start date.", "success");
      } else if (act === "decline") {
        const paid = a.paidAmount > 0;
        const reason = await GP.prompt("Decline advertisement", { label: `Reason (sent to the advertiser)${paid ? ". They already paid, so arrange a refund or credit, then mark the payment as refunded under Payments." : ""}`, required: true, confirmLabel: "Decline", danger: true });
        if (reason == null) return;
        await GP.api(`${url}/decline`, { method: "POST", body: { reason } });
        GP.toast("Advertisement declined", "success");
      } else if (act === "suspend") {
        const reason = await GP.prompt("Suspend advertisement", { label: "Reason (optional, sent to the advertiser)", confirmLabel: "Suspend", danger: true });
        if (reason == null) return;
        await GP.api(`${url}/suspend`, { method: "POST", body: { reason: reason || null } });
        GP.toast("Advertisement suspended", "success");
      } else if (act === "resume") {
        const r = await GP.api(`${url}/resume`, { method: "POST" });
        GP.toast(`Resumed (${GP.label(r.status)})`, "success");
      } else if (act === "extend") {
        const days = await GP.prompt("Extend advertisement", { label: "Add how many days?", multiline: false, type: "number", value: "7", required: true, confirmLabel: "Extend" });
        if (days == null) return;
        await GP.api(`${url}/extend`, { method: "POST", body: { days: Number(days) } });
        GP.toast(`Extended by ${days} day(s)`, "success");
      } else if (act === "edit") {
        const r = await GP.modal({
          title: "Edit advertisement",
          wide: true,
          html: `<div class="gp-form" style="display:grid;gap:1rem">
            <div class="gp-row"><div><label class="gp-label">Business name</label><input name="businessName" maxlength="80" value="${esc(a.businessName)}" /></div>
              <div><label class="gp-label">Location</label><input name="location" maxlength="80" value="${esc(a.location || "")}" /></div></div>
            <div><label class="gp-label">Headline</label><input name="title" maxlength="60" value="${esc(a.title)}" /></div>
            <div><label class="gp-label">Message</label><textarea name="message" rows="3" maxlength="200">${esc(a.message)}</textarea></div>
            <div class="gp-row"><div><label class="gp-label">Button text</label><input name="ctaLabel" maxlength="24" value="${esc(a.ctaLabel)}" /></div>
              <div><label class="gp-label">Link</label><input name="linkUrl" maxlength="500" value="${esc(a.linkUrl || "")}" /></div></div>
            <div class="gp-row"><div><label class="gp-label">Contact person</label><input name="contactName" maxlength="80" value="${esc(a.contactName)}" /></div>
              <div><label class="gp-label">Phone</label><input name="phone" maxlength="20" value="${esc(a.phone)}" /></div></div>
            <div><label class="gp-label">Email</label><input name="email" type="email" maxlength="120" value="${esc(a.email)}" /></div></div>`,
          actions: [{ label: "Cancel", value: null }, { label: "Save", value: "save", kind: "primary" }]
        });
        if (r.value !== "save") return;
        const f = r.form;
        await GP.api(url, {
          method: "PATCH",
          body: {
            businessName: f.businessName.value.trim(),
            location: f.location.value.trim() || null,
            title: f.title.value.trim(),
            message: f.message.value.trim(),
            ctaLabel: f.ctaLabel.value.trim() || "Learn More",
            linkUrl: f.linkUrl.value.trim() || null,
            contactName: f.contactName.value.trim(),
            phone: f.phone.value.trim(),
            email: f.email.value.trim()
          }
        });
        GP.toast("Advertisement updated", "success");
      } else if (act === "delete") {
        if (!(await GP.confirm("Delete advertisement?", `"${a.title}" will be deleted permanently. Its payment records are kept for your revenue history.`, { confirmLabel: "Delete", danger: true }))) return;
        await GP.api(url, { method: "DELETE" });
        GP.toast("Advertisement deleted", "success");
      } else return;
      await reload();
    } catch (err) {
      GP.toast(err.message, "error");
    }
  }

  // ── Payments ────────────────────────────────────────────
  async function renderPayments(status = "PENDING") {
    const el = subEl();
    el.innerHTML = `<div class="mk-skel" style="height:200px"></div>`;
    try {
      const rows = await GP.api(`/api/admin/ads/payments?status=${status}`);
      el.innerHTML = `
        <div class="admin-toolbar" style="margin:0 0 1.4rem"><div class="gp-choice">
          ${["PENDING", "SUCCESSFUL", "FAILED", "CANCELLED", "REFUNDED", ""].map((s) => `<label><input type="radio" name="pay-status" value="${s}" ${s === status ? "checked" : ""} /><span>${s ? GP.label(s) : "All"}</span></label>`).join("")}
        </div></div>
        ${
          rows.length
            ? `<section class="admin-panel"><table class="admin-table">
              <thead><tr><th>Payment</th><th>Advertisement</th><th>Amount</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
              <tbody>${rows
                .map((p) => {
                  const acts = [];
                  if (p.provider === "MANUAL" && p.status === "PENDING") acts.push(`<button class="btn" data-pay-act="approve" data-id="${esc(p.id)}">Confirm received</button>`, `<button class="btn btn-ghost" data-pay-act="reject" data-id="${esc(p.id)}">Not received</button>`);
                  if (p.provider === "FLUTTERWAVE" && p.status === "PENDING") acts.push(`<button class="btn btn-ghost" data-pay-act="recheck" data-id="${esc(p.id)}">Re-check</button>`);
                  if (p.status === "SUCCESSFUL") acts.push(`<button class="btn btn-ghost" data-pay-act="refund" data-id="${esc(p.id)}">Mark refunded</button>`);
                  return `<tr>
                    <td data-label="Payment"><div class="cell-title"><div class="name gp-normal" style="font-size:1.35rem">${esc(p.txRef)}</div>
                      <div class="sub">${p.provider === "MANUAL" ? `MoMo transfer · ID <b class="gp-normal">${esc(p.payerReference || "—")}</b>` : `Online${p.method ? ` · ${esc(p.method)}` : ""}${p.providerTransactionId ? ` · #${esc(p.providerTransactionId)}` : ""}`}</div>
                      <div class="sub">${esc(GP.date(p.createdAt, true))}${p.verifiedByEmail ? ` · verified by ${esc(p.verifiedByEmail)}` : ""}</div></div></td>
                    <td data-label="Advertisement">${p.ad ? `<div class="gp-normal">${esc(p.ad.title)}</div><div class="sub gp-normal">${esc(p.ad.businessName)} · ${esc(p.payerEmail || "")}</div>` : `<span class="sub">Deleted advertisement</span>`}</td>
                    <td data-label="Amount">${esc(GP.money(p.amount, p.currency))}${p.paidAt ? `<div class="sub">Paid ${esc(GP.date(p.paidAt, true))}</div>` : ""}</td>
                    <td data-label="Status">${GP.pill(p.status)}${p.failureReason ? `<div class="sub gp-normal">${esc(p.failureReason)}</div>` : ""}</td>
                    <td data-label="Actions"><div class="row-actions">${acts.join("")}</div></td></tr>`;
                })
                .join("")}</tbody></table></section>`
            : GP.emptyState("fa-receipt", status === "PENDING" ? "No payments to check" : "No payments", "Payment records for advertisements appear here.")
        }`;
      el.querySelectorAll('[name="pay-status"]').forEach((r) => r.addEventListener("change", () => renderPayments(r.value)));
      el.onclick = async (e) => {
        const b = e.target.closest("[data-pay-act]");
        if (!b) return;
        const act = b.dataset.payAct;
        const url = `/api/admin/ads/payments/${encodeURIComponent(b.dataset.id)}`;
        try {
          if (act === "approve") {
            if (!(await GP.confirm("Confirm payment received?", "Only confirm after you've found this transaction ID with the right amount on the GamePro Mobile Money statement.", { confirmLabel: "Yes, received" }))) return;
            await GP.api(`${url}/verify`, { method: "POST", body: { decision: "approve" } });
            GP.toast("Payment confirmed. The ad is now awaiting approval.", "success");
          } else if (act === "reject") {
            const note = await GP.prompt("Payment not received", { label: "Note for the advertiser", placeholder: "We couldn't find this transaction ID on our statement", confirmLabel: "Reject", danger: true });
            if (note == null) return;
            await GP.api(`${url}/verify`, { method: "POST", body: { decision: "reject", note: note || null } });
            GP.toast("Payment rejected", "success");
          } else if (act === "recheck") {
            const r = await GP.api(`${url}/recheck`, { method: "POST" });
            GP.toast(`Provider says: ${r.result}`, "info");
          } else if (act === "refund") {
            const note = await GP.prompt("Mark as refunded", { label: "Refund note (e.g. how and when it was refunded)", confirmLabel: "Mark refunded" });
            if (note == null) return;
            await GP.api(`${url}/refund`, { method: "POST", body: { note: note || null } });
            GP.toast("Marked as refunded", "success");
          }
          await reload();
        } catch (err) {
          GP.toast(err.message, "error");
        }
      };
    } catch (e) {
      el.innerHTML = GP.emptyState("fa-triangle-exclamation", "Couldn't load payments", e.message);
    }
  }

  // ── Packages & placements ───────────────────────────────
  async function renderPackages() {
    const el = subEl();
    el.innerHTML = `<div class="mk-skel" style="height:200px"></div>`;
    let data;
    try {
      data = await GP.api("/api/admin/ads/packages");
    } catch (e) {
      el.innerHTML = GP.emptyState("fa-triangle-exclamation", "Couldn't load packages", e.message);
      return;
    }
    const { packages, placements } = data;
    el.innerHTML = `
      <div class="admin-toolbar" style="margin:0 0 1.4rem"><div class="hint">Advertisers only see packages that are switched on. Changing a price doesn't affect ads that were already submitted.</div>
        <div class="actions"><button class="btn btn-admin" data-pkg-new>+ New package</button></div></div>
      ${packages.some((p) => !p.isActive) && !packages.some((p) => p.isActive) ? `<div class="mk-notice warn"><i class="fas fa-tags"></i><div>No package is on sale yet. Set a price on each package and switch it on to open advertising.</div></div>` : ""}
      <section class="admin-panel"><table class="admin-table">
        <thead><tr><th>Package</th><th>Placement</th><th>Duration</th><th>Price</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
        <tbody>${packages
          .map(
            (p) => `<tr>
            <td data-label="Package"><div class="cell-title"><div class="name">${esc(p.name)} ${p.isFeatured ? `<span class="gp-pill wait">Featured</span>` : ""}</div><div class="sub gp-normal">${esc(p.description || "")}</div></div></td>
            <td data-label="Placement">${esc(p.placement.name)}</td>
            <td data-label="Duration">${p.durationDays} days</td>
            <td data-label="Price">${p.price ? esc(GP.money(p.price, p.currency)) : `<span class="sub">Not set</span>`}</td>
            <td data-label="Status">${p.isActive ? GP.pill("ACTIVE") : `<span class="gp-pill muted">Off</span>`}<div class="sub">${p._count.ads} ad(s) sold</div></td>
            <td data-label="Actions"><div class="row-actions">
              <button class="btn btn-ghost" data-pkg-edit="${esc(p.id)}">Edit</button>
              <button class="btn ${p.isActive ? "btn-ghost" : ""}" data-pkg-toggle="${esc(p.id)}">${p.isActive ? "Switch off" : "Switch on"}</button>
              ${!p._count.ads ? `<button class="btn btn-ghost" data-pkg-del="${esc(p.id)}" aria-label="Delete"><i class="fas fa-trash"></i></button>` : ""}
            </div></td></tr>`
          )
          .join("")}</tbody></table></section>

      <h3 style="font-size:1.9rem;margin:3rem 0 1.2rem">Placements</h3>
      <section class="admin-panel"><table class="admin-table">
        <thead><tr><th>Placement</th><th>Ads shown at once</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
        <tbody>${placements
          .map(
            (pl) => `<tr>
            <td data-label="Placement"><div class="cell-title"><div class="name">${esc(pl.name)}</div><div class="sub gp-normal">${esc(pl.description || "")}</div></div></td>
            <td data-label="Ads shown at once">${pl.maxActive}</td>
            <td data-label="Status">${pl.isActive ? GP.pill("ACTIVE") : `<span class="gp-pill muted">Off</span>`}</td>
            <td data-label="Actions"><div class="row-actions"><button class="btn btn-ghost" data-plc-edit="${esc(pl.id)}">Edit</button></div></td></tr>`
          )
          .join("")}</tbody></table></section>`;

    const pkgForm = (p = {}) => `
      <div class="gp-form" style="display:grid;gap:1rem">
        <div><label class="gp-label">Name</label><input name="name" maxlength="60" value="${esc(p.name || "")}" placeholder="e.g. 7-Day Package" /></div>
        <div class="gp-row">
          <div><label class="gp-label">Duration (days)</label><input name="durationDays" type="number" min="1" max="365" value="${p.durationDays || 7}" /></div>
          <div><label class="gp-label">Price</label><input name="price" type="number" min="0" step="1" value="${p.price ?? ""}" placeholder="e.g. 20000" /></div>
        </div>
        <div class="gp-row">
          <div><label class="gp-label">Currency</label><input name="currency" maxlength="3" value="${esc(p.currency || "RWF")}" /></div>
          <div><label class="gp-label">Placement</label><select name="placementId">${placements.map((pl) => `<option value="${esc(pl.id)}" ${pl.id === p.placementId ? "selected" : ""}>${esc(pl.name)}</option>`).join("")}</select></div>
        </div>
        <div><label class="gp-label">Description (shown to advertisers)</label><textarea name="description" rows="2" maxlength="300">${esc(p.description || "")}</textarea></div>
        <div class="gp-row">
          <div><label class="gp-label">Display order</label><input name="sortOrder" type="number" min="0" max="999" value="${p.sortOrder ?? 0}" /></div>
          <div style="display:grid;gap:.6rem;align-content:end">
            <label class="gp-label" style="display:flex;gap:.8rem;align-items:center;margin:0"><input type="checkbox" name="isFeatured" style="width:auto" ${p.isFeatured ? "checked" : ""} /> Featured (shown first, highlighted)</label>
            <label class="gp-label" style="display:flex;gap:.8rem;align-items:center;margin:0"><input type="checkbox" name="isActive" style="width:auto" ${p.isActive ? "checked" : ""} /> On sale</label>
          </div>
        </div>
      </div>`;
    const readPkg = (f) => ({
      name: f.name.value.trim(),
      durationDays: Number(f.durationDays.value),
      price: Number(f.price.value || 0),
      currency: f.currency.value.trim().toUpperCase() || "RWF",
      placementId: f.placementId.value,
      description: f.description.value.trim() || null,
      sortOrder: Number(f.sortOrder.value || 0),
      isFeatured: f.isFeatured.checked,
      isActive: f.isActive.checked
    });

    el.onclick = async (e) => {
      const nw = e.target.closest("[data-pkg-new]");
      const ed = e.target.closest("[data-pkg-edit]");
      const tg = e.target.closest("[data-pkg-toggle]");
      const dl = e.target.closest("[data-pkg-del]");
      const pe = e.target.closest("[data-plc-edit]");
      try {
        if (nw || ed) {
          const p = ed ? packages.find((x) => x.id === ed.dataset.pkgEdit) : {};
          const r = await GP.modal({ title: ed ? "Edit package" : "New package", html: pkgForm(p), actions: [{ label: "Cancel", value: null }, { label: "Save", value: "save", kind: "primary" }] });
          if (r.value !== "save") return;
          const body = readPkg(r.form);
          if (ed) await GP.api(`/api/admin/ads/packages/${encodeURIComponent(p.id)}`, { method: "PATCH", body });
          else await GP.api("/api/admin/ads/packages", { method: "POST", body });
          GP.toast("Package saved", "success");
        } else if (tg) {
          const p = packages.find((x) => x.id === tg.dataset.pkgToggle);
          await GP.api(`/api/admin/ads/packages/${encodeURIComponent(p.id)}`, { method: "PATCH", body: { isActive: !p.isActive } });
          GP.toast(p.isActive ? "Package switched off" : "Package is on sale", "success");
        } else if (dl) {
          if (!(await GP.confirm("Delete package?", "This package will be deleted.", { confirmLabel: "Delete", danger: true }))) return;
          await GP.api(`/api/admin/ads/packages/${encodeURIComponent(dl.dataset.pkgDel)}`, { method: "DELETE" });
          GP.toast("Package deleted", "success");
        } else if (pe) {
          const pl = placements.find((x) => x.id === pe.dataset.plcEdit);
          const r = await GP.modal({
            title: "Edit placement",
            html: `<label class="gp-label">Name</label><input name="name" maxlength="60" value="${esc(pl.name)}" />
                   <label class="gp-label">Description</label><textarea name="description" rows="2" maxlength="300">${esc(pl.description || "")}</textarea>
                   <label class="gp-label">Maximum ads shown at once (1–10)</label><input name="maxActive" type="number" min="1" max="10" value="${pl.maxActive}" />
                   <label class="gp-label" style="display:flex;gap:.8rem;align-items:center"><input type="checkbox" name="isActive" style="width:auto" ${pl.isActive ? "checked" : ""} /> Placement switched on</label>`,
            actions: [{ label: "Cancel", value: null }, { label: "Save", value: "save", kind: "primary" }]
          });
          if (r.value !== "save") return;
          const f = r.form;
          await GP.api(`/api/admin/ads/placements/${encodeURIComponent(pl.id)}`, { method: "PATCH", body: { name: f.name.value.trim(), description: f.description.value.trim() || null, maxActive: Number(f.maxActive.value), isActive: f.isActive.checked } });
          GP.toast("Placement saved", "success");
        } else return;
        renderPackages();
      } catch (err) {
        GP.toast(err.message, "error");
      }
    };
  }

  // ── Analytics ───────────────────────────────────────────
  function renderAnalytics() {
    const ctr = ov.impressions ? Math.round((ov.clicks / ov.impressions) * 10000) / 100 : 0;
    subEl().innerHTML = `
      <div class="gp-stats">
        <div class="gp-stat"><div class="k">Total impressions</div><div class="v">${ov.impressions}</div></div>
        <div class="gp-stat"><div class="k">Total clicks</div><div class="v">${ov.clicks}</div></div>
        <div class="gp-stat"><div class="k">Average click-through rate</div><div class="v">${ctr}%</div></div>
        <div class="gp-stat"><div class="k">Revenue</div><div class="v" style="font-size:1.9rem">${esc(GP.money(ov.revenue, ov.currency))}</div></div>
      </div>
      <h3 style="font-size:1.9rem;margin-bottom:1.2rem">Most viewed advertisements</h3>
      ${
        ov.top.length
          ? `<section class="admin-panel"><table class="admin-table"><thead><tr><th>Advertisement</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Status</th></tr></thead>
             <tbody>${ov.top.map((t) => `<tr><td data-label="Advertisement"><div class="gp-normal">${esc(t.title)}</div><div class="sub gp-normal">${esc(t.businessName)}</div></td><td data-label="Impressions">${t.impressions}</td><td data-label="Clicks">${t.clicks}</td><td data-label="CTR">${t.ctr}%</td><td data-label="Status">${GP.pill(t.status)}</td></tr>`).join("")}</tbody></table></section>`
          : GP.emptyState("fa-chart-simple", "No views yet", "Impressions are counted once per visitor per day when an ad is visible on the homepage.")
      }`;
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-aact]");
    if (b && root?.contains(b)) adAction(b);
  });

  window.AdminAds = { load };
})();
