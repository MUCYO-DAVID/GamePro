// Advertisement lifecycle: payment settlement, activation, expiry.
//
// Ad status (approval/visibility) and payment status are separate:
//   Ad:      DRAFT → PENDING_PAYMENT → PAYMENT_PENDING_VERIFICATION → PENDING_APPROVAL
//            → APPROVED (waiting for a free slot / start date) → ACTIVE → EXPIRED
//            (or DECLINED / SUSPENDED)
//   Payment: PENDING → SUCCESSFUL | FAILED | CANCELLED (→ REFUNDED)
// An ad is only shown when it is ACTIVE, which requires a verified payment AND admin approval.

import { prisma } from "./db.js";
import { notify, notifyAdmins, formatMoney, isUniqueViolation } from "./util.js";

const DAY = 24 * 3600 * 1000;

// Called exactly once per ad when a payment is confirmed
export async function onAdPaid(adId) {
  if (!adId) return;
  const r = await prisma.ad.updateMany({
    where: { id: adId, status: { in: ["DRAFT", "PENDING_PAYMENT", "PAYMENT_PENDING_VERIFICATION"] } },
    data: { status: "PENDING_APPROVAL", submittedAt: new Date() }
  });
  if (!r.count) return;
  const ad = await prisma.ad.findUnique({ where: { id: adId }, select: { userId: true, title: true, businessName: true, amount: true, currency: true } });
  await notify(
    ad.userId,
    {
      type: "ad.payment_received",
      title: "Payment received",
      body: `We received ${formatMoney(ad.amount, ad.currency)} for "${ad.title}". Our team will review your advertisement shortly.`,
      link: "/advertise#my-ads"
    },
    { email: true }
  );
  await notifyAdmins(
    { type: "ad.pending_approval", title: "Advertisement awaiting approval", body: `${ad.businessName} paid for "${ad.title}".`, link: "/admin#advertising" },
    { email: true }
  );
}

// Apply a provider verification result to a payment. Safe to call many times (webhook + redirect + admin re-check).
export async function settlePayment(payment, v) {
  if (v.state === "successful") {
    if (v.txRef !== payment.txRef || v.currency !== payment.currency || !(Number(v.amount) >= payment.amount)) {
      await prisma.adPayment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { status: "FAILED", failureReason: "Amount, currency or reference did not match", providerResponse: v.raw }
      });
      return "failed";
    }
    let r;
    try {
      r = await prisma.adPayment.updateMany({
        where: { id: payment.id, status: { not: "SUCCESSFUL" } },
        data: { status: "SUCCESSFUL", providerTransactionId: String(v.id), method: v.method, paidAt: new Date(), providerResponse: v.raw, failureReason: null }
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // The same provider transaction was already used for another payment
      await prisma.adPayment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { status: "FAILED", failureReason: "Duplicate transaction" }
      });
      return "failed";
    }
    if (r.count === 1) await onAdPaid(payment.adId);
    return "successful";
  }

  if (v.state === "failed" || v.state === "cancelled") {
    const r = await prisma.adPayment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: {
        status: v.state === "failed" ? "FAILED" : "CANCELLED",
        failureReason: v.state === "failed" ? "Payment was not completed" : "Cancelled by payer",
        providerResponse: v.raw ?? undefined
      }
    });
    if (r.count === 1 && payment.adId) await onPaymentFailed(payment.adId, v.state);
    return v.state;
  }
  return "pending";
}

export async function onPaymentFailed(adId, state) {
  const back = await prisma.ad.updateMany({
    where: { id: adId, status: "PAYMENT_PENDING_VERIFICATION" },
    data: { status: "PENDING_PAYMENT" }
  });
  const ad = await prisma.ad.findUnique({ where: { id: adId }, select: { userId: true, title: true } });
  if (ad && (back.count || state === "failed")) {
    await notify(
      ad.userId,
      {
        type: "ad.payment_failed",
        title: state === "cancelled" ? "Payment cancelled" : "Payment failed",
        body: `The payment for "${ad.title}" didn't go through. You can try again from your advertising dashboard.`,
        link: "/advertise#my-ads"
      },
      { email: state === "failed" }
    );
  }
}

async function activate(ad, now = new Date()) {
  const endsAt = new Date(now.getTime() + ad.durationDays * DAY);
  const r = await prisma.ad.updateMany({ where: { id: ad.id, status: "APPROVED" }, data: { status: "ACTIVE", startsAt: now, endsAt } });
  if (r.count) {
    await notify(
      ad.userId,
      {
        type: "ad.active",
        title: "Your advertisement is live",
        body: `"${ad.title}" is now showing on the GamePro homepage until ${endsAt.toDateString()}.`,
        link: "/advertise#my-ads"
      },
      { email: true }
    );
  }
  return r.count === 1;
}

// Fill free slots in a placement with approved ads whose start date has arrived
export async function promoteApproved(placementId) {
  const now = new Date();
  const placement = await prisma.adPlacement.findUnique({ where: { id: placementId } });
  if (!placement || !placement.isActive) return 0;
  const live = await prisma.ad.count({ where: { placementId, status: "ACTIVE", endsAt: { gt: now } } });
  const slots = placement.maxActive - live;
  if (slots <= 0) return 0;
  const waiting = await prisma.ad.findMany({
    where: { placementId, status: "APPROVED", OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
    orderBy: [{ isFeatured: "desc" }, { reviewedAt: "asc" }],
    take: slots,
    select: { id: true, userId: true, title: true, durationDays: true }
  });
  let n = 0;
  for (const ad of waiting) if (await activate(ad, now)) n++;
  return n;
}

let lastSweep = 0;

// Expire finished ads, start queued ones, and warn advertisers before expiry.
// Runs from the daily cron, the admin dashboard, and (throttled) when the homepage loads ads.
export async function sweepAds({ force = false } = {}) {
  if (!force && Date.now() - lastSweep < 60_000) return;
  lastSweep = Date.now();
  const now = new Date();

  const ended = await prisma.ad.findMany({ where: { status: "ACTIVE", endsAt: { lte: now } }, select: { id: true, userId: true, title: true } });
  for (const ad of ended) {
    const r = await prisma.ad.updateMany({ where: { id: ad.id, status: "ACTIVE" }, data: { status: "EXPIRED" } });
    if (r.count) {
      await notify(
        ad.userId,
        { type: "ad.expired", title: "Advertisement expired", body: `"${ad.title}" has finished its run. You can submit a new advertisement any time.`, link: "/advertise" },
        { email: true }
      );
    }
  }

  const placements = await prisma.adPlacement.findMany({ where: { isActive: true }, select: { id: true } });
  for (const p of placements) await promoteApproved(p.id);

  const soon = await prisma.ad.findMany({
    where: { status: "ACTIVE", expiryWarnedAt: null, endsAt: { gt: now, lte: new Date(now.getTime() + 2 * DAY) } },
    select: { id: true, userId: true, title: true, endsAt: true }
  });
  for (const ad of soon) {
    const r = await prisma.ad.updateMany({ where: { id: ad.id, expiryWarnedAt: null }, data: { expiryWarnedAt: now } });
    if (r.count) {
      await notify(
        ad.userId,
        { type: "ad.expiring", title: "Advertisement ending soon", body: `"${ad.title}" stops showing on ${ad.endsAt.toDateString()}.`, link: "/advertise#my-ads" },
        { email: true }
      );
    }
  }
}
