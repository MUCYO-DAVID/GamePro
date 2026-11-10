import express from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { uploadUrl, assertOwnedUploads } from "../lib/uploads.js";
import { text, optionalText, phone, optionalUrl, parseBody, visitorHash, dayKey, isUniqueViolation, notify, notifyAdmins, formatMoney } from "../lib/util.js";
import { paymentOptions, newTxRef, createFlutterwaveCheckout, verifyFlutterwaveTransaction, isValidFlutterwaveWebhook } from "../lib/payments.js";
import { settlePayment, onAdPaid, sweepAds } from "../lib/ads.js";

const router = express.Router();

function baseUrl() {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

// ── Public: packages, payment options, live ads ────────────────

router.get("/api/ads/packages", async (_req, res) => {
  const pkgs = await prisma.adPackage.findMany({
    where: { isActive: true, placement: { isActive: true } },
    orderBy: [{ sortOrder: "asc" }, { durationDays: "asc" }],
    select: { id: true, name: true, description: true, durationDays: true, price: true, currency: true, isFeatured: true, placement: { select: { key: true, name: true, description: true } } }
  });
  res.json(pkgs);
});

router.get("/api/ads/payment-options", (_req, res) => {
  const o = paymentOptions();
  res.json(o);
});

function publicAd(a) {
  return {
    id: a.id,
    businessName: a.businessName,
    title: a.title,
    message: a.message,
    ctaLabel: a.ctaLabel,
    location: a.location,
    hasLink: !!a.linkUrl,
    phone: a.linkUrl ? null : a.phone, // ads without a website use "Call" as their action
    isFeatured: a.isFeatured,
    logoUrl: uploadUrl(a.logoUploadId),
    bannerUrl: uploadUrl(a.bannerUploadId)
  };
}

router.get("/api/ads/active", async (req, res) => {
  const key = String(req.query.placement || "HOME_SIDEBAR");
  await sweepAds().catch((e) => console.error("[ADS] sweep failed", e?.message));
  const placement = await prisma.adPlacement.findUnique({ where: { key } });
  if (!placement || !placement.isActive) return res.json([]);
  const now = new Date();
  const ads = await prisma.ad.findMany({
    where: { placementId: placement.id, status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } },
    take: placement.maxActive
  });
  // Featured first, otherwise a fair random order so every advertiser gets the top spot sometimes
  ads.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || Math.random() - 0.5);
  res.setHeader("Cache-Control", "no-store");
  res.json(ads.map(publicAd));
});

async function recordEvent(adId, type, req) {
  try {
    await prisma.adEvent.create({ data: { adId, type, visitorHash: visitorHash(req), day: dayKey() } });
    await prisma.ad.update({ where: { id: adId }, data: type === "CLICK" ? { clicks: { increment: 1 } } : { impressions: { increment: 1 } } });
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false; // already counted for this visitor today
    throw e;
  }
}

// Impressions are counted once per visitor per ad per day, only for ads that are actually live
router.post("/api/ads/impressions", async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => typeof x === "string").slice(0, 10) : [];
  if (!ids.length) return res.json({ ok: true, counted: 0 });
  const now = new Date();
  const live = await prisma.ad.findMany({ where: { id: { in: ids }, status: "ACTIVE", endsAt: { gt: now } }, select: { id: true } });
  let counted = 0;
  for (const a of live) if (await recordEvent(a.id, "IMPRESSION", req)) counted++;
  res.json({ ok: true, counted });
});

// Clicks go through here so they can be counted; then the visitor is sent to the advertiser's site
router.get("/api/ads/:id/click", async (req, res) => {
  const ad = await prisma.ad.findUnique({ where: { id: req.params.id }, select: { id: true, status: true, linkUrl: true } });
  if (!ad || ad.status !== "ACTIVE" || !ad.linkUrl) return res.redirect(302, "/");
  await recordEvent(ad.id, "CLICK", req);
  res.setHeader("Referrer-Policy", "no-referrer");
  res.redirect(302, ad.linkUrl);
});

// Click tracking for "Call" buttons (sent with navigator.sendBeacon; no redirect)
router.post("/api/ads/:id/click", async (req, res) => {
  const ad = await prisma.ad.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } });
  if (ad?.status === "ACTIVE") await recordEvent(ad.id, "CLICK", req);
  res.status(204).end();
});

// ── Advertiser: create / edit / list own ads ───────────────────

