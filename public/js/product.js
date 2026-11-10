(function () {
  const esc = GP.escapeHtml;
  const root = document.getElementById("product");
  const id = decodeURIComponent(location.pathname.split("/").filter(Boolean)[1] || "");
  const availText = { AVAILABLE: "Available", RESERVED: "Reserved", OUT_OF_STOCK: "Out of stock" };
  const statusNotes = {
    PENDING_REVIEW: ["info", "fa-hourglass-half", "This listing is waiting for approval. Only you and GamePro admins can see it."],
    DECLINED: ["bad", "fa-circle-xmark", "This listing was declined"],
    INACTIVE: ["warn", "fa-eye-slash", "This listing is hidden. Buyers can't see it."],
    REMOVED: ["bad", "fa-ban", "This listing was removed by GamePro"],
    SOLD: ["ok", "fa-handshake", "This item has been sold."]
  };

  function waLink(num, title) {
    const digits = String(num || "").replace(/[^0-9]/g, "");
    const intl = digits.startsWith("0") ? `250${digits.slice(1)}` : digits;
    return `https://wa.me/${intl}?text=${encodeURIComponent(`Hi, I'm interested in "${title}" on GamePro Marketplace.`)}`;
  }

  function render(p) {
    document.title = `${p.title} - GamePro Marketplace`;
    const images = p.images.length ? p.images : [GP.categoryArt(p.category.slug, p.category.parentSlug)];
    const note = statusNotes[p.status];
    const sold = p.status === "SOLD";
    const canContact = p.status === "ACTIVE" && !p.isOwner;
    const phoneDigits = String(p.contactPhone || "").replace(/[^0-9+]/g, "");

    root.innerHTML = `
      <nav class="mk-crumbs" aria-label="Breadcrumb">
        <a href="/marketplace">Marketplace</a> <span>/</span>
        ${p.category.parentName ? `<a href="/marketplace?category=${esc(p.category.parentSlug)}">${esc(p.category.parentName)}</a> <span>/</span>` : ""}
        <a href="/marketplace?category=${esc(p.category.slug)}">${esc(p.category.name)}</a>
      </nav>

      ${
        note && (p.isOwner || sold || p.status !== "ACTIVE")
          ? `<div class="mk-notice ${note[0]}"><i class="fas ${note[1]}"></i><div>${esc(note[2])}${p.declineReason ? `: <span class="gp-normal">${esc(p.declineReason)}</span>` : "."}
             ${p.isOwner ? ` <a href="/sell" style="color:var(--gp-accent)">Manage in your seller dashboard</a>` : ""}</div></div>`
          : ""
      }

      <div class="mk-detail">
        <div class="mk-gallery">
          <div class="mk-gallery-main">
            <img id="g-main" src="${esc(images[0])}" alt="${esc(p.title)}" />
            ${images.length > 1 ? `<button type="button" class="mk-nav prev" aria-label="Previous photo"><i class="fas fa-chevron-left"></i></button><button type="button" class="mk-nav next" aria-label="Next photo"><i class="fas fa-chevron-right"></i></button>` : ""}
          </div>
          ${
            images.length > 1
              ? `<div class="mk-gallery-thumbs">${images.map((src, i) => `<button type="button" class="${i === 0 ? "on" : ""}" data-i="${i}" aria-label="Photo ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy" /></button>`).join("")}</div>`
              : ""
          }
        </div>

        <div class="mk-info">
          <div class="mk-info-row">
            ${sold ? `<span class="mk-badge sold">Sold</span>` : `<span class="mk-badge ${p.condition === "NEW" ? "new" : "used"}">${p.condition === "NEW" ? "Brand new" : "Used"}</span>`}
            <span class="mk-card-cat">${GP.icon(p.category.icon)} ${esc(p.category.name)}</span>
          </div>
          <h1 class="gp-normal">${esc(p.title)}</h1>
          <div class="mk-price">${esc(GP.money(p.price, p.currency))}</div>

          <div class="mk-facts">
            <div class="mk-fact"><div class="k">Availability</div><div class="v mk-avail ${esc(p.availability)}">${esc(availText[p.availability])}${p.quantity > 1 ? ` · ${p.quantity} in stock` : ""}</div></div>
            <div class="mk-fact"><div class="k">Location</div><div class="v gp-normal">${esc(p.location)}</div></div>
            <div class="mk-fact"><div class="k">Brand</div><div class="v gp-normal">${esc(p.brand || "—")}</div></div>
            <div class="mk-fact"><div class="k">Listed</div><div class="v">${esc(GP.timeAgo(p.publishedAt || p.createdAt))}</div></div>
          </div>

          <div class="mk-actions">
            ${canContact ? `<a class="btn btn-secondary" href="#contact"><i class="fas fa-envelope"></i> Contact seller</a>` : ""}
            ${canContact && phoneDigits ? `<a class="btn gp-btn-ghost" href="tel:${esc(phoneDigits)}" id="call-btn"><i class="fas fa-phone"></i> <span>Show number</span></a>` : ""}
            ${canContact && p.seller.whatsapp ? `<a class="btn gp-btn-ghost" target="_blank" rel="noopener noreferrer" href="${esc(waLink(p.seller.whatsapp, p.title))}"><i class="fab fa-whatsapp"></i> WhatsApp</a>` : ""}
            ${!p.isOwner && !sold ? `<button type="button" class="btn gp-btn-ghost mk-fav-inline ${p.isFavorite ? "on" : ""}" data-fav="${esc(p.id)}" aria-pressed="${p.isFavorite}"><i class="${p.isFavorite ? "fas" : "far"} fa-heart"></i> <span>${p.isFavorite ? "Saved" : "Save"}</span></button>` : ""}
            <button type="button" class="btn gp-btn-ghost" id="share-btn"><i class="fas fa-share-nodes"></i> Share</button>
            ${p.isOwner ? `<a class="btn btn-secondary" href="/sell?edit=${esc(p.id)}"><i class="fas fa-pen"></i> Edit listing</a>` : ""}
          </div>

          <div class="mk-condition-box ${p.condition === "NEW" ? "new" : ""}">
            <h4><i class="fas ${p.condition === "NEW" ? "fa-box" : "fa-clipboard-check"}"></i> ${p.condition === "NEW" ? "New item" : "Used item: condition notes"}</h4>
            <p class="gp-muted gp-normal">${esc(p.conditionNotes || (p.condition === "NEW" ? "Brand new item." : "The seller didn't add condition notes. Ask them about scratches, defects or missing accessories before buying."))}</p>
          </div>

          <div class="gp-card">
            <div class="mk-seller">
              <div class="mk-avatar">${esc((p.seller.displayName || "?").trim().charAt(0).toUpperCase())}</div>
              <div>
                <div style="font-size:1.7rem;font-weight:700" class="gp-normal">${esc(p.seller.displayName)}</div>
                <div class="gp-small">${p.seller.type === "STORE" ? '<i class="fas fa-store"></i> Gaming store' : '<i class="fas fa-user"></i> Individual seller'} · Member since ${esc(GP.date(p.seller.memberSince))}</div>
              </div>
            </div>
            <div class="gp-small gp-normal"><i class="fas fa-location-dot"></i> ${esc(p.seller.location)} · ${p.seller.activeListings} active listing${p.seller.activeListings === 1 ? "" : "s"}</div>
            ${p.seller.bio ? `<p class="gp-muted gp-normal" style="margin-top:1rem">${esc(p.seller.bio)}</p>` : ""}
          </div>
        </div>
      </div>

      <div class="mk-section mk-two">
        <div>
          <h2 class="section-h">Description</h2>
          <div class="gp-card"><p class="mk-desc">${esc(p.description)}</p></div>
          ${
            p.specs.length
              ? `<h2 style="font-size:2.2rem;margin:2.4rem 0 1.2rem">Specifications</h2>
                 <div class="gp-card"><table class="mk-specs">${p.specs.map((s) => `<tr><th class="gp-normal">${esc(s.label)}</th><td class="gp-normal">${esc(s.value)}</td></tr>`).join("")}</table></div>`
              : ""
          }
          <p class="gp-small" style="margin-top:1.6rem">
            <i class="far fa-eye"></i> ${p.viewCount} view${p.viewCount === 1 ? "" : "s"} · <i class="far fa-heart"></i> ${p.favoriteCount} saved
            ${!p.isOwner ? ` · <button type="button" class="gp-icon-btn" id="report-btn" style="font-size:1.25rem"><i class="far fa-flag"></i> Report listing</button>` : ""}
          </p>
        </div>

        <div id="contact">
          ${
            canContact
              ? `<div class="gp-card">
                  <h3><i class="fas fa-envelope"></i> Contact the seller</h3>
                  <p class="gp-small" style="margin-bottom:1.4rem">Your message goes straight to the seller. GamePro doesn't handle payments for marketplace items: meet in a safe public place and check the item before paying.</p>
                  <form class="gp-form" id="inquiry-form" novalidate>
                    <div class="gp-field"><label for="i-name">Your name <span class="req">*</span></label><input id="i-name" name="name" required maxlength="80" /></div>
                    <div class="gp-row">
                      <div class="gp-field"><label for="i-phone">Phone</label><input id="i-phone" name="phone" type="tel" placeholder="+250…" maxlength="20" /></div>
                      <div class="gp-field"><label for="i-email">Email</label><input id="i-email" name="email" type="email" maxlength="120" /></div>
                    </div>
                    <div class="gp-field"><label for="i-msg">Message <span class="req">*</span></label>
                      <textarea id="i-msg" name="message" rows="4" maxlength="2000" required>Hi, is the "${esc(p.title)}" still available?</textarea></div>
                    <p class="gp-form-error" id="i-error" hidden></p>
                    <button class="btn btn-secondary" type="submit" style="width:100%"><i class="fas fa-paper-plane"></i> Send message</button>
                  </form>
                </div>`
              : sold
                ? `<div class="gp-card">${GP.emptyState("fa-handshake", "This item is sold", "Browse similar items below or search the marketplace.", `<a class="btn btn-secondary" href="/marketplace?category=${esc(p.category.slug)}">See similar items</a>`)}</div>`
                : ""
          }
        </div>
      </div>

      ${
        p.related.length
          ? `<section class="mk-section"><h2>Related products</h2><div class="mk-grid" id="related">${p.related.map(GP.productCard).join("")}</div></section>`
          : ""
      }`;

    // Gallery
    let idx = 0;
    const main = document.getElementById("g-main");
    const show = (i) => {
      idx = (i + images.length) % images.length;
      main.src = images[idx];
      root.querySelectorAll(".mk-gallery-thumbs button").forEach((b, j) => b.classList.toggle("on", j === idx));
    };
    root.querySelector(".mk-nav.prev")?.addEventListener("click", () => show(idx - 1));
    root.querySelector(".mk-nav.next")?.addEventListener("click", () => show(idx + 1));
    root.querySelector(".mk-gallery-thumbs")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-i]");
      if (b) show(Number(b.dataset.i));
    });
    main.addEventListener("click", () => {
      const lb = document.createElement("div");
      lb.className = "mk-lightbox";
      lb.innerHTML = `<img src="${esc(images[idx])}" alt="${esc(p.title)}" />`;
      lb.addEventListener("click", () => lb.remove());
      document.body.appendChild(lb);
    });

    // Reveal the phone number on first click, call on second
    const call = document.getElementById("call-btn");
    if (call) {
      call.addEventListener("click", (e) => {
        if (call.dataset.revealed) return;
        e.preventDefault();
        call.dataset.revealed = "1";
        call.querySelector("span").textContent = p.contactPhone;
      });
    }

    // Favorite on this page
    root.querySelector(".mk-fav-inline")?.addEventListener("gp:fav", (e) => {
      e.target.querySelector("span").textContent = e.detail.isFavorite ? "Saved" : "Save";
    });
    GP.bindFavorites(root);

    document.getElementById("share-btn").addEventListener("click", async () => {
      const url = location.origin + location.pathname;
      try {
        if (navigator.share) await navigator.share({ title: p.title, url });
        else {
          await navigator.clipboard.writeText(url);
          GP.toast("Link copied", "success");
        }
      } catch {
        /* share dismissed */
      }
    });

    document.getElementById("report-btn")?.addEventListener("click", async () => {
      const reasons = ["Scam or fraud", "Wrong category", "Prohibited item", "Misleading information", "Duplicate listing", "Other"];
      const r = await GP.modal({
        title: "Report this listing",
        html: `<label class="gp-label" for="r-reason">Reason</label>
               <select id="r-reason" name="reason">${reasons.map((x) => `<option>${esc(x)}</option>`).join("")}</select>
               <label class="gp-label" for="r-details">Details (optional)</label>
               <textarea id="r-details" name="details" rows="3" maxlength="1000"></textarea>`,
        actions: [{ label: "Cancel", value: null }, { label: "Send report", value: "send", kind: "danger" }]
      });
      if (r.value !== "send") return;
      try {
        await GP.api(`/api/marketplace/products/${encodeURIComponent(p.id)}/report`, { method: "POST", body: { reason: r.form.reason.value, details: r.form.details.value } });
        GP.toast("Thanks. Our team will review this listing.", "success");
      } catch (e) {
        GP.toast(e.message, "error");
      }
    });

    const inq = document.getElementById("inquiry-form");
    if (inq) {
      GP.me().then((me) => {
        if (me?.user) {
          inq.name.value ||= me.user.name || "";
          inq.email.value ||= me.user.email || "";
        }
      });
      inq.addEventListener("submit", async (e) => {
        e.preventDefault();
        const err = document.getElementById("i-error");
        err.hidden = true;
        const body = { name: inq.name.value.trim(), phone: inq.phone.value.trim() || null, email: inq.email.value.trim() || null, message: inq.message.value.trim() };
        if (body.name.length < 2) return showErr("Enter your name");
        if (!body.phone && !body.email) return showErr("Add a phone number or email so the seller can reply");
        if (body.message.length < 5) return showErr("Write a short message");
        const btn = inq.querySelector("button[type=submit]");
        GP.setLoading(btn, true, "Sending…");
        try {
          await GP.api(`/api/marketplace/products/${encodeURIComponent(p.id)}/inquiries`, { method: "POST", body });
          inq.outerHTML = `<div class="mk-notice ok"><i class="fas fa-circle-check"></i><div>Message sent! The seller will contact you${body.phone ? " by phone" : ""}${body.email ? `${body.phone ? " or" : ""} by email` : ""}.</div></div>`;
        } catch (e2) {
          showErr(e2.message);
          GP.setLoading(btn, false);
        }
        function showErr(m) {
          err.textContent = m;
          err.hidden = false;
        }
      });
    }
  }

  (async function init() {
    try {
      render(await GP.api(`/api/marketplace/products/${encodeURIComponent(id)}`));
    } catch (e) {
      root.innerHTML = GP.emptyState(
        e.status === 404 ? "fa-box-open" : "fa-triangle-exclamation",
        e.status === 404 ? "Listing not available" : "Couldn't load this listing",
        e.status === 404 ? "It may have been sold or removed." : e.message,
        `<a class="btn btn-secondary" href="/marketplace">Back to the marketplace</a>`
      );
    }
  })();
})();
