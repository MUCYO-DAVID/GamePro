import express from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAdmin } from "../lib/auth.js";
import { uploadUrl } from "../lib/uploads.js";
import { text, optionalText, parseBody, parsePatch, audit, notify } from "../lib/util.js";

const router = express.Router();
router.use("/api/admin", requireAdmin); // every /api/admin/* route below is admin-only

const reasonBody = z.object({ reason: optionalText(500) });

// ── Overview ───────────────────────────────────────────────────

router.get("/api/admin/marketplace/overview", async (_req, res) => {
  const [byStatus, sellers, suspendedSellers, openReports, inquiries, activity] = await Promise.all([
    prisma.product.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.sellerProfile.count(),
    prisma.sellerProfile.count({ where: { status: "SUSPENDED" } }),
    prisma.productReport.count({ where: { status: "OPEN" } }),
    prisma.productInquiry.count(),
    prisma.auditLog.findMany({
      where: { entityType: { in: ["product", "category", "seller", "report"] } },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { actor: { select: { email: true } } }
    })
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
  res.json({ counts, sellers, suspendedSellers, openReports, inquiries, activity });
});

// ── Listings ───────────────────────────────────────────────────

router.get("/api/admin/marketplace/products", async (req, res) => {
  const status = String(req.query.status || "");
  const q = String(req.query.q || "").trim();
  const where = {};
  if (status) where.status = status;
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { seller: { displayName: { contains: q, mode: "insensitive" } } }];
  const rows = await prisma.product.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 150,
    include: {
      images: { orderBy: { position: "asc" }, take: 1, select: { uploadId: true } },
      category: { select: { name: true } },
      seller: { select: { displayName: true, type: true, status: true, user: { select: { email: true } } } },
      _count: { select: { reports: { where: { status: "OPEN" } }, inquiries: true, favorites: true } }
    }
  });
  res.json(
    rows.map((p) => ({
      id: p.id,
      title: p.title,
      price: p.price,
      currency: p.currency,
      condition: p.condition,
      status: p.status,
      availability: p.availability,
      location: p.location,
      declineReason: p.declineReason,
      viewCount: p.viewCount,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      soldAt: p.soldAt,
      category: p.category.name,
      seller: { displayName: p.seller.displayName, type: p.seller.type, status: p.seller.status, email: p.seller.user.email },
      imageUrl: uploadUrl(p.images[0]?.uploadId),
      openReports: p._count.reports,
      inquiries: p._count.inquiries,
      favorites: p._count.favorites
    }))
  );
});

router.post("/api/admin/marketplace/products/:id/:action", async (req, res) => {
  const { id, action } = req.params;
  const body = parseBody(reasonBody, req, res);
  if (!body) return;
  const p = await prisma.product.findUnique({ where: { id }, include: { seller: { select: { userId: true } } } });
  if (!p) return res.status(404).json({ error: "Listing not found" });
  const admin = req.auth.user;
  const now = new Date();
  let data;
  let note;

  if (action === "approve" && ["PENDING_REVIEW", "DECLINED"].includes(p.status)) {
    data = { status: "ACTIVE", publishedAt: p.publishedAt || now, declineReason: null };
    note = { type: "product.approved", title: "Listing approved", body: `"${p.title}" is now live in the GamePro marketplace.`, link: `/marketplace/${p.id}` };
  } else if (action === "decline" && p.status === "PENDING_REVIEW") {
    if (!body.reason) return res.status(400).json({ error: "Give a reason so the seller knows what to fix" });
    data = { status: "DECLINED", declineReason: body.reason };
    note = { type: "product.declined", title: "Listing declined", body: `"${p.title}" was declined: ${body.reason}. You can edit it and submit it again.`, link: "/sell" };
  } else if (action === "remove" && p.status !== "REMOVED") {
    if (!body.reason) return res.status(400).json({ error: "Give a reason for removing this listing" });
    data = { status: "REMOVED", declineReason: body.reason };
    note = { type: "product.removed", title: "Listing removed", body: `"${p.title}" was removed from the marketplace: ${body.reason}`, link: "/sell" };
  } else if (action === "restore" && p.status === "REMOVED") {
    data = { status: p.publishedAt ? "ACTIVE" : "PENDING_REVIEW", declineReason: null };
  } else {
    return res.status(400).json({ error: `Can't ${action} a listing that is ${p.status.toLowerCase().replace("_", " ")}` });
  }

  const updated = await prisma.product.update({
    where: { id },
    data: { ...data, reviewedById: admin.id, reviewedAt: now },
    select: { id: true, status: true }
  });
  await audit(admin.id, `product.${action}`, "product", id, { title: p.title, from: p.status, to: updated.status, reason: body.reason });
  if (note) await notify(p.seller.userId, note, { email: true });
  res.json(updated);
});

// ── Categories ─────────────────────────────────────────────────

const categorySchema = z.object({
  name: text(2, 60),
  icon: z.string().trim().regex(/^fa-[a-z0-9-]+$/, "Icon must be a Font Awesome name like fa-gamepad").optional().default("fa-gamepad"),
  parentId: z.string().optional().nullable().transform((v) => v || null),
  sortOrder: z.coerce.number().int().min(0).max(999).optional().default(0),
  isActive: z.boolean().optional().default(true)
});

function slugify(s) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "category";
}

router.get("/api/admin/marketplace/categories", async (_req, res) => {
  const cats = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true, children: true } } }
  });
  res.json(cats);
});