const adSchema = z.object({
  packageId: z.string().min(1, "Choose a package"),
  businessName: text(2, 80),
  contactName: text(2, 80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone,
  location: optionalText(80),
  title: text(3, 60),
  message: text(10, 200),
  ctaLabel: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : "Learn More"))
    .pipe(z.string().min(2).max(24)),
  linkUrl: optionalUrl,
  logoUploadId: z.string().optional().nullable(),
  bannerUploadId: z.string().min(1, "Add an advertisement image"),
  preferredStartDate: z
    .string()
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (!v) return null;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: "custom", message: "Invalid start date" });
        return z.NEVER;
      }
      if (d.getTime() < Date.now() - 24 * 3600 * 1000) {
        ctx.addIssue({ code: "custom", message: "Start date can't be in the past" });
        return z.NEVER;
      }
      return d;
    }),
  saveAsDraft: z.boolean().optional().default(false)
});

async function loadPackage(packageId) {
  return prisma.adPackage.findFirst({ where: { id: packageId, isActive: true, placement: { isActive: true } } });
}

function nextStatusAfterSubmit(amount) {
  return amount > 0 ? "PENDING_PAYMENT" : "PENDING_APPROVAL";
}

async function announceSubmitted(ad, user) {
  await notify(
    user.id,
    {
      type: "ad.submitted",
      title: "Advertisement submitted",
      body:
        ad.amount > 0
          ? `"${ad.title}" was submitted. Complete the payment of ${formatMoney(ad.amount, ad.currency)} to send it for review.`
          : `"${ad.title}" was submitted for review.`,
      link: "/advertise#my-ads"
    },
    { email: true, emailTo: ad.email }
  );
  if (ad.amount === 0) {
    await notifyAdmins({ type: "ad.pending_approval", title: "Advertisement awaiting approval", body: `${ad.businessName} submitted "${ad.title}".`, link: "/admin#advertising" }, { email: true });
  }
}

router.post("/api/my/ads", requireAuth, async (req, res) => {
  const data = parseBody(adSchema, req, res);
  if (!data) return;
  const user = req.auth.user;
  const pkg = await loadPackage(data.packageId);
  if (!pkg) return res.status(400).json({ error: "That package is no longer available" });
  try {
    await assertOwnedUploads(user, [data.bannerUploadId, data.logoUploadId]);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }

  const { saveAsDraft, ...fields } = data;
  const status = saveAsDraft ? "DRAFT" : nextStatusAfterSubmit(pkg.price);
  const ad = await prisma.ad.create({
    data: {
      ...fields,
      logoUploadId: fields.logoUploadId || null,
      userId: user.id,
      placementId: pkg.placementId,
      amount: pkg.price,
      currency: pkg.currency,
      durationDays: pkg.durationDays,
      isFeatured: pkg.isFeatured,
      status,
      submittedAt: saveAsDraft ? null : new Date()
    }
  });
  if (!saveAsDraft) await announceSubmitted(ad, user);
  res.status(201).json({ id: ad.id, status: ad.status, amount: ad.amount, currency: ad.currency });
});

async function ownAd(req, res) {
  const ad = await prisma.ad.findUnique({ where: { id: req.params.id }, include: { payments: true } });
  if (!ad || ad.userId !== req.auth.user.id) {
    res.status(404).json({ error: "Advertisement not found" });
    return null;
  }
  return ad;
}

function adForOwner(a) {
  return {
    id: a.id,
    status: a.status,
    businessName: a.businessName,
    contactName: a.contactName,
    email: a.email,
    phone: a.phone,
    location: a.location,
    title: a.title,
    message: a.message,
    ctaLabel: a.ctaLabel,
    linkUrl: a.linkUrl,
    logoUploadId: a.logoUploadId,
    bannerUploadId: a.bannerUploadId,
    logoUrl: uploadUrl(a.logoUploadId),
    bannerUrl: uploadUrl(a.bannerUploadId),
    preferredStartDate: a.preferredStartDate,
    packageId: a.packageId,
    packageName: a.package?.name || `${a.durationDays}-day package`,
    placementName: a.placement?.name || null,
    amount: a.amount,
    currency: a.currency,
    durationDays: a.durationDays,
    isFeatured: a.isFeatured,
    declineReason: a.declineReason,
    submittedAt: a.submittedAt,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    createdAt: a.createdAt,
    stats: {
      impressions: a.impressions,
      clicks: a.clicks,
      ctr: a.impressions ? Math.round((a.clicks / a.impressions) * 10000) / 100 : 0
    },
    payments: (a.payments || [])
      .sort((x, y) => y.createdAt - x.createdAt)
      .map((p) => ({ id: p.id, provider: p.provider, status: p.status, amount: p.amount, currency: p.currency, txRef: p.txRef, payerReference: p.payerReference, method: p.method, failureReason: p.failureReason, createdAt: p.createdAt, paidAt: p.paidAt }))
  };
}

