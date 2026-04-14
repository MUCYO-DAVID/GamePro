async function setupQr() {
  const result = document.getElementById("twofa-result");
  const qrWrap = document.getElementById("qr-wrap");
  const manualKey = document.getElementById("manual-key");

  result.textContent = "";
  qrWrap.innerHTML = "";
  manualKey.textContent = "";

  const res = await fetch("/api/2fa/setup", { method: "POST" });
  const data = await res.json();
  if (!res.ok) {
    result.textContent = data?.error || "Unable to setup 2FA. Make sure you're signed in.";
    return;
  }

  const img = document.createElement("img");
  img.src = data.qr;
  img.alt = "2FA QR Code";
  img.style.maxWidth = "240px";
  img.style.borderRadius = "12px";
  qrWrap.appendChild(img);

  manualKey.textContent = `Manual key: ${data.manualKey}`;
}

async function enable2fa(token) {
  const res = await fetch("/api/2fa/enable", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  const data = await res.json();
  return { res, data };
}

async function verifyLogin2fa(token) {
  const res = await fetch("/api/2fa/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  const data = await res.json();
  return { res, data };
}

async function fetchMe() {
  const res = await fetch("/api/auth/me");
  if (!res.ok) return null;
  return await res.json();
}

document.addEventListener("DOMContentLoaded", async () => {
  const result = document.getElementById("twofa-result");
  const form = document.getElementById("twofa-form");
  const setupBtn = document.getElementById("setup-btn");

  const next = new URLSearchParams(window.location.search).get("next") || "/";
  const verifyMode = window.location.hash === "#verify";
  if (verifyMode) {
    setupBtn.style.display = "none";
    result.textContent = "Enter your authenticator code to complete sign in.";
  }

  setupBtn.addEventListener("click", () => setupQr());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = document.getElementById("token").value.trim();
    if (!token) {
      result.textContent = "Enter the 6-digit code.";
      return;
    }

    try {
      if (verifyMode) {
        const { res, data } = await verifyLogin2fa(token);
        if (!res.ok) {
          result.textContent = data?.error || "Invalid code.";
          return;
        }
        const me = await fetchMe();
        const target = me?.user?.isAdmin ? "/admin" : next;
        result.textContent = "2FA verified. Redirecting…";
        window.location.href = target;
      } else {
        const { res, data } = await enable2fa(token);
        if (!res.ok) {
          result.textContent = data?.error || "Invalid code.";
          return;
        }
        const me = await fetchMe();
        const target = me?.user?.isAdmin ? "/admin" : "/";
        result.textContent = "2FA enabled. Redirecting…";
        window.location.href = target;
      }
    } catch {
      result.textContent = "Network error. Please try again.";
    }
  });
});

