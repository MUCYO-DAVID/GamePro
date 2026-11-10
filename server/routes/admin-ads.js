import express from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAdmin } from "../lib/auth.js";
import { uploadUrl } from "../lib/uploads.js";
import { text, optionalText, phone, optionalUrl, parseBody, parsePatch, audit, notify, formatMoney } from "../lib/util.js";
import { paymentOptions, verifyFlutterwaveTransaction } from "../lib/payments.js";
import { settlePayment, onAdPaid, onPaymentFailed, promoteApproved, sweepAds } from "../lib/ads.js";

const router = express.Router();
router.use("/api/admin", requireAdmin);

const DAY = 24 * 3600 * 1000;

// ── Overview & analytics ───────────────────────────────────────

router.get("/api/admin/ads/overview", async (_req, res) => {
  await sweepAds({ force: true });
  const [byStatus, revenue, refunded, pendingPayments, top, totals] = await Promise.all([
    prisma.ad.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.adPayment.aggregate({ where: { status: "SUCCESSFUL" }, _sum: { amount: true } }),
    prisma.adPayment.aggregate({ where: { status: "REFUNDED" }, _sum: { amount: true } }),
    prisma.adPayment.count({ where: { status: "PENDING" } }),
    prisma.ad.findMany({ where: { impressions: { gt: 0 } }, orderBy: { impressions: "desc" }, take: 5, select: { id: true, title: true, businessName: true, impressions: true, clicks: true, status: true } }),
    prisma.ad.aggregate({ _sum: { impressions: true, clicks: true }, _count: { _all: true } })
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
  res.json({
    counts,
    total: totals._count._all,
    revenue: revenue._sum.amount || 0,
    refunded: refunded._sum.amount || 0,
    currency: paymentOptions().currency,
    pendingPayments,
    impressions: totals._sum.impressions || 0,
    clicks: totals._sum.clicks || 0,
    top: top.map((t) => ({ ...t, ctr: t.impressions ? Math.round((t.clicks / t.impressions) * 10000) / 100 : 0 })),
    paymentSetup: paymentOptions()
  });
});

router.get("/api/admin/ads", async (req, res) => {
  const status = String(req.query.status || "");
  const ads = await prisma.ad.findMany({
    where: status ? { status } : {},
    orderBy: { updatedAt: "desc" },
    take: 150,
    include: {
      payments: { orderBy: { createdAt: "desc" } },
      package: { select: { name: true } },
      placement: { select: { name: true } },
      user: { select: { email: true } },
      reviewedBy: { select: { email: true } }
    }
  });
  res.json(
    ads.map((a) => ({
      ...a,
      logoUrl: uploadUrl(a.logoUploadId),
      bannerUrl: uploadUrl(a.bannerUploadId),
      ownerEmail: a.user.email,
      reviewedByEmail: a.reviewedBy?.email || null,
      packageName: a.package?.name || `${a.durationDays}-day package`,
      placementName: a.placement.name,
      paidAmount: a.payments.filter((p) => p.status === "SUCCESSFUL").reduce((s, p) => s + p.amount, 0),
      ctr: a.impressions ? Math.round((a.clicks / a.impressions) * 10000) / 100 : 0,
      user: undefined,
      reviewedBy: undefined
    }))
  );
});

// ── Approval workflow ──────────────────────────────────────────

async function loadAd(req, res) {
  const ad = await prisma.ad.findUnique({ where: { id: req.params.id }, include: { payments: true } });
  if (!ad) {
    res.status(404).json({ error: "Advertisement not found" });
    return null;
  }
  return ad;
}

const paidInFull = (ad) => ad.amount === 0 || ad.payments.filter((p) => p.status === "SUCCESSFUL").reduce((s, p) => s + p.amount, 0) >= ad.amount;

router.post("/api/admin/ads/:id/approve", async (req, res) => {
  const ad = await loadAd(req, res);
  if (!ad) return;
  if (ad.status !== "PENDING_APPROVAL") return res.status(400).json({ error: "Only advertisements waiting for approval can be approved" });
  if (!paidInFull(ad)) return res.status(400).json({ error: "This advertisement hasn't been paid in full yet" });

  const now = new Date();
  const scheduled = ad.preferredStartDate && ad.preferredStartDate > now ? ad.preferredStartDate : null;
  await prisma.ad.update({
    where: { id: ad.id },
    data: { status: "APPROVED", reviewedById: req.auth.user.id, reviewedAt: now, declineReason: null, startsAt: scheduled }
  });
  await promoteApproved(ad.placementId);
  const after = await prisma.ad.findUnique({ where: { id: ad.id }, select: { status: true, startsAt: true, endsAt: true } });
  await audit(req.auth.user.id, "ad.approve", "ad", ad.id, { title: ad.title, result: after.status });
  if (after.status === "APPROVED") {
    await notify(
      ad.userId,
      {
        type: "ad.approved",
        title: "Advertisement approved",
        body: scheduled
          ? `"${ad.title}" was approved and will go live on ${scheduled.toDateString()}.`
          : `"${ad.title}" was approved and will go live as soon as a homepage slot frees up.`,
        link: "/advertise#my-ads"
      },
      { email: true }
    );
  }
  res.json(after);
});

router.post("/api/admin/ads/:id/decline", async (req, res) => {
  const ad = await loadAd(req, res);
  if (!ad) return;
  const body = parseBody(z.object({ reason: text(3, 500) }), req, res);
  if (!body) return;
  if (!["DRAFT", "PENDING_PAYMENT", "PAYMENT_PENDING_VERIFICATION", "PENDING_APPROVAL", "APPROVED"].includes(ad.status)) {
    return res.status(400).json({ error: "This advertisement can't be declined now. Suspend it instead." });
  }
  await prisma.ad.update({ where: { id: ad.id }, data: { status: "DECLINED", declineReason: body.reason, reviewedById: req.auth.user.id, reviewedAt: new Date() } });
  const paid = ad.payments.some((p) => p.status === "SUCCESSFUL");
  await audit(req.auth.user.id, "ad.decline", "ad", ad.id, { title: ad.title, reason: body.reason, paid });
  await notify(
    ad.userId,
    {
      type: "ad.declined",
      title: "Advertisement declined",
      body: `"${ad.title}" was declined: ${body.reason}${paid ? ` ${paymentOptions().refundPolicy}` : ""}`,
      link: "/advertise#my-ads"
    },
    { email: true, emailTo: ad.email }
  );
  res.json({ ok: true, status: "DECLINED", refundDue: paid });
});

router.post("/api/admin/ads/:id/suspend", async (req, res) => {
  const ad = await loadAd(req, res);
  if (!ad) return;
  const body = parseBody(z.object({ reason: optionalText(500) }), req, res);
  if (!body) return;
  if (!["ACTIVE", "APPROVED"].includes(ad.status)) return res.status(400).json({ error: "Only live or approved advertisements can be suspended" });
  await prisma.ad.update({ where: { id: ad.id }, data: { status: "SUSPENDED" } });
  await audit(req.auth.user.id, "ad.suspend", "ad", ad.id, { title: ad.title, reason: body.reason });
  await notify(ad.userId, { type: "ad.suspended", title: "Advertisement suspended", body: `"${ad.title}" was paused by GamePro.${body.reason ? ` Reason: ${body.reason}` : ""}`, link: "/advertise#my-ads" }, { email: true });
  await promoteApproved(ad.placementId);
  res.json({ ok: true, status: "SUSPENDED" });
});

router.post("/api/admin/ads/:id/resume", async (req, res) => {
  const ad = await loadAd(req, res);
  if (!ad) return;
  if (ad.status !== "SUSPENDED") return res.status(400).json({ error: "Only suspended advertisements can be resumed" });
  const now = new Date();
  let status;
  if (!ad.endsAt) status = "APPROVED"; // never started: back into the queue
  else if (ad.endsAt > now) status = "ACTIVE";
  else status = "EXPIRED";
  await prisma.ad.update({ where: { id: ad.id }, data: { status } });
  if (status === "APPROVED") await promoteApproved(ad.placementId);
  await audit(req.auth.user.id, "ad.resume", "ad", ad.id, { title: ad.title, result: status });
  const after = await prisma.ad.findUnique({ where: { id: ad.id }, select: { status: true, endsAt: true } });
  res.json(after);
});

router.post("/api/admin/ads/:id/extend", async (req, res) => {
  const ad = await loadAd(req, res);
  if (!ad) return;
  const body = parseBody(z.object({ days: z.coerce.number().int().min(1).max(365) }), req, res);
  if (!body) return;
  const now = new Date();
  let data;
  if (["ACTIVE", "SUSPENDED"].includes(ad.status) && ad.endsAt) data = { endsAt: new Date(Math.max(ad.endsAt.getTime(), now.getTime()) + body.days * DAY), expiryWarnedAt: null };
  else if (["APPROVED", "PENDING_APPROVAL"].includes(ad.status)) data = { durationDays: ad.durationDays + body.days };
  else if (ad.status === "EXPIRED") data = { status: "ACTIVE", startsAt: ad.startsAt || now, endsAt: new Date(now.getTime() + body.days * DAY), expiryWarnedAt: null };
  else return res.status(400).json({ error: "This advertisement's duration can't be extended now" });
  const updated = await prisma.ad.update({ where: { id: ad.id }, data, select: { status: true, endsAt: true, durationDays: true } });
  await audit(req.auth.user.id, "ad.extend", "ad", ad.id, { title: ad.title, days: body.days });
  await notify(ad.userId, { type: "ad.extended", title: "Advertisement extended", body: `"${ad.title}" was extended by ${body.days} day(s).`, link: "/advertise#my-ads" });
  res.json(updated);
});

const adEditSchema = z
  .object({
    businessName: text(2, 80),
    contactName: text(2, 80),
    email: z.string().trim().toLowerCase().email(),
    phone,
    location: optionalText(80),
    title: text(3, 60),
    message: text(10, 200),
    ctaLabel: text(2, 24),
    linkUrl: optionalUrl
  });

router.patch("/api/admin/ads/:id", async (req, res) => {
  const ad = await loadAd(req, res);
  if (!ad) return;
  const data = parsePatch(adEditSchema, req, res);
  if (!data) return;
  const updated = await prisma.ad.update({ where: { id: ad.id }, data });
  await audit(req.auth.user.id, "ad.edit", "ad", ad.id, { changes: data });
  res.json({ id: updated.id });
});

router.delete("/api/admin/ads/:id", async (req, res) => {
  const ad = await loadAd(req, res);
  if (!ad) return;
  await prisma.ad.delete({ where: { id: ad.id } }); // payments are kept (adId set to null) for revenue records
  await audit(req.auth.user.id, "ad.delete", "ad", ad.id, { title: ad.title, businessName: ad.businessName, status: ad.status });
  res.json({ ok: true });
});

// ── Packages & placements ──────────────────────────────────────

const packageSchema = z
  .object({
    placementId: z.string().min(1),
    name: text(2, 60),
    description: optionalText(300),
    durationDays: z.coerce.number().int().min(1).max(365),
    price: z.coerce.number().int().min(0).max(1_000_000_000),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional().default("RWF"),
    isFeatured: z.boolean().optional().default(false),
    isActive: z.boolean().optional().default(false),
    sortOrder: z.coerce.number().int().min(0).max(999).optional().default(0)
  });

router.get("/api/admin/ads/packages", async (_req, res) => {
  const [packages, placements] = await Promise.all([
    prisma.adPackage.findMany({ orderBy: [{ sortOrder: "asc" }, { durationDays: "asc" }], include: { placement: { select: { name: true } }, _count: { select: { ads: true } } } }),
    prisma.adPlacement.findMany({ orderBy: { name: "asc" } })
  ]);
  res.json({ packages, placements });
});

function checkPrice(res, isActive, price) {
  if (isActive && !(price > 0)) {
    res.status(400).json({ error: "Set a price above 0 before activating a package" });
    return false;
  }
  return true;
}

router.post("/api/admin/ads/packages", async (req, res) => {
  const data = parseBody(packageSchema, req, res);
  if (!data) return;
  if (!checkPrice(res, data.isActive, data.price)) return;
  if (!(await prisma.adPlacement.findUnique({ where: { id: data.placementId } }))) return res.status(400).json({ error: "Choose a placement" });
  const pkg = await prisma.adPackage.create({ data });
  await audit(req.auth.user.id, "package.create", "package", pkg.id, data);
  res.status(201).json(pkg);
});

router.patch("/api/admin/ads/packages/:id", async (req, res) => {
  const data = parsePatch(packageSchema, req, res);
  if (!data) return;
  const pkg = await prisma.adPackage.findUnique({ where: { id: req.params.id } });
  if (!pkg) return res.status(404).json({ error: "Package not found" });
  if (!checkPrice(res, data.isActive ?? pkg.isActive, data.price ?? pkg.price)) return;
  // Existing ads keep the price they were sold at (it's copied onto each ad)
  const updated = await prisma.adPackage.update({ where: { id: pkg.id }, data });
  await audit(req.auth.user.id, "package.update", "package", pkg.id, { before: { price: pkg.price, durationDays: pkg.durationDays, isActive: pkg.isActive }, changes: data });
  res.json(updated);
});

router.delete("/api/admin/ads/packages/:id", async (req, res) => {
  const pkg = await prisma.adPackage.findUnique({ where: { id: req.params.id }, include: { _count: { select: { ads: true } } } });
  if (!pkg) return res.status(404).json({ error: "Package not found" });
  if (pkg._count.ads) return res.status(400).json({ error: "Advertisements were sold with this package. Switch it off instead." });
  await prisma.adPackage.delete({ where: { id: pkg.id } });
  await audit(req.auth.user.id, "package.delete", "package", pkg.id, { name: pkg.name });
  res.json({ ok: true });
});

router.patch("/api/admin/ads/placements/:id", async (req, res) => {
  const data = parsePatch(
    z.object({ name: text(2, 60), description: optionalText(300), maxActive: z.coerce.number().int().min(1).max(10), isActive: z.boolean() }),
    req,
    res
  );
  if (!data) return;
  const placement = await prisma.adPlacement.findUnique({ where: { id: req.params.id } });
  if (!placement) return res.status(404).json({ error: "Placement not found" });
  const updated = await prisma.adPlacement.update({ where: { id: placement.id }, data });
  await audit(req.auth.user.id, "placement.update", "placement", placement.id, data);
  await promoteApproved(placement.id);
  res.json(updated);
});

// ── Payments ───────────────────────────────────────────────────

router.get("/api/admin/ads/payments", async (req, res) => {
  const status = String(req.query.status || "");
  const rows = await prisma.adPayment.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { ad: { select: { id: true, title: true, businessName: true, status: true } }, user: { select: { email: true } }, verifiedBy: { select: { email: true } } }
  });
  res.json(rows.map((p) => ({ ...p, providerResponse: undefined, payerEmail: p.user?.email || null, verifiedByEmail: p.verifiedBy?.email || null, user: undefined, verifiedBy: undefined })));
});

