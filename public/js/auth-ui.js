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

document.addEventListener("DOMContentLoaded", async () => {
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

