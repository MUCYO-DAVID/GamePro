document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("reset-form");
  const result = document.getElementById("reset-result");

  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");
  if (!token) {
    result.textContent = "Missing token. Use the reset link from the email.";
    form.querySelector("button").disabled = true;
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = document.getElementById("password").value;

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      const data = await res.json();
      if (!res.ok) {
        result.textContent = data?.error || "Reset failed.";
        return;
      }

      if (data.requiresTwoFactor) {
        result.textContent = "Password updated. 2FA required—redirecting…";
        window.location.href = "/2fa#verify";
      } else {
        result.textContent = "Password updated. Redirecting…";
        window.location.href = "/";
      }
    } catch {
      result.textContent = "Network error. Please try again.";
    }
  });
});

