document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signup-form");
  const result = document.getElementById("signup-result");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        result.textContent = data?.error || "Signup failed.";
        return;
      }
      result.textContent = "Account created. Redirecting…";
      window.location.href = "/2fa";
    } catch {
      result.textContent = "Network error. Please try again.";
    }
  });
});