async function validParent(parentId, selfId) {
  if (!parentId) return true;
  if (parentId === selfId) return false;
  const parent = await prisma.category.findUnique({ where: { id: parentId }, select: { parentId: true } });
  return !!parent && !parent.parentId; // only two levels: category → subcategory
}

router.post("/api/admin/marketplace/categories", async (req, res) => {
  const data = parseBody(categorySchema, req, res);
  if (!data) return;
  if (!(await validParent(data.parentId))) return res.status(400).json({ error: "Choose a main category as the parent" });
  let slug = slugify(data.name);
  if (await prisma.category.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
  const cat = await prisma.category.create({ data: { ...data, slug } });
  await audit(req.auth.user.id, "category.create", "category", cat.id, { name: cat.name });
  res.status(201).json(cat);
});

router.patch("/api/admin/marketplace/categories/:id", async (req, res) => {
  const data = parsePatch(categorySchema, req, res);
  if (!data) return;
  const cat = await prisma.category.findUnique({ where: { id: req.params.id }, include: { _count: { select: { children: true } } } });
  if (!cat) return res.status(404).json({ error: "Category not found" });
  if ("parentId" in data && data.parentId && (cat._count.children > 0 || !(await validParent(data.parentId, cat.id)))) {
    return res.status(400).json({ error: "A category with subcategories can't be moved under another one" });
  }
  const updated = await prisma.category.update({ where: { id: cat.id }, data });
  await audit(req.auth.user.id, "category.update", "category", cat.id, { name: updated.name, changes: data });
  res.json(updated);
});

router.delete("/api/admin/marketplace/categories/:id", async (req, res) => {
  const cat = await prisma.category.findUnique({ where: { id: req.params.id }, include: { _count: { select: { products: true, children: true } } } });
  if (!cat) return res.status(404).json({ error: "Category not found" });
  if (cat._count.products || cat._count.children) {
    return res.status(400).json({ error: "This category still has listings or subcategories. Disable it instead." });
  }
  await prisma.category.delete({ where: { id: cat.id } });
  await audit(req.auth.user.id, "category.delete", "category", cat.id, { name: cat.name });
  res.json({ ok: true });
});

// ── Sellers ────────────────────────────────────────────────────

router.get("/api/admin/marketplace/sellers", async (_req, res) => {
  const sellers = await prisma.sellerProfile.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { user: { select: { email: true } }, _count: { select: { products: true } } }
  });
  const active = await prisma.product.groupBy({ by: ["sellerId"], where: { status: "ACTIVE" }, _count: { _all: true } });
  const sold = await prisma.product.groupBy({ by: ["sellerId"], where: { status: "SOLD" }, _count: { _all: true } });
  const a = Object.fromEntries(active.map((r) => [r.sellerId, r._count._all]));
  const s = Object.fromEntries(sold.map((r) => [r.sellerId, r._count._all]));
  res.json(sellers.map((x) => ({ ...x, email: x.user.email, user: undefined, listings: x._count.products, activeListings: a[x.id] || 0, soldListings: s[x.id] || 0 })));
});

router.post("/api/admin/marketplace/sellers/:id/status", async (req, res) => {
  const status = req.body?.status;
  if (!["ACTIVE", "SUSPENDED"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  const body = parseBody(reasonBody, req, res);
  if (!body) return;
  const seller = await prisma.sellerProfile.findUnique({ where: { id: req.params.id } });
  if (!seller) return res.status(404).json({ error: "Seller not found" });
  const updated = await prisma.sellerProfile.update({ where: { id: seller.id }, data: { status } });
  await audit(req.auth.user.id, status === "SUSPENDED" ? "seller.suspend" : "seller.reactivate", "seller", seller.id, { name: seller.displayName, reason: body.reason });
  await notify(
    seller.userId,
    status === "SUSPENDED"
      ? { type: "seller.suspended", title: "Seller account suspended", body: `Your listings are hidden from the marketplace.${body.reason ? ` Reason: ${body.reason}` : ""}`, link: "/sell" }
      : { type: "seller.reactivated", title: "Seller account reactivated", body: "Your listings are visible in the marketplace again.", link: "/sell" },
    { email: true }
  );
  res.json(updated);
});

// ── Reports ────────────────────────────────────────────────────

router.get("/api/admin/marketplace/reports", async (req, res) => {
  const status = ["OPEN", "RESOLVED", "DISMISSED"].includes(req.query.status) ? req.query.status : "OPEN";
  const rows = await prisma.productReport.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take: 150,
    include: { product: { select: { id: true, title: true, status: true } }, reporter: { select: { email: true } } }
  });
  // hide the anonymous visitor tag used for de-duplicating guest reports
  res.json(rows.map((r) => ({ ...r, details: r.details?.replace(/^\[[A-Za-z0-9_-]{32}\]\s*/, "") || null })));
});

router.post("/api/admin/marketplace/reports/:id", async (req, res) => {
  const status = req.body?.status;
  if (!["RESOLVED", "DISMISSED"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  const report = await prisma.productReport.findUnique({ where: { id: req.params.id } });
  if (!report) return res.status(404).json({ error: "Report not found" });
  await prisma.productReport.update({ where: { id: report.id }, data: { status, resolvedAt: new Date() } });
  await audit(req.auth.user.id, `report.${status.toLowerCase()}`, "report", report.id, { productId: report.productId, reason: report.reason });
  res.json({ ok: true });
});

// ── Audit log ──────────────────────────────────────────────────

router.get("/api/admin/audit", async (req, res) => {
  const take = Math.min(Number(req.query.limit) || 50, 200);
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take, include: { actor: { select: { email: true } } } });
  res.json(rows);
});

export default router;
