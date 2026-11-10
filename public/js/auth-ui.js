async function getMe() {
  try {
    const res = await fetch("/api/auth/me", { headers: { "Accept": "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function signOut() {
  try {
    await fetch("/api/auth/signout", { method: "POST" });
  } finally {
    window.location.href = "/";
  }
}

function ensureLink(href, text, extraAttrs = {}) {
  const nav = document.querySelector(".navbar");
  if (!nav) return null;
  let a = nav.querySelector(`a[href="${href}"]`);
  if (!a) {
    a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    Object.entries(extraAttrs).forEach(([k, v]) => a.setAttribute(k, v));
    nav.appendChild(a);
  } else if (text) {
    a.textContent = text;
  }
  return a;
}

// Make sure every page's nav has the Marketplace link, right after "Games"
function ensureMarketplaceLink() {
  const nav = document.querySelector(".navbar");
  if (!nav || nav.querySelector('a[href="/marketplace"]')) return;
  const a = document.createElement("a");
  a.href = "/marketplace";
  a.textContent = "Marketplace";
  if (location.pathname.startsWith("/marketplace") || location.pathname === "/sell") a.className = "active";
  const games = nav.querySelector('a[href="/games"]');
  if (games) games.after(a);
  else nav.appendChild(a);
}

// Bell icon with unread count for signed-in users
async function addNotificationBell() {
  const nav = document.querySelector(".navbar");
  if (!nav || nav.querySelector(".gp-bell")) return;
  const a = document.createElement("a");
  a.href = "/notifications";
  a.className = "gp-bell";
  a.setAttribute("aria-label", "Notifications");
  a.innerHTML = '<i class="fas fa-bell"></i>';
  const signout = nav.querySelector('a[href="#signout"]');
  if (signout) signout.before(a);
  else nav.appendChild(a);
  try {
    const res = await fetch("/api/notifications/unread-count");
    if (!res.ok) return;
    const { unread } = await res.json();
    if (unread > 0) {
      const b = document.createElement("span");
      b.className = "gp-badge";
      b.textContent = unread > 99 ? "99+" : String(unread);
      a.appendChild(b);
      a.setAttribute("aria-label", `Notifications (${unread} unread)`);
    }
  } catch {
    /* ignore */
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  ensureMarketplaceLink();
  const me = await getMe();
  const user = me?.user || null;

  const signup = ensureLink("/signup", "Sign Up");
  const signin = ensureLink("/signin", "Sign In");
  const twofa = ensureLink("/2fa", "2FA");
  const signout = ensureLink("#signout", "Sign Out", { "data-signout": "1" });

  // Remove any existing admin link from the static HTML nav
  const nav = document.querySelector(".navbar");
  const existingAdmin = nav?.querySelector('a[href="/admin"]');
  if (existingAdmin) existingAdmin.remove();

  // default hidden until we know auth
  if (twofa) twofa.style.display = "none";
  if (signout) signout.style.display = "none";

  if (user) {
    if (signup) signup.style.display = "none";
    if (signin) signin.style.display = "none";
    if (twofa) twofa.style.display = "";
    if (signout) signout.style.display = "";
    // Only add Admin link for actual admins
    if (user.isAdmin) {
      ensureLink("/admin", "Admin");
    }
    // Signed-in users can list products straight from the menu
    const sell = ensureLink("/sell", "Sell");
    if (sell && location.pathname === "/sell") sell.classList.add("active");
    const mk = nav?.querySelector('a[href="/marketplace"]');
    if (sell && mk) mk.after(sell);
    addNotificationBell();
  } else {
    if (signup) signup.style.display = "";
    if (signin) signin.style.display = "";
  }

  if (signout) {
    signout.addEventListener("click", (e) => {
      if (signout.getAttribute("href") === "#signout") e.preventDefault();
      signOut();
    });
  }
});

