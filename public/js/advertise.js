(function () {
  const esc = GP.escapeHtml;
  const createEl = document.getElementById("create");
  const myAdsEl = document.getElementById("my-ads");
  let me = null;
  let packages = [];
  let payOpts = null;
  let ads = [];
  let editing = null; // ad being edited (DRAFT / PENDING_PAYMENT)
  let banner = null; // {id,url}
  let logo = null;

  // ── Tabs ────────────────────────────────────────────────
  function switchTab(t) {
    if (!["create", "my-ads"].includes(t)) t = "create";
    history.replaceState(null, "", `${location.pathname}${location.search}#${t}`);
    document.querySelectorAll(".gp-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === t);
      b.setAttribute("aria-selected", String(b.dataset.tab === t));
    });
    document.querySelectorAll(".gp-panel").forEach((p) => (p.hidden = p.dataset.panel !== t));
  }
  document.querySelector(".gp-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    if (b.dataset.tab === "create" && editing) {
      editing = null;
      renderCreate();
    }
    switchTab(b.dataset.tab);
  });

  // ── Package cards ───────────────────────────────────────
  function packageCards(selectedId) {
    if (!packages.length) {
      return `<div class="mk-notice warn"><i class="fas fa-clock"></i><div>Advertising packages aren't available right now. Please check back soon or contact GamePro.</div></div>`;
    }
    const perDay = (p) => Math.round(p.price / p.durationDays);
    return `<div class="ad-packages">${packages
      .map(
        (p, i) => `
        <label class="ad-package">
          <input type="radio" name="packageId" value="${esc(p.id)}" ${selectedId ? (selectedId === p.id ? "checked" : "") : i === 0 ? "checked" : ""} />
          <div class="box">
            ${p.isFeatured ? `<span class="featured-tag">Featured</span>` : ""}
            <h4>${esc(p.name)}</h4>
            <div class="price">${esc(GP.money(p.price, p.currency))}</div>
            <div class="gp-small">${p.durationDays} days · about ${esc(GP.money(perDay(p), p.currency))} / day</div>
            <ul>
              <li><i class="fas fa-location-crosshairs"></i>${esc(p.placement.name)}</li>
              <li><i class="fas fa-calendar-days"></i>Runs for ${p.durationDays} days after approval</li>
              <li><i class="fas fa-chart-line"></i>Views &amp; clicks dashboard</li>
              ${p.isFeatured ? `<li><i class="fas fa-star"></i>Shown first, highlighted border</li>` : ""}
              ${p.description ? `<li class="gp-normal"><i class="fas fa-circle-info"></i>${esc(p.description)}</li>` : ""}
            </ul>
          </div>
        </label>`
      )
      .join("")}</div>`;
  }

  // ── Create / edit form ──────────────────────────────────
  function renderCreate() {
    const a = editing || {};
    banner = a.bannerUploadId ? { id: a.bannerUploadId, url: a.bannerUrl } : null;
    logo = a.logoUploadId ? { id: a.logoUploadId, url: a.logoUrl } : null;
    document.getElementById("create-label").textContent = editing ? "Edit advertisement" : "Create advertisement";

    if (!me?.user) {
      createEl.innerHTML = `
        <h2 style="font-size:2.2rem;margin-bottom:1.6rem">Packages</h2>
        ${packageCards()}
        <div class="gp-card" style="margin-top:2.4rem;text-align:center">
          <h3>Ready to advertise?</h3>
          <p class="gp-muted" style="margin-bottom:1.6rem">Sign in or create a free account so you can track your advertisement's views and clicks.</p>
          <a class="btn btn-secondary" href="/signin?next=${encodeURIComponent("/advertise")}">Sign in</a>
          <a class="btn gp-btn-ghost" href="/signup">Create account</a>
        </div>`;
      return;
    }
    if (!packages.length) {
      createEl.innerHTML = packageCards();
      return;
    }

    const v = (k, d = "") => esc(a[k] ?? d);
    const startVal = a.preferredStartDate ? new Date(a.preferredStartDate).toISOString().slice(0, 10) : "";
    createEl.innerHTML = `
      <form class="gp-form" id="ad-form" novalidate>
        <div class="gp-field">
          <h2 style="font-size:2.2rem;margin-bottom:1.6rem">1. Choose a package</h2>
          ${packageCards(a.packageId)}
          ${editing?.payments?.some((p) => ["PENDING", "SUCCESSFUL"].includes(p.status)) ? `<p class="gp-hint">The package can't be changed because a payment was already started.</p>` : ""}
        </div>

        <h2 style="font-size:2.2rem;margin:3rem 0 1.6rem">2. Design your advertisement</h2>
        <div class="ad-form-layout">
          <div class="gp-card">
            <h3>Business details</h3>
            <div class="gp-row">
              <div class="gp-field"><label for="a-biz">Business / store name <span class="req">*</span></label><input id="a-biz" name="businessName" maxlength="80" required value="${v("businessName")}" /></div>
              <div class="gp-field"><label for="a-contact">Contact person <span class="req">*</span></label><input id="a-contact" name="contactName" maxlength="80" required value="${v("contactName", me.user.name || "")}" /></div>
            </div>
            <div class="gp-row">
              <div class="gp-field"><label for="a-email">Email <span class="req">*</span></label><input id="a-email" name="email" type="email" maxlength="120" required value="${v("email", me.user.email)}" /></div>
              <div class="gp-field"><label for="a-phone">Phone <span class="req">*</span></label><input id="a-phone" name="phone" type="tel" maxlength="20" required placeholder="+250…" value="${v("phone")}" /></div>
            </div>
            <div class="gp-row">
              <div class="gp-field"><label for="a-loc">Business location</label><input id="a-loc" name="location" maxlength="80" placeholder="e.g. Kimironko, Kigali" value="${v("location")}" /></div>
              <div class="gp-field"><label for="a-link">Website or social media link</label><input id="a-link" name="linkUrl" maxlength="500" placeholder="instagram.com/yourstore" value="${v("linkUrl")}" /></div>
            </div>

            <h3 style="margin-top:1rem">Advertisement</h3>
            <div class="gp-field"><label for="a-title">Headline <span class="req">*</span></label><input id="a-title" name="title" maxlength="60" required placeholder="e.g. PS5 games from 25,000 RWF" value="${v("title")}" /><p class="gp-hint"><span data-count="title">0</span>/60</p></div>
            <div class="gp-field"><label for="a-msg">Short promotional message <span class="req">*</span></label><textarea id="a-msg" name="message" rows="3" maxlength="200" required placeholder="What makes your offer worth a click?">${v("message")}</textarea><p class="gp-hint"><span data-count="message">0</span>/200</p></div>
            <div class="gp-row">
              <div class="gp-field"><label for="a-cta">Button text</label><input id="a-cta" name="ctaLabel" maxlength="24" placeholder="Learn More" value="${v("ctaLabel", "")}" /></div>
              <div class="gp-field"><label for="a-start">Preferred start date</label><input id="a-start" name="preferredStartDate" type="date" min="${new Date().toISOString().slice(0, 10)}" value="${startVal}" /><p class="gp-hint">Leave empty to start as soon as it's approved.</p></div>
            </div>
            <div class="gp-row">
              <div class="gp-field">
                <label>Advertisement image <span class="req">*</span></label>
                <div class="mk-uploader" id="banner-box" style="grid-template-columns:1fr"></div>
                <p class="gp-hint">Landscape image works best (16:9, e.g. 1280×720).</p>
              </div>
              <div class="gp-field">
                <label>Logo</label>
                <div class="mk-uploader" id="logo-box" style="grid-template-columns:110px"></div>
                <p class="gp-hint">Square logo, optional.</p>
              </div>
            </div>
          </div>

          <div class="ad-preview-col">
            <div class="home-ads-head" style="margin-bottom:1rem"><span>Live preview</span><span class="gp-small" style="text-transform:none">as shown on the homepage</span></div>
            <div id="preview"></div>
            <div class="gp-card" style="margin-top:1.6rem" id="price-summary"></div>
          </div>
        </div>

        <p class="gp-form-error" id="a-error" hidden style="margin-top:2rem"></p>
        <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:2rem">
          <button class="btn btn-secondary" type="submit" data-mode="submit"><i class="fas fa-paper-plane"></i> ${editing && editing.status !== "DRAFT" ? "Save changes" : "Submit & continue to payment"}</button>
          ${!editing || editing.status === "DRAFT" ? `<button class="btn gp-btn-ghost" type="submit" data-mode="draft"><i class="far fa-floppy-disk"></i> Save as draft</button>` : ""}
          ${editing ? `<button class="btn gp-btn-ghost" type="button" id="cancel-edit">Cancel</button>` : ""}
        </div>
        <p class="gp-hint" style="margin-top:1rem">By submitting you confirm you have the right to use the images and that your advertisement is accurate. GamePro reviews every advertisement before it goes live. ${esc(payOpts?.refundPolicy || "")}</p>
      </form>`;

    const form = document.getElementById("ad-form");
    renderUploads();
    updatePreview();
    form.addEventListener("input", updatePreview);
    form.addEventListener("change", updatePreview);
    if (editing?.payments?.some((p) => ["PENDING", "SUCCESSFUL"].includes(p.status))) {
      form.querySelectorAll('[name="packageId"]').forEach((r) => (r.disabled = !r.checked));
    }
    document.getElementById("cancel-edit")?.addEventListener("click", () => {
      editing = null;
      renderCreate();
      switchTab("my-ads");
    });
    let mode = "submit";
    form.querySelectorAll("button[type=submit]").forEach((b) => b.addEventListener("click", () => (mode = b.dataset.mode)));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitAd(form, mode);
    });
  }

  function uploader(box, current, onChange, label) {
    box.innerHTML = current
      ? `<div class="mk-thumb ${current.uploading ? "uploading" : ""}" style="${box.id === "banner-box" ? "aspect-ratio:16/9" : ""}">
           <img src="${esc(current.url)}" alt="${label}" />
           ${current.uploading ? "" : `<div class="mk-thumb-actions"><span></span><button type="button" data-clear aria-label="Remove ${label}"><i class="fas fa-trash"></i></button></div>`}
         </div>`
      : `<label class="mk-drop" style="${box.id === "banner-box" ? "aspect-ratio:16/9" : ""}"><span><i class="fas fa-image"></i>Upload ${label}</span>
           <input type="file" accept="image/jpeg,image/png,image/webp" hidden /></label>`;
    box.querySelector("[data-clear]")?.addEventListener("click", () => onChange(null));
    box.querySelector("input[type=file]")?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const tmp = { uploading: true, url: URL.createObjectURL(file) };
      onChange(tmp);
      try {
        const up = await GP.uploadImage(file, { maxDim: box.id === "banner-box" ? 1600 : 512 });
        onChange({ id: up.id, url: up.url });
      } catch (err) {
        GP.toast(err.message, "error");
        onChange(null);
      }
    });
  }

  function renderUploads() {
    uploader(document.getElementById("banner-box"), banner, (v) => {
      banner = v;
      renderUploads();
      updatePreview();
    }, "image");
    uploader(document.getElementById("logo-box"), logo, (v) => {
      logo = v;
      renderUploads();
      updatePreview();
    }, "logo");
  }

  function selectedPackage(form) {
    const id = form.querySelector('[name="packageId"]:checked')?.value;
    return packages.find((p) => p.id === id) || null;
  }

  function updatePreview() {
    const form = document.getElementById("ad-form");
    if (!form) return;
    const pkg = selectedPackage(form);
    form.querySelectorAll("[data-count]").forEach((s) => (s.textContent = form[s.dataset.count].value.length));
    document.getElementById("preview").innerHTML = GP.adCard(
      {
        businessName: form.businessName.value.trim(),
        title: form.title.value.trim(),
        message: form.message.value.trim(),
        ctaLabel: form.ctaLabel.value.trim() || (form.linkUrl.value.trim() ? "Learn More" : "Call now"),
        location: form.location.value.trim(),
        bannerUrl: banner?.url,
        logoUrl: logo?.url,
        isFeatured: pkg?.isFeatured
      },
      { preview: true }
    );
    document.getElementById("price-summary").innerHTML = pkg
      ? `<div class="gp-small">Selected package</div>
         <div style="font-size:1.7rem;font-weight:700;margin:.3rem 0">${esc(pkg.name)}</div>
         <div class="gp-small">${pkg.durationDays} days · ${esc(pkg.placement.name)}</div>
         <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1.2rem;padding-top:1.2rem;border-top:1px solid var(--gp-border)">
           <span class="gp-muted">Total to pay</span><span class="mk-price" style="font-size:2.2rem">${esc(GP.money(pkg.price, pkg.currency))}</span>
         </div>`
      : `<p class="gp-muted">Choose a package to see the price.</p>`;
  }

  async function submitAd(form, mode) {
    const err = document.getElementById("a-error");
    err.hidden = true;
    const showErr = (m, f) => {
      err.textContent = m;
      err.hidden = false;
      f?.focus();
    };
    if (banner?.uploading || logo?.uploading) return showErr("Please wait for the images to finish uploading");
    const pkg = selectedPackage(form);
    const body = {
      packageId: pkg?.id,
      businessName: form.businessName.value.trim(),
      contactName: form.contactName.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      location: form.location.value.trim() || null,
      linkUrl: form.linkUrl.value.trim() || null,
      title: form.title.value.trim(),
      message: form.message.value.trim(),
      ctaLabel: form.ctaLabel.value.trim() || null,
      preferredStartDate: form.preferredStartDate.value || null,
      bannerUploadId: banner?.id,
      logoUploadId: logo?.id || null,
      saveAsDraft: mode === "draft"
    };
    if (!body.packageId) return showErr("Choose a package");
    if (body.businessName.length < 2) return showErr("Enter your business name", form.businessName);
    if (body.contactName.length < 2) return showErr("Enter a contact person", form.contactName);
    if (!/^\S+@\S+\.\S+$/.test(body.email)) return showErr("Enter a valid email", form.email);
    if (!/^\+?[0-9 ()-]{7,20}$/.test(body.phone)) return showErr("Enter a valid phone number", form.phone);
    if (body.title.length < 3) return showErr("Write a headline", form.title);
    if (body.message.length < 10) return showErr("The promotional message needs at least 10 characters", form.message);
    if (!body.bannerUploadId) return showErr("Upload an advertisement image");

    const btn = form.querySelector(`button[data-mode="${mode}"]`);
    GP.setLoading(btn, true, "Saving…");
    try {
      const r = editing
        ? await GP.api(`/api/my/ads/${encodeURIComponent(editing.id)}`, { method: "PATCH", body })
        : await GP.api("/api/my/ads", { method: "POST", body });
      editing = null;
      await loadMyAds();
      renderCreate();
      switchTab("my-ads");
      if (r.status === "PENDING_PAYMENT") {
        GP.toast("Advertisement saved. Complete the payment to send it for review.", "success");
        openPayment(ads.find((x) => x.id === r.id));
      } else if (r.status === "DRAFT") GP.toast("Draft saved", "success");
      else GP.toast("Advertisement submitted for review", "success");
    } catch (e) {
      showErr(e.message);
      GP.setLoading(btn, false);
    }
  }

  // ── Payment ─────────────────────────────────────────────
  async function openPayment(ad) {
    if (!ad) return;
    const pendingManual = ad.payments.find((p) => p.provider === "MANUAL" && p.status === "PENDING");
    if (pendingManual) {
      await GP.modal({ title: "Payment being verified", html: `<p class="gp-muted">We received your Mobile Money transaction ID <b class="gp-normal">${esc(pendingManual.payerReference)}</b>. Our team will confirm it shortly and you'll get an email.</p>` });
      return;
    }
    if (!payOpts.online && !payOpts.manual) {
      await GP.modal({ title: "Payment", html: `<p class="gp-muted">Payments aren't available online yet. Please contact GamePro to complete your payment. Your advertisement is saved.</p>` });
      return;
    }
    const html = `
      <div style="display:flex;justify-content:space-between;align-items:center" class="gp-card">
        <div><div class="gp-small">Amount due</div><div class="gp-normal" style="font-size:1.4rem">${esc(ad.title)} · ${esc(ad.packageName)}</div></div>
        <div class="mk-price" style="font-size:2.4rem">${esc(GP.money(ad.amount, ad.currency))}</div>
      </div>
      ${
        payOpts.online
          ? `<div class="gp-card"><h3 style="font-size:1.6rem"><i class="fas fa-mobile-screen"></i> Pay online</h3>
              <p class="gp-muted" style="margin-bottom:1.2rem">MTN MoMo, Airtel Money or card, through our secure payment partner (${esc(payOpts.onlineProvider)}). You'll come back here when it's done.</p>
              <button type="button" class="btn btn-secondary" data-pay-online style="width:100%"><i class="fas fa-lock"></i> Pay ${esc(GP.money(ad.amount, ad.currency))}</button></div>`
          : ""
      }
      ${
        payOpts.manual
          ? `<div class="gp-card"><h3 style="font-size:1.6rem"><i class="fas fa-money-bill-transfer"></i> ${payOpts.online ? "Or pay by Mobile Money transfer" : "Pay by Mobile Money"}</h3>
              <p class="gp-muted gp-normal" style="margin-bottom:1.2rem">${esc(payOpts.manualInstructions)}</p>
              <label class="gp-label" for="m-ref">Transaction ID from your confirmation SMS</label>
              <input id="m-ref" name="reference" maxlength="60" placeholder="e.g. 12345678901" />
              <p class="gp-field-error" id="m-err" hidden></p>
              <button type="button" class="btn gp-btn-ghost" data-pay-manual style="width:100%;margin-top:1rem"><i class="fas fa-check"></i> I've paid, submit for verification</button></div>`
          : ""
      }`;
    const modalPromise = GP.modal({ title: "Complete your payment", html, actions: [{ label: "Pay later", value: null }], wide: true });
    const modal = document.querySelector(".gp-modal");
    modal.querySelector("[data-pay-online]")?.addEventListener("click", async (e) => {
      GP.setLoading(e.currentTarget, true, "Connecting…");
      try {
        const r = await GP.api(`/api/my/ads/${encodeURIComponent(ad.id)}/pay`, { method: "POST", body: { method: "online" } });
        if (r.redirectUrl) location.href = r.redirectUrl;
        else location.reload();
      } catch (err) {
        GP.toast(err.message, "error");
        GP.setLoading(e.currentTarget, false);
      }
    });
    modal.querySelector("[data-pay-manual]")?.addEventListener("click", async (e) => {
      const ref = modal.querySelector("#m-ref").value.trim();
      const errEl = modal.querySelector("#m-err");
      if (ref.length < 4) {
        errEl.textContent = "Enter the transaction ID from your Mobile Money message";
        errEl.hidden = false;
        return;
      }
      GP.setLoading(e.currentTarget, true, "Submitting…");
      try {
        await GP.api(`/api/my/ads/${encodeURIComponent(ad.id)}/pay`, { method: "POST", body: { method: "manual", reference: ref } });
        document.querySelector(".gp-modal-backdrop")?.remove();
        GP.toast("Thanks! We'll verify your payment and email you.", "success");
        await loadMyAds();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
        GP.setLoading(e.currentTarget, false);
      }
    });
    await modalPromise;
  }

  // ── My ads ──────────────────────────────────────────────
  const payPill = (ad) => {
    const last = ad.payments[0];
    if (ad.amount === 0) return `<span class="gp-small">Free</span>`;
    return last ? GP.pill(last.status) : `<span class="gp-pill muted">Not paid</span>`;
  };

  function renderMyAds() {
    if (!me?.user) {
      myAdsEl.innerHTML = GP.emptyState("fa-user-lock", "Sign in to see your advertisements", "Track views, clicks and payments for your advertisements.", `<a class="btn btn-secondary" href="/signin?next=${encodeURIComponent("/advertise#my-ads")}">Sign in</a>`);
      return;
    }
    if (!ads.length) {
      myAdsEl.innerHTML = GP.emptyState("fa-bullhorn", "No advertisements yet", "Create your first advertisement to reach the GamePro community.", `<button class="btn btn-secondary" data-go-create>Create advertisement</button>`);
      return;
    }
    myAdsEl.innerHTML = `<div class="gp-list">${ads
      .map((a) => {
        const actions = [];
        if (["PENDING_PAYMENT", "PAYMENT_PENDING_VERIFICATION"].includes(a.status) && a.amount > 0) actions.push(`<button class="btn btn-secondary btn-sm" data-pay="${esc(a.id)}"><i class="fas fa-credit-card"></i> ${a.status === "PENDING_PAYMENT" ? "Pay now" : "Payment status"}</button>`);
        if (a.status === "DRAFT") actions.push(`<button class="btn btn-secondary btn-sm" data-edit="${esc(a.id)}"><i class="fas fa-paper-plane"></i> Finish &amp; submit</button>`);
        else if (a.status === "PENDING_PAYMENT") actions.push(`<button class="btn gp-btn-ghost btn-sm" data-edit="${esc(a.id)}"><i class="fas fa-pen"></i> Edit</button>`);
        actions.push(`<button class="btn gp-btn-ghost btn-sm" data-preview="${esc(a.id)}"><i class="far fa-eye"></i> Preview</button>`);
        if (["DRAFT", "PENDING_PAYMENT"].includes(a.status) && !a.payments.some((p) => ["PENDING", "SUCCESSFUL"].includes(p.status))) actions.push(`<button class="btn gp-btn-danger btn-sm" data-del="${esc(a.id)}" aria-label="Delete"><i class="fas fa-trash"></i></button>`);
        const live = a.startsAt && a.endsAt;
        return `
          <div class="gp-item">
            <img src="${esc(a.bannerUrl || "/images/market/service.svg")}" alt="" loading="lazy" />
            <div>
              <h4 class="gp-normal">${esc(a.title)}</h4>
              <div style="display:flex;gap:.8rem;align-items:center;flex-wrap:wrap">
                ${GP.pill(a.status)} <span class="gp-small">Payment:</span> ${payPill(a)}
                <span class="gp-small">${esc(a.packageName)} · ${esc(GP.money(a.amount, a.currency))}</span>
              </div>
              ${a.declineReason && a.status === "DECLINED" ? `<div class="gp-small gp-normal" style="color:#fca5a5;margin-top:.4rem"><i class="fas fa-circle-info"></i> ${esc(a.declineReason)}</div>` : ""}
              <div class="gp-meta">
                <span><i class="far fa-eye"></i>${a.stats.impressions} impressions</span>
                <span><i class="fas fa-arrow-pointer"></i>${a.stats.clicks} clicks</span>
                <span><i class="fas fa-percent"></i>${a.stats.ctr}% CTR</span>
                ${live ? `<span><i class="far fa-calendar"></i>${esc(GP.date(a.startsAt))} → ${esc(GP.date(a.endsAt))}</span>` : a.preferredStartDate ? `<span><i class="far fa-calendar"></i>Preferred start ${esc(GP.date(a.preferredStartDate))}</span>` : ""}
              </div>
            </div>
            <div class="gp-item-actions">${actions.join("")}</div>
          </div>`;
      })
      .join("")}</div>`;
  }

  myAdsEl.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.matches("[data-go-create]")) return switchTab("create");
    const find = (id) => ads.find((a) => a.id === id);
    if (t.dataset.pay) return openPayment(find(t.dataset.pay));
    if (t.dataset.edit) {
      editing = find(t.dataset.edit);
      renderCreate();
      switchTab("create");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (t.dataset.preview) {
      const a = find(t.dataset.preview);
      GP.modal({ title: "Advertisement preview", html: `<div style="max-width:320px;margin:0 auto">${GP.adCard({ ...a, hasLink: !!a.linkUrl }, { preview: true })}</div>` });
      return;
    }
    if (t.dataset.del) {
      if (!(await GP.confirm("Delete advertisement?", "This unpaid advertisement will be deleted.", { confirmLabel: "Delete", danger: true }))) return;
      try {
        await GP.api(`/api/my/ads/${encodeURIComponent(t.dataset.del)}`, { method: "DELETE" });
        GP.toast("Deleted", "success");
        await loadMyAds();
      } catch (err) {
        GP.toast(err.message, "error");
      }
    }
  });

  async function loadMyAds() {
    if (!me?.user) return renderMyAds();
    try {
      ads = await GP.api("/api/my/ads");
      renderMyAds();
    } catch (e) {
      myAdsEl.innerHTML = GP.emptyState("fa-triangle-exclamation", "Couldn't load your advertisements", e.message);
    }
  }

  // Message after returning from the payment page (the server already verified with the provider)
  function showReturnNotice() {
    const r = GP.qs("payment");
    if (!r) return;
    const map = {
      successful: ["ok", "fa-circle-check", "Payment confirmed! Your advertisement is now waiting for our team's approval."],
      pending: ["info", "fa-hourglass-half", "Your payment is still being confirmed by the provider. This page will update once it's verified. You'll also get an email."],
      failed: ["bad", "fa-circle-xmark", "The payment didn't go through. You can try again from the list below."],
      cancelled: ["warn", "fa-circle-info", "Payment cancelled. You can pay any time from the list below."],
      unknown: ["warn", "fa-circle-info", "We couldn't match that payment. If money was taken, contact GamePro with your transaction details."]
    };
    const m = map[r] || map.unknown;
    document.getElementById("return-notice").innerHTML = `<div class="mk-notice ${m[0]}"><i class="fas ${m[1]}"></i><div>${esc(m[2])}</div></div>`;
    history.replaceState(null, "", `/advertise#my-ads`);
  }

  (async function init() {
    showReturnNotice();
    const initialTab = location.hash.replace("#", "") || "create";
    switchTab(initialTab);
    [me, packages, payOpts] = await Promise.all([GP.me(), GP.api("/api/ads/packages").catch(() => []), GP.api("/api/ads/payment-options").catch(() => ({}))]);
    if (me?.user?.twoFactorOn && !me.twoFactorOk) {
      location.href = "/2fa";
      return;
    }
    await loadMyAds();
    renderCreate();
  })();
})();
