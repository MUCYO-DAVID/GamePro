document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signin-form");
  const result = document.getElementById("signin-result");
  if (!form) return;

  async function fetchMe() {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return null;
    return await res.json();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        result.textContent = data?.error || "Signin failed.";
        return;
      }

      if (data.requiresTwoFactor) {
        const me = await fetchMe();
        const next = me?.user?.isAdmin ? "/admin" : "/";
        result.textContent = "2FA required. Redirecting…";
        window.location.href = `/2fa?next=${encodeURIComponent(next)}#verify`;
      } else {
        const me = await fetchMe();
        if (me?.user?.isAdmin) {
          result.textContent = "Signed in as admin. Redirecting…";
          window.location.href = "/admin";
        } else {
          result.textContent = "Signed in. Redirecting…";
          window.location.href = "/";
        }
      }
    } catch {
      result.textContent = "Network error. Please try again.";
    }
  });
});