router.get("/api/my/ads", requireAuth, async (req, res) => {
  const ads = await prisma.ad.findMany({
    where: { userId: req.auth.user.id },
    orderBy: { createdAt: "desc" },
    include: { payments: true, package: { select: { name: true } }, placement: { select: { name: true } } }
  });
  res.json(ads.map(adForOwner));
});

router.get("/api/my/ads/:id", requireAuth, async (req, res) => {
  const ad = await ownAd(req, res);
  if (!ad) return;
  const full = await prisma.ad.findUnique({ where: { id: ad.id }, include: { payments: true, package: { select: { name: true } }, placement: { select: { name: true } } } });
  res.json(adForOwner(full));
});

router.patch("/api/my/ads/:id", requireAuth, async (req, res) => {
  const ad = await ownAd(req, res);
  if (!ad) return;
  if (!["DRAFT", "PENDING_PAYMENT"].includes(ad.status)) {
    return res.status(400).json({ error: "This advertisement can't be edited any more. Contact GamePro if something needs changing." });
  }
  const data = parseBody(adSchema, req, res);
  if (!data) return;
  try {
    await assertOwnedUploads(req.auth.user, [data.bannerUploadId, data.logoUploadId]);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }

  const { saveAsDraft, packageId, ...fields } = data;
  const update = { ...fields, logoUploadId: fields.logoUploadId || null };
  if (packageId !== ad.packageId) {
    if (ad.payments.some((p) => ["PENDING", "SUCCESSFUL"].includes(p.status))) {
      return res.status(400).json({ error: "The package can't be changed after a payment was started" });
    }
    const pkg = await loadPackage(packageId);
    if (!pkg) return res.status(400).json({ error: "That package is no longer available" });
    Object.assign(update, { packageId: pkg.id, placementId: pkg.placementId, amount: pkg.price, currency: pkg.currency, durationDays: pkg.durationDays, isFeatured: pkg.isFeatured });
  }
  const submitting = ad.status === "DRAFT" && !saveAsDraft;
  if (submitting) Object.assign(update, { status: nextStatusAfterSubmit(update.amount ?? ad.amount), submittedAt: new Date() });

  const saved = await prisma.ad.update({ where: { id: ad.id }, data: update });
  if (submitting) await announceSubmitted(saved, req.auth.user);
  res.json({ id: saved.id, status: saved.status, amount: saved.amount, currency: saved.currency });
});

router.delete("/api/my/ads/:id", requireAuth, async (req, res) => {
  const ad = await ownAd(req, res);
  if (!ad) return;
  if (!["DRAFT", "PENDING_PAYMENT"].includes(ad.status) || ad.payments.some((p) => ["PENDING", "SUCCESSFUL"].includes(p.status))) {
    return res.status(400).json({ error: "Only unpaid drafts can be deleted" });
  }
  await prisma.ad.delete({ where: { id: ad.id } });
  res.json({ ok: true });
});

// ── Advertiser: payment ────────────────────────────────────────

const payBody = z.object({
  method: z.enum(["online", "manual"]),
  reference: z.string().optional().transform((v) => (v || "").trim().toUpperCase()).pipe(z.string().max(60))
});

