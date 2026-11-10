// Payment provider integration (server-side only — secret keys never reach the browser).
//
// Online:  Flutterwave hosted checkout (MTN/Airtel Mobile Money Rwanda + cards).
//          Needs FLW_SECRET_KEY (+ FLW_SECRET_HASH for webhooks).
// Manual:  Payer sends Mobile Money to the number in MANUAL_PAYMENT_INSTRUCTIONS and types the
//          transaction ID; an admin checks it against the MoMo statement and verifies it.
//
// A payment only becomes SUCCESSFUL after the provider's API confirms it (or an admin verifies a
// manual payment). What the browser says is never trusted.

import crypto from "crypto";

const FLW_BASE = "https://api.flutterwave.com/v3";

export function paymentOptions() {
  const manualInstructions = (process.env.MANUAL_PAYMENT_INSTRUCTIONS || "").trim();
  return {
    currency: process.env.PAYMENT_CURRENCY || "RWF",
    online: !!process.env.FLW_SECRET_KEY,
    onlineProvider: process.env.FLW_SECRET_KEY ? "Flutterwave (Mobile Money & cards)" : null,
    manual: !!manualInstructions,
    manualInstructions: manualInstructions || null,
    refundPolicy:
      (process.env.AD_REFUND_POLICY || "").trim() ||
      "If your advertisement is declined after payment, GamePro will contact you to arrange a refund or credit for a future advertisement."
  };
}

export function newTxRef(adId) {
  return `GPAD-${adId.slice(-8)}-${crypto.randomBytes(5).toString("hex")}`.toUpperCase();
}

async function flw(path, init = {}) {
  const r = await fetch(`${FLW_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const json = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, json };
}

export async function createFlutterwaveCheckout({ payment, ad, redirectUrl }) {
  const { ok, json } = await flw("/payments", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: payment.txRef,
      amount: payment.amount,
      currency: payment.currency,
      redirect_url: redirectUrl,
      payment_options: process.env.FLW_PAYMENT_OPTIONS || "mobilemoneyrwanda,card",
      customer: { email: ad.email, phonenumber: ad.phone, name: ad.contactName },
      customizations: { title: "GamePro Advertising", description: `${ad.title} (${ad.durationDays} days)` },
      meta: { adId: ad.id, paymentId: payment.id }
    })
  });
  const link = json?.data?.link;
  if (!ok || !link) {
    const err = new Error(json?.message || "Could not start the payment. Please try again.");
    err.status = 502;
    throw err;
  }
  return link;
}

// Ask Flutterwave what really happened. Returns { state, id, txRef, amount, currency, method, raw }.
export async function verifyFlutterwaveTransaction({ transactionId, txRef }) {
  const path = transactionId
    ? `/transactions/${encodeURIComponent(transactionId)}/verify`
    : `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`;
  const { ok, json } = await flw(path);
  const d = json?.data;
  if (!ok || !d) return { state: "unknown" };
  return {
    state: String(d.status || "").toLowerCase(), // successful | failed | pending
    id: d.id,
    txRef: d.tx_ref,
    amount: Number(d.amount),
    currency: d.currency,
    method: d.payment_type || null,
    raw: { id: d.id, status: d.status, amount: d.amount, currency: d.currency, payment_type: d.payment_type, flw_ref: d.flw_ref, created_at: d.created_at }
  };
}

// Webhook authenticity: Flutterwave sends the secret hash configured in its dashboard
export function isValidFlutterwaveWebhook(req) {
  const expected = process.env.FLW_SECRET_HASH || "";
  const got = String(req.headers["verif-hash"] || "");
  if (!expected || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
