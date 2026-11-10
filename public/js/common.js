// Shared helpers for marketplace, advertising, notifications and admin pages.
(function () {
  const GP = {};

  GP.escapeHtml = function (s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  };
  const esc = GP.escapeHtml;

  // fetch JSON; throws Error(message) with .status on failure
  GP.api = async function (url, { method = "GET", body, headers } = {}) {
    const opts = { method, headers: { Accept: "application/json", ...(headers || {}) } };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch {
      const e = new Error("Network error. Check your connection and try again.");
      e.status = 0;
      throw e;
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const e = new Error(data?.error || `Request failed (${res.status})`);
      e.status = res.status;
      e.data = data;
      throw e;
    }
    return data;
  };

  GP.me = async function () {
    try {
      return await GP.api("/api/auth/me");
    } catch {
      return null;
    }
  };

  GP.money = function (amount, currency = "RWF") {
    return `${Number(amount || 0).toLocaleString("en-US")} ${currency}`;
  };

  GP.date = function (iso, withTime = false) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString([], withTime ? { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" } : { year: "numeric", month: "short", day: "2-digit" });
  };

  GP.timeAgo = function (iso) {
    const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
    const d = Math.round(h / 24);
    if (d < 30) return `${d} day${d > 1 ? "s" : ""} ago`;
    return GP.date(iso);
  };

  // Font Awesome needs "fab" for brand logos (PlayStation, Xbox, …) and "fas" for everything else
  const BRAND_ICONS = new Set(["fa-playstation", "fa-xbox", "fa-steam", "fa-twitch", "fa-discord", "fa-windows", "fa-apple", "fa-android"]);
  GP.icon = function (name) {
    const n = /^fa-[a-z0-9-]+$/.test(name || "") ? name : "fa-gamepad";
    return `<i class="${BRAND_ICONS.has(n) ? "fab" : "fas"} ${n}"></i>`;
  };

  GP.label = function (s) {
    return String(s || "").toLowerCase().replaceAll("_", " ");
  };

  // Status pill reusing the admin pill style colors
  const pillTone = {
    ACTIVE: "ok", SUCCESSFUL: "ok", APPROVED: "ok", RESOLVED: "ok", AVAILABLE: "ok",
    PENDING_REVIEW: "wait", PENDING: "wait", PENDING_PAYMENT: "wait", PAYMENT_PENDING_VERIFICATION: "wait", PENDING_APPROVAL: "wait", DRAFT: "muted", OPEN: "wait", RESERVED: "wait",
    DECLINED: "bad", REMOVED: "bad", FAILED: "bad", SUSPENDED: "bad", CANCELLED: "bad", OUT_OF_STOCK: "bad",
    SOLD: "muted", INACTIVE: "muted", EXPIRED: "muted", REFUNDED: "muted", DISMISSED: "muted"
  };
  const friendly = {
    PENDING_REVIEW: "In review",
    PAYMENT_PENDING_VERIFICATION: "Payment being verified",
    PENDING_APPROVAL: "Awaiting approval",
    PENDING_PAYMENT: "Awaiting payment",
    APPROVED: "Approved (queued)",
    OUT_OF_STOCK: "Out of stock",
    INACTIVE: "Hidden"
  };
  GP.pill = function (status) {
    const tone = pillTone[status] || "muted";
    return `<span class="gp-pill ${tone}">${esc(friendly[status] || GP.label(status))}</span>`;
  };

  // ── Category artwork (used when a listing has no photo) ──
  const ART = {
    consoles: "console", "playstation-5": "console", "playstation-4": "console", "playstation-3": "console",
    "xbox-series-x": "console", "xbox-series-s": "console", "xbox-one": "console", "nintendo-switch": "console", "other-consoles": "console",
    controllers: "controller", "ps5-controllers": "controller", "ps4-controllers": "controller", "xbox-controllers": "controller", "nintendo-controllers": "controller", "other-controllers": "controller",
    accessories: "headset", "gaming-headsets": "headset", "gaming-keyboards": "keyboard", "gaming-mice": "keyboard", "gaming-chairs": "chair",
    "gaming-monitors": "monitor", "steering-wheels": "wheel", "charging-stations": "cable", "vr-equipment": "vr", "cables-adapters": "cable",
    equipment: "pc", "gaming-pcs": "pc", "graphics-cards": "pc", "ram-storage": "pc", "gaming-laptops": "monitor", "other-hardware": "pc",
    services: "service", "gaming-station-equipment": "service", "gaming-room-equipment": "chair", "other-services": "service"
  };
  GP.categoryArt = function (slug, parentSlug) {
    const key = ART[slug] || ART[parentSlug] || "controller";
    return `/images/market/${key}.svg`;
  };
  GP.productImage = function (p) {
    return p.imageUrl || GP.categoryArt(p.category?.slug, p.category?.parentSlug);
  };

  // ── Toasts ──
  GP.toast = function (message, type = "info") {
    let host = document.getElementById("gp-toasts");
    if (!host) {
      host = document.createElement("div");
      host.id = "gp-toasts";
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }
    const t = document.createElement("div");
    t.className = `gp-toast ${type}`;
    const icon = type === "error" ? "fa-circle-exclamation" : type === "success" ? "fa-circle-check" : "fa-circle-info";
    t.innerHTML = `<i class="fas ${icon}"></i><span></span>`;
    t.querySelector("span").textContent = message;
    host.appendChild(t);
    setTimeout(() => t.classList.add("out"), 4200);
    setTimeout(() => t.remove(), 4700);
  };

  // ── Modal dialogs ──
  // GP.modal({ title, html, actions:[{label, value, kind}] }) → Promise<{value, form}>
  GP.modal = function ({ title, html = "", actions = [{ label: "OK", value: true }], wide = false }) {
    return new Promise((resolve) => {
      const wrap = document.createElement("div");
      wrap.className = "gp-modal-backdrop";
      wrap.innerHTML = `
        <div class="gp-modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="gp-modal-title">
          <div class="gp-modal-head">
            <h3 id="gp-modal-title"></h3>
            <button type="button" class="gp-icon-btn" data-close aria-label="Close"><i class="fas fa-xmark"></i></button>
          </div>
          <form class="gp-modal-body" novalidate>${html}</form>
          <div class="gp-modal-actions"></div>
        </div>`;
      wrap.querySelector("#gp-modal-title").textContent = title;
      const form = wrap.querySelector("form");
      const actionsEl = wrap.querySelector(".gp-modal-actions");
      const close = (value) => {
        document.removeEventListener("keydown", onKey);
        wrap.remove();
        resolve({ value, form });
      };
      const onKey = (e) => {
        if (e.key === "Escape") close(null);
      };
      actions.forEach((a) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `btn ${a.kind === "primary" ? "btn-secondary" : a.kind === "danger" ? "gp-btn-danger" : "btn-ghost gp-btn-ghost"}`;
        b.textContent = a.label;
        b.addEventListener("click", () => {
          if (a.validate && !a.validate(form)) return;
          close(a.value);
        });
        actionsEl.appendChild(b);
      });
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const primary = actions.find((a) => a.kind === "primary" || a.kind === "danger");
        if (primary && (!primary.validate || primary.validate(form))) close(primary.value);
      });
      wrap.addEventListener("click", (e) => {
        if (e.target === wrap || e.target.closest("[data-close]")) close(null);
      });
      document.addEventListener("keydown", onKey);
      document.body.appendChild(wrap);
      (form.querySelector("input,textarea,select") || actionsEl.querySelector("button"))?.focus();
    });
  };

  GP.confirm = async function (title, message, { confirmLabel = "Confirm", danger = false } = {}) {
    const r = await GP.modal({
      title,
      html: `<p class="gp-muted">${esc(message)}</p>`,
      actions: [
        { label: "Cancel", value: false },
        { label: confirmLabel, value: true, kind: danger ? "danger" : "primary" }
      ]
    });
    return r.value === true;
  };

  // Ask for a text value (e.g. a decline reason). Returns string or null if cancelled.
  GP.prompt = async function (title, { label = "", placeholder = "", required = false, multiline = true, confirmLabel = "Save", danger = false, type = "text", value = "" } = {}) {
    const field = multiline
      ? `<textarea name="v" rows="4" maxlength="500" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input name="v" type="${type}" placeholder="${esc(placeholder)}" value="${esc(value)}" />`;
    const r = await GP.modal({
      title,
      html: `<label class="gp-label">${esc(label)}</label>${field}<p class="gp-field-error" hidden></p>`,
      actions: [
        { label: "Cancel", value: null },
        {
          label: confirmLabel,
          value: "ok",
          kind: danger ? "danger" : "primary",
          validate: (form) => {
            const v = form.elements.v.value.trim();
            const err = form.querySelector(".gp-field-error");
            if (required && !v) {
              err.textContent = "This is required.";
              err.hidden = false;
              return false;
            }
            return true;
          }
        }
      ]
    });
    return r.value === "ok" ? r.form.elements.v.value.trim() : null;
  };

  // ── Image upload: resize in the browser, then upload as raw bytes ──
  const MAX_DIM = 1600;
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("That file isn't a valid image"));
      };
      img.src = url;
    });
  }
  async function compress(file, maxDim) {
    const img = await loadImage(file);
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    for (const q of [0.85, 0.75, 0.6]) {
      const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", q));
      const out = blob && blob.type === "image/webp" ? blob : await new Promise((r) => canvas.toBlob(r, "image/jpeg", q));
      if (out && out.size <= 1.8 * 1024 * 1024) return out;
    }
    throw new Error("That image is too large even after resizing");
  }
  GP.uploadImage = async function (file, { maxDim = MAX_DIM } = {}) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use a JPG, PNG or WebP image");
    if (file.size > 15 * 1024 * 1024) throw new Error("Images must be smaller than 15 MB");
    const blob = await compress(file, maxDim);
    const res = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Upload failed");
    return data; // { id, url }
  };

  GP.qs = function (name) {
    return new URLSearchParams(location.search).get(name);
  };

  GP.setLoading = function (btn, loading, text) {
    if (!btn) return;
    if (loading) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${esc(text || "Working…")}`;
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  };

  GP.emptyState = function (icon, title, text, actionHtml = "") {
    return `<div class="gp-empty"><i class="fas ${icon}"></i><h3>${esc(title)}</h3><p>${esc(text)}</p>${actionHtml}</div>`;
  };

  window.GP = GP;
})();