async function loadPayment(req, res) {
  const p = await prisma.adPayment.findUnique({ where: { id: req.params.id }, include: { ad: { select: { userId: true, title: true } } } });
  if (!p) {
    res.status(404).json({ error: "Payment not found" });
    return null;
  }
  return p;
}

// Manual Mobile Money: an admin confirms (or rejects) after checking the MoMo statement
router.post("/api/admin/ads/payments/:id/verify", async (req, res) => {
  const p = await loadPayment(req, res);
  if (!p) return;
  const body = parseBody(z.object({ decision: z.enum(["approve", "reject"]), note: optionalText(300) }), req, res);
  if (!body) return;
  if (p.provider !== "MANUAL") return res.status(400).json({ error: "Online payments are verified automatically. Use “Re-check” instead." });
  if (p.status !== "PENDING") return res.status(400).json({ error: "This payment was already processed" });

  const now = new Date();
  if (body.decision === "approve") {
    const r = await prisma.adPayment.updateMany({
      where: { id: p.id, status: "PENDING" },
      data: { status: "SUCCESSFUL", paidAt: now, verifiedById: req.auth.user.id, verifiedAt: now, method: "mobilemoney (manual)" }
    });
    if (r.count) await onAdPaid(p.adId);
  } else {
    const r = await prisma.adPayment.updateMany({
      where: { id: p.id, status: "PENDING" },
      data: { status: "FAILED", failureReason: body.note || "Payment could not be confirmed", verifiedById: req.auth.user.id, verifiedAt: now }
    });
    if (r.count && p.adId) await onPaymentFailed(p.adId, "failed");
  }
  await audit(req.auth.user.id, `payment.${body.decision}`, "payment", p.id, { txRef: p.txRef, payerReference: p.payerReference, amount: p.amount, note: body.note });
  res.json({ ok: true });
});

