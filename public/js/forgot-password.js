document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("forgot-form");
  const result = document.getElementById("forgot-result");
  const linkEl = document.getElementById("reset-link");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    result.textContent = "";
    linkEl.textContent = "";

    const body = Object.fromEntries(new FormData(form).entries());
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.emailSent) {
        result.textContent = "A password reset link has been sent to your email. Check your inbox (and spam folder).";
        linkEl.textContent = "";
      } else {
        result.textContent = "If that email exists in our system, a reset link was generated.";
        if (data.resetLink) {
          linkEl.innerHTML = `Reset link (dev only — no SMTP): <a href="${data.resetLink}">${data.resetLink}</a>`;
        }
      }
    } catch {
      result.textContent = "Network error. Please try again.";
    }
  });
});

