function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString([], { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function fetchMe() {
  const res = await fetch("/api/auth/me");
  if (!res.ok) return null;
  return await res.json();
}

function pill(status) {
  const cls =
    status === "CONFIRMED" ? "confirmed" : status === "CANCELLED" ? "cancelled" : "pending";
  return `<span class="pill ${cls}">${status}</span>`;
}

async function updateStatus(id, status) {
  const res = await fetch(`/api/admin/bookings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
  const data = await res.json();
  return { res, data };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadBookings() {
  const msg = document.getElementById("admin-result");
  const wrap = document.getElementById("bookings");
  const empty = document.getElementById("admin-empty");
  const statTotal = document.getElementById("stat-total");
  const statPending = document.getElementById("stat-pending");
  const statConfirmed = document.getElementById("stat-confirmed");

  msg.textContent = "Loading…";
  wrap.innerHTML = "";
  if (empty) empty.style.display = "none";

  const me = await fetchMe();
  if (!me?.user) {
    window.location.href = "/signin";
    return;
  }
  if (!me.user.isAdmin) {
    msg.textContent = "Access denied. Redirecting…";
    window.location.href = "/signin";
    return;
  }

  // Reveal the admin UI now that we've confirmed the user is an admin
  document.getElementById("admin-stats").style.display = "";
  document.getElementById("admin-panel").style.display = "";

  const res = await fetch("/api/admin/bookings");
  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data?.error || "Failed to load bookings.";
    return;
  }

  const total = Array.isArray(data) ? data.length : 0;
  const pending = Array.isArray(data) ? data.filter((b) => b.status === "PENDING").length : 0;
  const confirmed = Array.isArray(data) ? data.filter((b) => b.status === "CONFIRMED").length : 0;
  if (statTotal) statTotal.textContent = String(total);
  if (statPending) statPending.textContent = String(pending);
  if (statConfirmed) statConfirmed.textContent = String(confirmed);
  msg.textContent = "Up to date.";

  if (!Array.isArray(data) || data.length === 0) {
    if (empty) empty.style.display = "block";
    return;
  }

  wrap.innerHTML = data
    .map((b) => {
      const gameTitle = escapeHtml(b.game?.title || "Game");
      const who = b.user
        ? `${b.user.email}${b.user.name ? ` (${b.user.name})` : ""}`
        : `${b.email || "Guest"}${b.name ? ` (${b.name})` : ""}`;

      const notes = b.notes ? escapeHtml(b.notes) : "";

      return `
      <tr>
        <td data-label="Game">
          <div class="cell-title">
            <div class="name">${gameTitle}</div>
            <div class="sub">${notes ? `Notes: ${notes}` : "—"}</div>
          </div>
        </td>
        <td data-label="When">
          <div>${escapeHtml(formatDate(b.date))}</div>
        </td>
        <td data-label="Customer">
          <div>${escapeHtml(who)}</div>
          <div class="sub">${escapeHtml(b.phone || "-")}</div>
        </td>
        <td data-label="Status">
          ${pill(b.status)}
        </td>
        <td data-label="Actions" style="text-align:right">
          <div class="row-actions">
            <button class="btn" data-action="confirm" data-id="${b.id}" type="button">Confirm</button>
            <button class="btn btn-ghost" data-action="pending" data-id="${b.id}" type="button">Pending</button>
            <button class="btn btn-ghost" data-action="cancel" data-id="${b.id}" type="button">Cancel</button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");

  wrap.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const status = action === "confirm" ? "CONFIRMED" : action === "cancel" ? "CANCELLED" : "PENDING";

    msg.textContent = "Updating…";
    const { res, data } = await updateStatus(id, status);
    if (!res.ok) {
      msg.textContent = data?.error || "Update failed.";
      return;
    }
    const er = data?.emailResult;
    if (er?.attempted && er.ok) {
      msg.textContent = `Updated + email sent to ${er.to}.`;
    } else if (er?.attempted && er.skipped) {
      msg.textContent = `Updated (email skipped: ${er.reason || "not configured"}).`;
    } else if (er?.attempted && !er.ok) {
      msg.textContent = `Updated (email failed: ${er.details || er.error || "unknown error"}).`;
    } else if (er?.skipped) {
      msg.textContent = `Updated (email skipped: ${er.reason || "unknown"}).`;
    }
    await loadBookings();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadBookings();
  const refresh = document.getElementById("refresh-btn");
  if (refresh) refresh.addEventListener("click", () => loadBookings());
});