// Ask Flutterwave again (e.g. a Mobile Money payment that was still pending)
router.post("/api/admin/ads/payments/:id/recheck", async (req, res) => {
  const p = await loadPayment(req, res);
  if (!p) return;
  if (p.provider !== "FLUTTERWAVE") return res.status(400).json({ error: "Only online payments can be re-checked" });
  if (!paymentOptions().online) return res.status(400).json({ error: "Flutterwave isn't configured" });
  const v = await verifyFlutterwaveTransaction({ transactionId: p.providerTransactionId, txRef: p.txRef });
  const result = await settlePayment(p, v);
  await audit(req.auth.user.id, "payment.recheck", "payment", p.id, { txRef: p.txRef, result });
  res.json({ ok: true, result });
});

router.post("/api/admin/ads/payments/:id/refund", async (req, res) => {
  const p = await loadPayment(req, res);
  if (!p) return;
  const body = parseBody(z.object({ note: optionalText(300) }), req, res);
  if (!body) return;
  if (p.status !== "SUCCESSFUL") return res.status(400).json({ error: "Only successful payments can be marked as refunded" });
  await prisma.adPayment.update({ where: { id: p.id }, data: { status: "REFUNDED", failureReason: body.note || "Refunded" } });
  await audit(req.auth.user.id, "payment.refund", "payment", p.id, { txRef: p.txRef, amount: p.amount, note: body.note });
  if (p.ad) {
    await notify(p.ad.userId, { type: "ad.refunded", title: "Payment refunded", body: `${formatMoney(p.amount, p.currency)} for "${p.ad.title}" was refunded.${body.note ? ` ${body.note}` : ""}`, link: "/advertise#my-ads" }, { email: true });
  }
  res.json({ ok: true });
});

export default router;