router.post("/api/my/ads/:id/pay", requireAuth, async (req, res) => {
  const ad = await ownAd(req, res);
  if (!ad) return;
  const body = parseBody(payBody, req, res);
  if (!body) return;
  if (!["PENDING_PAYMENT", "PAYMENT_PENDING_VERIFICATION"].includes(ad.status)) {
    return res.status(400).json({ error: "This advertisement doesn't need a payment right now" });
  }
  if (ad.payments.some((p) => p.status === "SUCCESSFUL")) {
    await onAdPaid(ad.id);
    return res.json({ ok: true, alreadyPaid: true });
  }
  const opts = paymentOptions();

  if (body.method === "online") {
    if (!opts.online) return res.status(400).json({ error: "Online payment isn't available yet" });
    const payment = await prisma.adPayment.create({
      data: { adId: ad.id, userId: req.auth.user.id, provider: "FLUTTERWAVE", txRef: newTxRef(ad.id), amount: ad.amount, currency: ad.currency }
    });
    try {
      const link = await createFlutterwaveCheckout({ payment, ad, redirectUrl: `${baseUrl()}/api/payments/flutterwave/return` });
      return res.json({ redirectUrl: link });
    } catch (e) {
      await prisma.adPayment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: "Could not start checkout" } });
      return res.status(e.status || 502).json({ error: e.message });
    }
  }

  // Manual mobile money: the payer gives the MoMo transaction ID; an admin verifies it
  if (!opts.manual) return res.status(400).json({ error: "Manual payment isn't available" });
  if (body.reference.length < 4) return res.status(400).json({ error: "Enter the transaction ID from your Mobile Money confirmation message" });
  if (ad.payments.some((p) => p.provider === "MANUAL" && p.status === "PENDING")) {
    return res.status(400).json({ error: "A payment for this advertisement is already waiting for verification" });
  }
  const reused = await prisma.adPayment.count({ where: { provider: "MANUAL", payerReference: body.reference, status: { in: ["PENDING", "SUCCESSFUL"] } } });
  if (reused) return res.status(400).json({ error: "That transaction ID was already submitted" });

  await prisma.adPayment.create({
    data: { adId: ad.id, userId: req.auth.user.id, provider: "MANUAL", txRef: newTxRef(ad.id), amount: ad.amount, currency: ad.currency, payerReference: body.reference }
  });
  await prisma.ad.update({ where: { id: ad.id }, data: { status: "PAYMENT_PENDING_VERIFICATION" } });
  await notifyAdmins(
    {
      type: "ad.payment_to_verify",
      title: "Mobile Money payment to verify",
      body: `${ad.businessName} says they paid ${formatMoney(ad.amount, ad.currency)} for "${ad.title}" (transaction ID ${body.reference}).`,
      link: "/admin#advertising"
    },
    { email: true }
  );
  res.json({ ok: true, status: "PAYMENT_PENDING_VERIFICATION" });
});

// Flutterwave sends the payer back here. We verify with Flutterwave's API before trusting anything.
router.get("/api/payments/flutterwave/return", async (req, res) => {
  const txRef = String(req.query.tx_ref || "");
  const transactionId = String(req.query.transaction_id || "");
  const payment = txRef ? await prisma.adPayment.findUnique({ where: { txRef } }) : null;
  if (!payment) return res.redirect(302, "/advertise?payment=unknown#my-ads");
  const back = (result) => res.redirect(302, `/advertise?payment=${result}&ad=${encodeURIComponent(payment.adId || "")}#my-ads`);

  if (payment.status === "SUCCESSFUL") return back("successful");
  if (String(req.query.status) === "cancelled" && !transactionId) {
    await settlePayment(payment, { state: "cancelled" });
    return back("cancelled");
  }
  let result = "pending";
  try {
    const v = await verifyFlutterwaveTransaction({ transactionId: transactionId || null, txRef });
    result = await settlePayment(payment, v);
  } catch (e) {
    console.error("[PAY] verify on return failed", e?.message);
  }
  if (result === "pending" && payment.adId) {
    await prisma.ad.updateMany({ where: { id: payment.adId, status: "PENDING_PAYMENT" }, data: { status: "PAYMENT_PENDING_VERIFICATION" } });
  }
  back(result);
});

// Server-to-server confirmation from Flutterwave (configure this URL + secret hash in the Flutterwave dashboard)
router.post("/api/payments/flutterwave/webhook", async (req, res) => {
  if (!isValidFlutterwaveWebhook(req)) return res.status(401).end();
  const d = req.body?.data || {};
  const payment = d.tx_ref ? await prisma.adPayment.findUnique({ where: { txRef: String(d.tx_ref) } }) : null;
  if (!payment) return res.status(200).json({ ok: true, ignored: true });
  try {
    const v = await verifyFlutterwaveTransaction({ transactionId: d.id ? String(d.id) : null, txRef: payment.txRef });
    await settlePayment(payment, v);
  } catch (e) {
    console.error("[PAY] webhook verify failed", e?.message);
    return res.status(500).json({ ok: false }); // Flutterwave retries failed webhooks
  }
  res.json({ ok: true });
});

export default router;
