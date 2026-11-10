(function () {
  const esc = GP.escapeHtml;
  const app = document.getElementById("app");
  let profile = null;
  let moderation = true;
  let categories = [];
  let listings = [];
  let stats = null;
  let inquiries = [];
  let tab = location.hash.replace("#", "") || "listings";

  // ── Layout ──────────────────────────────────────────────
  function shell() {
    const unread = inquiries.filter((i) => !i.readAt).length;
    app.innerHTML = `
      ${profile.status === "SUSPENDED" ? `<div class="mk-notice bad"><i class="fas fa-ban"></i><div>Your seller account is suspended, so your listings are hidden. Contact GamePro for help.</div></div>` : ""}
      <div class="gp-stats">
        <div class="gp-stat"><div class="k">Active listings</div><div class="v">${stats?.active ?? 0}</div></div>
        <div class="gp-stat"><div class="k">In review</div><div class="v">${stats?.pending ?? 0}</div></div>
        <div class="gp-stat"><div class="k">Sold</div><div class="v">${stats?.sold ?? 0}</div></div>
        <div class="gp-stat"><div class="k">Total views</div><div class="v">${stats?.views ?? 0}</div></div>
        <div class="gp-stat"><div class="k">Inquiries</div><div class="v">${stats?.inquiries ?? 0}</div></div>
      </div>
      <div class="gp-tabs" role="tablist">
        <button class="gp-tab" data-tab="listings" role="tab"><i class="fas fa-boxes-stacked"></i> My listings</button>
        <button class="gp-tab" data-tab="new" role="tab"><i class="fas fa-plus"></i> <span id="form-tab-label">New listing</span></button>
        <button class="gp-tab" data-tab="inquiries" role="tab"><i class="fas fa-inbox"></i> Inquiries ${unread ? `<span class="gp-count">${unread}</span>` : ""}</button>
        <button class="gp-tab" data-tab="profile" role="tab"><i class="fas fa-id-card"></i> Seller profile</button>
      </div>
      <section class="gp-panel" data-panel="listings"></section>
      <section class="gp-panel" data-panel="new"></section>
      <section class="gp-panel" data-panel="inquiries"></section>
      <section class="gp-panel" data-panel="profile"></section>`;
    app.querySelector(".gp-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]");
      if (!b) return;
      if (b.dataset.tab === "new" && !editing) renderForm(null);
      switchTab(b.dataset.tab);
    });
    renderListings();
    renderInquiries();
    renderProfile(app.querySelector('[data-panel="profile"]'));
    if (!app.querySelector('[data-panel="new"]').innerHTML) renderForm(null);
    switchTab(tab);
  }

  function switchTab(t) {
    if (!["listings", "new", "inquiries", "profile"].includes(t)) t = "listings";
    tab = t;
    history.replaceState(null, "", `#${t}`);
    app.querySelectorAll(".gp-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === t);
      b.setAttribute("aria-selected", String(b.dataset.tab === t));
    });
    app.querySelectorAll(".gp-panel").forEach((p) => (p.hidden = p.dataset.panel !== t));
    if (t === "inquiries") markInquiriesRead();
  }

  // ── Listings ────────────────────────────────────────────
  function actionsFor(p) {
    const a = [`<a class="btn gp-btn-ghost btn-sm" href="/marketplace/${esc(p.id)}"><i class="far fa-eye"></i> View</a>`];
    if (p.status !== "REMOVED") a.push(`<button class="btn gp-btn-ghost btn-sm" data-act="edit" data-id="${esc(p.id)}"><i class="fas fa-pen"></i> Edit</button>`);
    if (["ACTIVE", "INACTIVE"].includes(p.status)) a.push(`<button class="btn btn-sm" data-act="sold" data-id="${esc(p.id)}"><i class="fas fa-handshake"></i> Mark sold</button>`);
    if (["ACTIVE", "PENDING_REVIEW"].includes(p.status)) a.push(`<button class="btn gp-btn-ghost btn-sm" data-act="deactivate" data-id="${esc(p.id)}"><i class="fas fa-eye-slash"></i> Hide</button>`);
    if (p.status === "INACTIVE") a.push(`<button class="btn gp-btn-ghost btn-sm" data-act="activate" data-id="${esc(p.id)}"><i class="fas fa-eye"></i> Show</button>`);
    if (p.status === "SOLD") a.push(`<button class="btn gp-btn-ghost btn-sm" data-act="relist" data-id="${esc(p.id)}"><i class="fas fa-rotate"></i> Relist</button>`);
    a.push(`<button class="btn gp-btn-danger btn-sm" data-act="delete" data-id="${esc(p.id)}" aria-label="Delete"><i class="fas fa-trash"></i></button>`);
    return a.join("");
  }

  function renderListings() {
    const el = app.querySelector('[data-panel="listings"]');
    if (!listings.length) {
      el.innerHTML = GP.emptyState("fa-box-open", "No listings yet", "Create your first listing. It only takes a couple of minutes.", `<button class="btn btn-secondary" data-goto="new"><i class="fas fa-plus"></i> New listing</button>`);
      return;
    }
    const order = ["PENDING_REVIEW", "DECLINED", "ACTIVE", "INACTIVE", "SOLD", "REMOVED"];
    const sorted = [...listings].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
    el.innerHTML = `<div class="gp-list">${sorted
      .map(
        (p) => `
        <div class="gp-item">
          <img src="${esc(GP.productImage(p))}" alt="" loading="lazy" />
          <div>
            <h4 class="gp-normal">${esc(p.title)}</h4>
            <div style="display:flex;gap:.8rem;align-items:center;flex-wrap:wrap">
              ${GP.pill(p.status)} <span class="mk-price" style="font-size:1.6rem">${esc(GP.money(p.price, p.currency))}</span>
              <span class="gp-small">${p.condition === "NEW" ? "New" : "Used"} · Qty ${p.quantity}</span>
            </div>
            ${p.declineReason && ["DECLINED", "REMOVED"].includes(p.status) ? `<div class="gp-small gp-normal" style="color:#fca5a5;margin-top:.4rem"><i class="fas fa-circle-info"></i> ${esc(p.declineReason)}</div>` : ""}
            <div class="gp-meta">
              <span><i class="far fa-eye"></i>${p.viewCount} views</span>
              <span><i class="fas fa-inbox"></i>${p.inquiryCount} inquiries</span>
              <span><i class="far fa-heart"></i>${p.favoriteCount} saved</span>
              <span><i class="far fa-clock"></i>Updated ${esc(GP.timeAgo(p.updatedAt))}</span>
            </div>
          </div>
          <div class="gp-item-actions">${actionsFor(p)}</div>
        </div>`
      )
      .join("")}</div>`;
  }

  app.addEventListener("click", async (e) => {
    const go = e.target.closest("[data-goto]");
    if (go) {
      if (go.dataset.goto === "new") renderForm(null);
      return switchTab(go.dataset.goto);
    }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const id = b.dataset.id;
    const p = listings.find((x) => x.id === id);
    const act = b.dataset.act;
    if (act === "edit") return openEdit(id);
    if (act === "delete") {
      if (!(await GP.confirm("Delete listing?", `"${p.title}" will be permanently deleted, including its inquiries.`, { confirmLabel: "Delete", danger: true }))) return;
      try {
        await GP.api(`/api/seller/products/${encodeURIComponent(id)}`, { method: "DELETE" });
        GP.toast("Listing deleted", "success");
        await refresh();
      } catch (err) {
        GP.toast(err.message, "error");
      }
      return;
    }
    if (act === "sold" && !(await GP.confirm("Mark as sold?", `"${p.title}" will show as sold and buyers can no longer contact you about it.`, { confirmLabel: "Mark sold" }))) return;
    try {
      GP.setLoading(b, true, "");
      const r = await GP.api(`/api/seller/products/${encodeURIComponent(id)}/status`, { method: "POST", body: { action: act } });
      GP.toast(r.status === "PENDING_REVIEW" ? "Sent for review" : "Listing updated", "success");
      await refresh();
    } catch (err) {
      GP.toast(err.message, "error");
      GP.setLoading(b, false);
    }
  });

  // ── Listing form (new + edit) ───────────────────────────
  let editing = null; // product id being edited
  let photos = []; // [{id,url}] in order; first is the cover

  function categoryOptions(selected) {
    return (
      `<option value="">Choose a category</option>` +
      categories
        .map(
          (t) => `<optgroup label="${esc(t.name)}">
            <option value="${esc(t.id)}" ${selected === t.id ? "selected" : ""}>${esc(t.name)} (general)</option>
            ${t.children.map((c) => `<option value="${esc(c.id)}" ${selected === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
          </optgroup>`
        )
        .join("")
    );
  }

  function specRow(s = { label: "", value: "" }) {
    return `<div class="gp-row spec-row" style="grid-template-columns:1fr 1.4fr auto;margin-bottom:.8rem">
      <input name="specLabel" placeholder="e.g. Storage" maxlength="40" value="${esc(s.label)}" aria-label="Specification name" />
      <input name="specValue" placeholder="e.g. 825 GB SSD" maxlength="120" value="${esc(s.value)}" aria-label="Specification value" />
      <button type="button" class="gp-icon-btn" data-remove-spec aria-label="Remove"><i class="fas fa-xmark"></i></button>
    </div>`;
  }

  function renderPhotos() {
    const box = document.getElementById("photos");
    if (!box) return;
    box.innerHTML =
      photos
        .map(
          (ph, i) => `
        <div class="mk-thumb ${ph.uploading ? "uploading" : ""}">
          ${ph.url ? `<img src="${esc(ph.url)}" alt="Photo ${i + 1}" />` : ""}
          ${i === 0 && !ph.uploading ? `<span class="cover-tag">Cover</span>` : ""}
          ${
            ph.uploading
              ? ""
              : `<div class="mk-thumb-actions">
                  <button type="button" data-ph-left="${i}" aria-label="Move left" ${i === 0 ? "disabled" : ""}><i class="fas fa-arrow-left"></i></button>
                  <button type="button" data-ph-del="${i}" aria-label="Remove photo"><i class="fas fa-trash"></i></button>
                </div>`
          }
        </div>`
        )
        .join("") +
      (photos.length < 8
        ? `<label class="mk-drop" tabindex="0"><span><i class="fas fa-camera"></i>Add photos<br><span class="gp-small">${photos.length}/8</span></span>
             <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden id="photo-input" /></label>`
        : "");
    document.getElementById("photo-input")?.addEventListener("change", onPickPhotos);
    box.querySelector(".mk-drop")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        document.getElementById("photo-input")?.click();
      }
    });
  }

  async function onPickPhotos(e) {
    const files = [...e.target.files].slice(0, 8 - photos.length);
    e.target.value = "";
    for (const file of files) {
      const slot = { uploading: true, url: URL.createObjectURL(file) };
      photos.push(slot);
      renderPhotos();
      try {
        const up = await GP.uploadImage(file);
        URL.revokeObjectURL(slot.url);
        Object.assign(slot, { id: up.id, url: up.url, uploading: false });
      } catch (err) {
        photos = photos.filter((p) => p !== slot);
        GP.toast(`${file.name}: ${err.message}`, "error");
      }
      renderPhotos();
    }
  }

  function renderForm(product) {
    editing = product?.id || null;
    photos = product ? product.images.map((i) => ({ id: i.id, url: i.url })) : [];
    const el = app.querySelector('[data-panel="new"]');
    const label = document.getElementById("form-tab-label");
    if (label) label.textContent = editing ? "Edit listing" : "New listing";
    const v = (k, d = "") => esc(product?.[k] ?? d);
    const cond = product?.condition || "USED";
    el.innerHTML = `
      <form class="gp-form gp-card" id="listing-form" novalidate>
        <h2>${editing ? "Edit listing" : "List an item for sale"}</h2>
        ${
          editing && moderation && ["ACTIVE"].includes(product.status)
            ? `<div class="mk-notice info"><i class="fas fa-circle-info"></i><div>Changing the title, description, photos or category sends the listing back for a quick review. Price, stock and contact changes go live straight away.</div></div>`
            : !editing && moderation
              ? `<div class="mk-notice info"><i class="fas fa-shield-halved"></i><div>New listings are checked by the GamePro team before they appear in the marketplace.</div></div>`
              : ""
        }
        <div class="gp-field">
          <label>Photos <span class="req">*</span></label>
          <div class="mk-uploader" id="photos"></div>
          <p class="gp-hint">Up to 8 photos. Use your own photos of the actual item. The first photo is the cover.</p>
        </div>
        <div class="gp-field"><label for="l-title">Product name <span class="req">*</span></label>
          <input id="l-title" name="title" maxlength="120" required placeholder="e.g. PlayStation 5 Slim, 1TB with 2 controllers" value="${v("title")}" /></div>
        <div class="gp-row">
          <div class="gp-field"><label for="l-cat">Category <span class="req">*</span></label><select id="l-cat" name="categoryId" required>${categoryOptions(product?.categoryId)}</select></div>
          <div class="gp-field"><label for="l-brand">Brand</label><input id="l-brand" name="brand" maxlength="60" placeholder="Sony, Microsoft, Logitech…" value="${v("brand")}" /></div>
        </div>
        <div class="gp-field">
          <label>Condition <span class="req">*</span></label>
          <div class="gp-choice">
            <label><input type="radio" name="condition" value="NEW" ${cond === "NEW" ? "checked" : ""} /><span><i class="fas fa-box"></i> New</span></label>
            <label><input type="radio" name="condition" value="USED" ${cond === "USED" ? "checked" : ""} /><span><i class="fas fa-clipboard-check"></i> Used</span></label>
          </div>
        </div>
        <div class="gp-field"><label for="l-cnotes" id="l-cnotes-label">${cond === "NEW" ? "Box / warranty details" : "Condition details"}</label>
          <textarea id="l-cnotes" name="conditionNotes" rows="3" maxlength="1000" placeholder="${cond === "NEW" ? "Sealed box, 1-year warranty…" : "Scratches, defects, missing accessories, how long you used it…"}">${v("conditionNotes")}</textarea></div>
        <div class="gp-row-3">
          <div class="gp-field"><label for="l-price">Price (RWF) <span class="req">*</span></label><input id="l-price" name="price" type="number" min="1" step="1" inputmode="numeric" required value="${v("price")}" /></div>
          <div class="gp-field"><label for="l-qty">Quantity</label><input id="l-qty" name="quantity" type="number" min="1" max="10000" step="1" value="${v("quantity", 1)}" /></div>
          <div class="gp-field"><label for="l-avail">Availability</label>
            <select id="l-avail" name="availability">
              ${["AVAILABLE", "RESERVED", "OUT_OF_STOCK"].map((a) => `<option value="${a}" ${(product?.availability || "AVAILABLE") === a ? "selected" : ""}>${{ AVAILABLE: "Available", RESERVED: "Reserved", OUT_OF_STOCK: "Out of stock" }[a]}</option>`).join("")}
            </select></div>
        </div>
        <div class="gp-field"><label for="l-desc">Description <span class="req">*</span></label>
          <textarea id="l-desc" name="description" rows="6" maxlength="5000" required placeholder="What's included, why you're selling, anything a buyer should know (at least 20 characters).">${v("description")}</textarea></div>
        <div class="gp-field">
          <label>Specifications</label>
          <div id="specs">${(product?.specs?.length ? product.specs : [{ label: "", value: "" }]).map(specRow).join("")}</div>
          <button type="button" class="btn gp-btn-ghost btn-sm" id="add-spec"><i class="fas fa-plus"></i> Add specification</button>
        </div>
        <div class="gp-row-3">
          <div class="gp-field"><label for="l-loc">Location <span class="req">*</span></label><input id="l-loc" name="location" maxlength="80" required value="${v("location", profile.location)}" /></div>
          <div class="gp-field"><label for="l-phone">Contact phone <span class="req">*</span></label><input id="l-phone" name="contactPhone" type="tel" maxlength="20" required value="${v("contactPhone", profile.phone)}" /></div>
          <div class="gp-field"><label for="l-email">Contact email</label><input id="l-email" name="contactEmail" type="email" maxlength="120" value="${v("contactEmail")}" /></div>
        </div>
        <p class="gp-form-error" id="l-error" hidden></p>
        <div style="display:flex;gap:1rem;flex-wrap:wrap">
          <button class="btn btn-secondary" type="submit"><i class="fas fa-check"></i> ${editing ? "Save changes" : moderation ? "Submit for review" : "Publish listing"}</button>
          ${editing ? `<button class="btn gp-btn-ghost" type="button" id="cancel-edit">Cancel</button>` : ""}
        </div>
      </form>`;

    renderPhotos();
    const form = document.getElementById("listing-form");
    form.addEventListener("change", (e) => {
      if (e.target.name === "condition") {
        const isNew = e.target.value === "NEW";
        document.getElementById("l-cnotes-label").textContent = isNew ? "Box / warranty details" : "Condition details";
        form.conditionNotes.placeholder = isNew ? "Sealed box, 1-year warranty…" : "Scratches, defects, missing accessories, how long you used it…";
      }
    });
    document.getElementById("add-spec").addEventListener("click", () => {
      if (form.querySelectorAll(".spec-row").length >= 20) return;
      document.getElementById("specs").insertAdjacentHTML("beforeend", specRow());
    });
    form.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-remove-spec]");
      if (rm) rm.closest(".spec-row").remove();
      const del = e.target.closest("[data-ph-del]");
      if (del) {
        photos.splice(Number(del.dataset.phDel), 1);
        renderPhotos();
      }
      const left = e.target.closest("[data-ph-left]");
      if (left) {
        const i = Number(left.dataset.phLeft);
        [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]];
        renderPhotos();
      }
    });
    document.getElementById("cancel-edit")?.addEventListener("click", () => {
      renderForm(null);
      switchTab("listings");
    });
    form.addEventListener("submit", submitListing);
  }

  async function openEdit(id) {
    try {
      const p = await GP.api(`/api/seller/products/${encodeURIComponent(id)}`);
      renderForm(p);
      switchTab("new");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      GP.toast(e.message, "error");
    }
  }

  async function submitListing(e) {
    e.preventDefault();
    const form = e.target;
    const err = document.getElementById("l-error");
    err.hidden = true;
    const showErr = (m, field) => {
      err.textContent = m;
      err.hidden = false;
      field?.focus();
    };
    if (photos.some((p) => p.uploading)) return showErr("Please wait for photos to finish uploading");
    const specs = [...form.querySelectorAll(".spec-row")]
      .map((r) => ({ label: r.querySelector('[name="specLabel"]').value.trim(), value: r.querySelector('[name="specValue"]').value.trim() }))
      .filter((s) => s.label || s.value);
    if (specs.some((s) => !s.label || !s.value)) return showErr("Fill in both the name and value for each specification, or remove the empty row");
    const body = {
      title: form.title.value.trim(),
      categoryId: form.categoryId.value,
      brand: form.brand.value.trim() || null,
      condition: form.querySelector('[name="condition"]:checked')?.value,
      conditionNotes: form.conditionNotes.value.trim() || null,
      price: Number(form.price.value),
      quantity: Number(form.quantity.value || 1),
      availability: form.availability.value,
      description: form.description.value.trim(),
      specs,
      location: form.location.value.trim(),
      contactPhone: form.contactPhone.value.trim(),
      contactEmail: form.contactEmail.value.trim() || null,
      imageIds: photos.map((p) => p.id)
    };
    if (!body.imageIds.length) return showErr("Add at least one photo of the item");
    if (body.title.length < 3) return showErr("Enter the product name", form.title);
    if (!body.categoryId) return showErr("Choose a category", form.categoryId);
    if (!(body.price >= 1) || !Number.isInteger(body.price)) return showErr("Enter a valid price in RWF (whole number)", form.price);
    if (body.description.length < 20) return showErr("The description needs at least 20 characters", form.description);
    if (body.location.length < 2) return showErr("Enter the item's location", form.location);
    if (!/^\+?[0-9 ()-]{7,20}$/.test(body.contactPhone)) return showErr("Enter a valid phone number", form.contactPhone);

    const btn = form.querySelector("button[type=submit]");
    GP.setLoading(btn, true, "Saving…");
    try {
      if (editing) {
        const r = await GP.api(`/api/seller/products/${encodeURIComponent(editing)}`, { method: "PATCH", body });
        GP.toast(r.reReview ? "Saved. Sent back for a quick review." : "Changes saved", "success");
      } else {
        const r = await GP.api("/api/seller/products", { method: "POST", body });
        GP.toast(r.status === "PENDING_REVIEW" ? "Submitted! We'll let you know once it's approved." : "Your listing is live!", "success");
      }
      editing = null;
      await refresh();
      renderForm(null);
      switchTab("listings");
    } catch (e2) {
      showErr(e2.message);
      GP.setLoading(btn, false);
    }
  }

  // ── Inquiries ───────────────────────────────────────────
  function renderInquiries() {
    const el = app.querySelector('[data-panel="inquiries"]');
    if (!inquiries.length) {
      el.innerHTML = GP.emptyState("fa-inbox", "No inquiries yet", "When buyers contact you about a listing, their messages appear here and in your email.");
      return;
    }
    el.innerHTML = `<div class="gp-notes">${inquiries
      .map(
        (q) => `
        <div class="gp-note ${q.readAt ? "" : "unread"}">
          <div class="ic"><i class="fas fa-comment-dots"></i></div>
          <div>
            <h4 class="gp-normal">${esc(q.name)} · <a href="/marketplace/${esc(q.product.id)}" style="color:var(--gp-accent)">${esc(q.product.title)}</a></h4>
            <p class="gp-normal">${esc(q.message)}</p>
            <div class="gp-meta gp-small" style="margin-top:.6rem;display:flex;gap:1.2rem;flex-wrap:wrap">
              ${q.phone ? `<a href="tel:${esc(q.phone.replace(/[^0-9+]/g, ""))}" style="color:var(--gp-accent)"><i class="fas fa-phone"></i> ${esc(q.phone)}</a>` : ""}
              ${q.email ? `<a href="mailto:${esc(q.email)}?subject=${encodeURIComponent(`Re: ${q.product.title}`)}" style="color:var(--gp-accent)" class="gp-normal"><i class="fas fa-envelope"></i> ${esc(q.email)}</a>` : ""}
            </div>
          </div>
          <span class="gp-small">${esc(GP.timeAgo(q.createdAt))}</span>
        </div>`
      )
      .join("")}</div>`;
  }

  async function markInquiriesRead() {
    const unread = inquiries.filter((i) => !i.readAt);
    if (!unread.length) return;
    await Promise.all(unread.map((i) => GP.api(`/api/seller/inquiries/${encodeURIComponent(i.id)}/read`, { method: "POST" }).catch(() => {})));
    unread.forEach((i) => (i.readAt = new Date().toISOString()));
    app.querySelector('[data-tab="inquiries"] .gp-count')?.remove();
  }

  // ── Seller profile ──────────────────────────────────────
  function renderProfile(el, first = false) {
    const p = profile || {};
    el.innerHTML = `
      <form class="gp-form gp-card" id="profile-form" novalidate style="max-width:760px">
        <h2>${first ? "Set up your seller profile" : "Seller profile"}</h2>
        <p class="gp-muted" style="margin-bottom:1.6rem">${first ? "Tell buyers who they're buying from. You only need to do this once." : "This is shown to buyers on your listings."}</p>
        <div class="gp-field"><label>I'm selling as</label>
          <div class="gp-choice">
            <label><input type="radio" name="type" value="INDIVIDUAL" ${p.type !== "STORE" ? "checked" : ""} /><span><i class="fas fa-user"></i> An individual</span></label>
            <label><input type="radio" name="type" value="STORE" ${p.type === "STORE" ? "checked" : ""} /><span><i class="fas fa-store"></i> A gaming store / business</span></label>
          </div></div>
        <div class="gp-row">
          <div class="gp-field"><label for="s-name">Display / store name <span class="req">*</span></label><input id="s-name" name="displayName" maxlength="80" required value="${esc(p.displayName || "")}" /></div>
          <div class="gp-field"><label for="s-loc">Location <span class="req">*</span></label><input id="s-loc" name="location" maxlength="80" required placeholder="e.g. Kicukiro, Kigali" value="${esc(p.location || "")}" /></div>
        </div>
        <div class="gp-row">
          <div class="gp-field"><label for="s-phone">Phone <span class="req">*</span></label><input id="s-phone" name="phone" type="tel" maxlength="20" required placeholder="+250…" value="${esc(p.phone || "")}" /></div>
          <div class="gp-field"><label for="s-wa">WhatsApp number</label><input id="s-wa" name="whatsapp" type="tel" maxlength="20" placeholder="Optional" value="${esc(p.whatsapp || "")}" /></div>
        </div>
        <div class="gp-field"><label for="s-bio">About you / your store</label><textarea id="s-bio" name="bio" rows="3" maxlength="500">${esc(p.bio || "")}</textarea></div>
        <p class="gp-form-error" id="s-error" hidden></p>
        <button class="btn btn-secondary" type="submit"><i class="fas fa-check"></i> ${first ? "Continue" : "Save profile"}</button>
      </form>`;
    el.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const err = el.querySelector("#s-error");
      err.hidden = true;
      const body = {
        displayName: f.displayName.value.trim(),
        type: f.querySelector('[name="type"]:checked').value,
        location: f.location.value.trim(),
        phone: f.phone.value.trim(),
        whatsapp: f.whatsapp.value.trim() || null,
        bio: f.bio.value.trim() || null
      };
      const bad = body.displayName.length < 2 ? "Enter a display name" : body.location.length < 2 ? "Enter your location" : !/^\+?[0-9 ()-]{7,20}$/.test(body.phone) ? "Enter a valid phone number" : body.whatsapp && !/^\+?[0-9 ()-]{7,20}$/.test(body.whatsapp) ? "Enter a valid WhatsApp number" : null;
      if (bad) {
        err.textContent = bad;
        err.hidden = false;
        return;
      }
      const btn = f.querySelector("button[type=submit]");
      GP.setLoading(btn, true, "Saving…");
      try {
        const r = await GP.api("/api/seller/profile", { method: "PUT", body });
        profile = r.profile;
        GP.toast(r.listingsUpdated ? `Profile saved. Phone updated on ${r.listingsUpdated} listing(s).` : "Profile saved", "success");
        if (first) {
          tab = "new";
          await refresh();
        } else GP.setLoading(btn, false);
      } catch (e2) {
        err.textContent = e2.message;
        err.hidden = false;
        GP.setLoading(btn, false);
      }
    });
  }

  // ── Data ────────────────────────────────────────────────
  async function refresh() {
    const [prods, inq] = await Promise.all([GP.api("/api/seller/products"), GP.api("/api/seller/inquiries")]);
    listings = prods.items;
    stats = prods.stats;
    inquiries = inq;
    const keepForm = editing;
    shell();
    if (keepForm) openEdit(keepForm);
  }

  (async function init() {
    const me = await GP.me();
    if (!me?.user) {
      app.innerHTML = GP.emptyState("fa-user-lock", "Sign in to start selling", "Create a free account or sign in to list your gaming gear.", `<a class="btn btn-secondary" href="/signin?next=/sell">Sign in</a> <a class="btn gp-btn-ghost" href="/signup">Create account</a>`);
      return;
    }
    if (me.user.twoFactorOn && !me.twoFactorOk) {
      location.href = "/2fa";
      return;
    }
    try {
      const [prof, cats] = await Promise.all([GP.api("/api/seller/profile"), GP.api("/api/marketplace/categories")]);
      profile = prof.profile;
      moderation = prof.moderation;
      categories = cats;
      if (!profile) {
        app.innerHTML = `<div></div>`;
        renderProfile(app.firstElementChild, true);
        return;
      }
      await refresh();
      const editId = GP.qs("edit");
      if (editId) openEdit(editId);
    } catch (e) {
      app.innerHTML = GP.emptyState("fa-triangle-exclamation", "Couldn't load your dashboard", e.message, `<button class="btn btn-secondary" onclick="location.reload()">Try again</button>`);
    }
  })();
})();
