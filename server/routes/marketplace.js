import express from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth, getVerifiedUser } from "../lib/auth.js";
import { uploadUrl, assertOwnedUploads } from "../lib/uploads.js";
import {
  text,
  optionalText,
  phone,
  optionalEmail,
  parseBody,
  parsePatch,
  visitorHash,
  dayKey,
  isUniqueViolation,
  notify,
  notifyAdmins,
  formatMoney
} from "../lib/util.js";

const router = express.Router();
const PAGE_SIZE = 12;

export function moderationEnabled() {
  return String(process.env.MARKETPLACE_REQUIRE_APPROVAL ?? "true").toLowerCase() !== "false";
}

// ── Shapes sent to the browser ─────────────────────────────────

const cardSelect = {
  id: true,
  title: true,
  price: true,
  currency: true,
  condition: true,
  location: true,
  availability: true,
  status: true,
  quantity: true,
  publishedAt: true,
  createdAt: true,
  category: { select: { name: true, slug: true, icon: true, parent: { select: { name: true, slug: true } } } },
  seller: { select: { displayName: true, type: true } },
  images: { orderBy: { position: "asc" }, take: 1, select: { uploadId: true } }
};

function toCard(p, favoriteIds = new Set()) {
  return {
    id: p.id,
    title: p.title,
    price: p.price,
    currency: p.currency,
    condition: p.condition,
    location: p.location,
    availability: p.availability,
    status: p.status,
    quantity: p.quantity,
    publishedAt: p.publishedAt,
    createdAt: p.createdAt,
    category: {
      name: p.category.name,
      slug: p.category.slug,
      icon: p.category.icon,
      parentSlug: p.category.parent?.slug || p.category.slug,
      parentName: p.category.parent?.name || null
    },
    seller: { displayName: p.seller.displayName, type: p.seller.type },
    imageUrl: uploadUrl(p.images[0]?.uploadId),
    isFavorite: favoriteIds.has(p.id)
  };
}

async function favoriteSet(user, productIds) {
  if (!user || !productIds.length) return new Set();
  const favs = await prisma.favorite.findMany({
    where: { userId: user.id, productId: { in: productIds } },
    select: { productId: true }
  });
  return new Set(favs.map((f) => f.productId));
}

// Products that buyers can see: approved, and from a seller who isn't suspended
const publicWhere = { status: "ACTIVE", seller: { status: "ACTIVE" } };

// ── Categories ─────────────────────────────────────────────────

router.get("/api/marketplace/categories", async (_req, res) => {
  const cats = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, icon: true, parentId: true }
  });
  const counts = await prisma.product.groupBy({ by: ["categoryId"], where: publicWhere, _count: { _all: true } });
  const countBy = Object.fromEntries(counts.map((c) => [c.categoryId, c._count._all]));
  const top = cats.filter((c) => !c.parentId);
  res.json(
    top.map((t) => {
      const children = cats.filter((c) => c.parentId === t.id).map((c) => ({ ...c, count: countBy[c.id] || 0 }));
      return { ...t, count: (countBy[t.id] || 0) + children.reduce((s, c) => s + c.count, 0), children };
    })
  );
});

router.get("/api/marketplace/locations", async (_req, res) => {
  const rows = await prisma.product.groupBy({
    by: ["location"],
    where: publicWhere,
    _count: { _all: true },
    orderBy: { _count: { location: "desc" } },
    take: 30
  });
  res.json(rows.map((r) => r.location));
});

// ── Browse & search ────────────────────────────────────────────

const listQuery = z.object({
  q: z.string().max(100).optional(),
  category: z.string().max(80).optional(),
  condition: z.enum(["NEW", "USED"]).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  location: z.string().max(80).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc"]).optional(),
  favorites: z.enum(["1"]).optional(),
  page: z.coerce.number().int().min(1).max(500).optional()
});

router.get("/api/marketplace/products", async (req, res) => {
  const parsed = listQuery.safeParse(
    Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== "" && typeof v === "string"))
  );
  if (!parsed.success) return res.status(400).json({ error: "Invalid filters" });
  const f = parsed.data;
  const user = await getVerifiedUser(req);

  const and = [publicWhere];
  if (f.q?.trim()) {
    const q = f.q.trim();
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { category: { name: { contains: q, mode: "insensitive" } } }
      ]
    });
  }
  if (f.category) {
    const cat = await prisma.category.findUnique({ where: { slug: f.category }, select: { id: true, children: { select: { id: true } } } });
    if (!cat) return res.json({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE, pages: 0 });
    and.push({ categoryId: { in: [cat.id, ...cat.children.map((c) => c.id)] } });
  }
  if (f.condition) and.push({ condition: f.condition });
  if (f.minPrice != null) and.push({ price: { gte: f.minPrice } });
  if (f.maxPrice != null) and.push({ price: { lte: f.maxPrice } });
  if (f.location?.trim()) and.push({ location: { contains: f.location.trim(), mode: "insensitive" } });
  if (f.favorites) {
    if (!user) return res.status(401).json({ error: "Sign in to see your saved items" });
    and.push({ favorites: { some: { userId: user.id } } });
  }

  const orderBy =
    f.sort === "price_asc"
      ? [{ price: "asc" }, { publishedAt: "desc" }]
      : f.sort === "price_desc"
        ? [{ price: "desc" }, { publishedAt: "desc" }]
        : [{ publishedAt: "desc" }, { createdAt: "desc" }];

  const page = f.page || 1;
  const where = { AND: and };
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: cardSelect })
  ]);
  const favs = await favoriteSet(user, rows.map((r) => r.id));
  res.json({ items: rows.map((r) => toCard(r, favs)), total, page, pageSize: PAGE_SIZE, pages: Math.ceil(total / PAGE_SIZE) });
});

// ── Product details ────────────────────────────────────────────

router.get("/api/marketplace/products/:id", async (req, res) => {
  const user = await getVerifiedUser(req);
  const p = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: {
      images: { orderBy: { position: "asc" }, select: { uploadId: true } },
      category: { select: { id: true, name: true, slug: true, icon: true, parentId: true, parent: { select: { name: true, slug: true } } } },
      seller: {
        select: {
          id: true,
          userId: true,
          displayName: true,
          type: true,
          location: true,
          whatsapp: true,
          bio: true,
          status: true,
          createdAt: true,
          _count: { select: { products: { where: { status: "ACTIVE" } } } }
        }
      },
      _count: { select: { favorites: true } }
    }
  });
  if (!p) return res.status(404).json({ error: "This listing doesn't exist" });

  const isOwner = !!user && p.seller.userId === user.id;
  const isAdmin = !!user?.isAdmin;
  const publiclyVisible = ["ACTIVE", "SOLD"].includes(p.status) && p.seller.status === "ACTIVE";
  if (!publiclyVisible && !isOwner && !isAdmin) return res.status(404).json({ error: "This listing is not available" });

  // Count one view per visitor per day (owners and admins don't count)
  if (publiclyVisible && !isOwner && !isAdmin) {
    try {
      await prisma.productView.create({ data: { productId: p.id, visitorHash: visitorHash(req), day: dayKey() } });
      await prisma.product.update({ where: { id: p.id }, data: { viewCount: { increment: 1 } } });
      p.viewCount += 1;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }

  const relatedCategoryIds = p.category.parentId
    ? [p.category.id, ...(await prisma.category.findMany({ where: { parentId: p.category.parentId }, select: { id: true } })).map((c) => c.id)]
    : [p.category.id];
  const relatedRows = await prisma.product.findMany({
    where: { AND: [publicWhere, { id: { not: p.id } }, { categoryId: { in: relatedCategoryIds } }] },
    orderBy: { publishedAt: "desc" },
    take: 4,
    select: cardSelect
  });
  const favs = await favoriteSet(user, [p.id, ...relatedRows.map((r) => r.id)]);

  res.json({
    id: p.id,
    title: p.title,
    description: p.description,
    price: p.price,
    currency: p.currency,
    condition: p.condition,
    conditionNotes: p.conditionNotes,
    brand: p.brand,
    location: p.location,
    contactPhone: p.contactPhone,
    contactEmail: p.contactEmail,
    specs: Array.isArray(p.specs) ? p.specs : [],
    quantity: p.quantity,
    availability: p.availability,
    status: p.status,
    declineReason: isOwner || isAdmin ? p.declineReason : undefined,
    viewCount: p.viewCount,
    favoriteCount: p._count.favorites,
    publishedAt: p.publishedAt,
    soldAt: p.soldAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    images: p.images.map((i) => uploadUrl(i.uploadId)),
    category: {
      name: p.category.name,
      slug: p.category.slug,
      icon: p.category.icon,
      parentSlug: p.category.parent?.slug || p.category.slug,
      parentName: p.category.parent?.name || null
    },
    seller: {
      displayName: p.seller.displayName,
      type: p.seller.type,
      location: p.seller.location,
      whatsapp: p.seller.whatsapp,
      bio: p.seller.bio,
      memberSince: p.seller.createdAt,
      activeListings: p.seller._count.products
    },
    isOwner,
    isFavorite: favs.has(p.id),
    signedIn: !!user,
    related: relatedRows.map((r) => toCard(r, favs))
  });
});

// ── Favorites ──────────────────────────────────────────────────

router.post("/api/marketplace/products/:id/favorite", requireAuth, async (req, res) => {
  const userId = req.auth.user.id;
  const productId = req.params.id;
  const existing = await prisma.favorite.findUnique({ where: { userId_productId: { userId, productId } } });
  if (existing) {
    await prisma.favorite.delete({ where: { userId_productId: { userId, productId } } });
    return res.json({ isFavorite: false });
  }
  const product = await prisma.product.findFirst({ where: { id: productId, ...publicWhere }, select: { id: true } });
  if (!product) return res.status(404).json({ error: "This listing is not available" });
  try {
    await prisma.favorite.create({ data: { userId, productId } });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
  }
  res.json({ isFavorite: true });
});

// ── Contact seller (inquiries) ─────────────────────────────────

const inquirySchema = z.object({
  name: text(2, 80),
  email: optionalEmail,
  phone: z.string().optional().nullable().transform((v) => (v ? v.trim() : null)).pipe(phone.nullable()),
  message: text(5, 2000)
});

router.post("/api/marketplace/products/:id/inquiries", async (req, res) => {
  const data = parseBody(inquirySchema, req, res);
  if (!data) return;
  const user = await getVerifiedUser(req);
  if (!data.email && !data.phone && !user) {
    return res.status(400).json({ error: "Add an email or phone number so the seller can reply" });
  }

  const product = await prisma.product.findFirst({
    where: { id: req.params.id, ...publicWhere },
    select: { id: true, title: true, seller: { select: { userId: true } } }
  });
  if (!product) return res.status(404).json({ error: "This listing is not available" });
  if (user && product.seller.userId === user.id) return res.status(400).json({ error: "This is your own listing" });

  const vh = visitorHash(req);
  const recent = await prisma.productInquiry.count({ where: { visitorHash: vh, createdAt: { gt: new Date(Date.now() - 3600 * 1000) } } });
  if (recent >= 5) return res.status(429).json({ error: "You've sent several messages recently. Please try again later." });

  const email = data.email || user?.email || null;
  await prisma.productInquiry.create({
    data: { productId: product.id, buyerId: user?.id || null, name: data.name, email, phone: data.phone, message: data.message, visitorHash: vh }
  });

  const contact = [email, data.phone].filter(Boolean).join(" / ");
  await notify(
    product.seller.userId,
    {
      type: "product.inquiry",
      title: `New inquiry: ${product.title}`,
      body: `${data.name} (${contact}) wrote: "${data.message.slice(0, 300)}"`,
      link: "/sell#inquiries"
    },
    { email: true }
  );
  res.status(201).json({ ok: true });
});

// ── Report a listing ───────────────────────────────────────────

const reportSchema = z.object({
  reason: z.enum(["Scam or fraud", "Wrong category", "Prohibited item", "Misleading information", "Duplicate listing", "Other"]),
  details: optionalText(1000)
});

router.post("/api/marketplace/products/:id/report", async (req, res) => {
  const data = parseBody(reportSchema, req, res);
  if (!data) return;
  const user = await getVerifiedUser(req);
  const product = await prisma.product.findUnique({ where: { id: req.params.id }, select: { id: true, title: true } });
  if (!product) return res.status(404).json({ error: "This listing doesn't exist" });

  const vh = visitorHash(req);
  const dup = await prisma.productReport.count({
    where: { productId: product.id, status: "OPEN", ...(user ? { reporterId: user.id } : { details: { startsWith: `[${vh}]` } }) }
  });
  if (dup) return res.json({ ok: true, alreadyReported: true });

  await prisma.productReport.create({
    data: {
      productId: product.id,
      reporterId: user?.id || null,
      reason: data.reason,
      // guests are tagged with their anonymous visitor id so repeat reports are ignored
      details: user ? data.details : `[${vh}] ${data.details || ""}`.trim()
    }
  });
  await notifyAdmins({ type: "product.reported", title: "Listing reported", body: `"${product.title}" was reported: ${data.reason}`, link: "/admin#marketplace" });
  res.status(201).json({ ok: true });
});

// ── Seller profile ─────────────────────────────────────────────

const sellerSchema = z.object({
  displayName: text(2, 80),
  type: z.enum(["INDIVIDUAL", "STORE"]),
  phone,
  whatsapp: z.string().optional().nullable().transform((v) => (v ? v.trim() : null)).pipe(phone.nullable()),
  location: text(2, 80),
  bio: optionalText(500)
});

router.get("/api/seller/profile", requireAuth, async (req, res) => {
  const profile = await prisma.sellerProfile.findUnique({ where: { userId: req.auth.user.id } });
  res.json({ profile, moderation: moderationEnabled() });
});

router.put("/api/seller/profile", requireAuth, async (req, res) => {
  const data = parseBody(sellerSchema, req, res);
  if (!data) return;
  const userId = req.auth.user.id;
  const profile = await prisma.sellerProfile.upsert({ where: { userId }, update: data, create: { ...data, userId } });
  res.json({ profile });
});

async function requireSeller(req, res) {
  const profile = await prisma.sellerProfile.findUnique({ where: { userId: req.auth.user.id } });
  if (!profile) {
    res.status(400).json({ error: "Set up your seller profile first" });
    return null;
  }
  if (profile.status !== "ACTIVE") {
    res.status(403).json({ error: "Your seller account is suspended. Contact GamePro for help." });
    return null;
  }
  return profile;
}

// ── Seller listings ────────────────────────────────────────────

const specSchema = z.object({ label: text(1, 40), value: text(1, 120) });

const productSchema = z.object({
  title: text(3, 120),
  categoryId: z.string().min(1, "Choose a category"),
  description: text(20, 5000),
  price: z.coerce.number().int("Price must be a whole number").min(1, "Enter a price").max(1_000_000_000),
  condition: z.enum(["NEW", "USED"]),
  conditionNotes: optionalText(1000),
  brand: optionalText(60),
  location: text(2, 80),
  contactPhone: phone,
  contactEmail: optionalEmail,
  specs: z.array(specSchema).max(20).optional().default([]),
  quantity: z.coerce.number().int().min(1).max(10000).optional().default(1),
  availability: z.enum(["AVAILABLE", "RESERVED", "OUT_OF_STOCK"]).optional().default("AVAILABLE"),
  imageIds: z.array(z.string().min(1)).min(1, "Add at least one photo").max(8, "Up to 8 photos")
});

async function checkCategory(categoryId) {
  const cat = await prisma.category.findUnique({ where: { id: categoryId }, select: { isActive: true, parent: { select: { isActive: true } } } });
  return !!cat && cat.isActive && (cat.parent ? cat.parent.isActive : true);
}

router.get("/api/seller/products", requireAuth, async (req, res) => {
  const profile = await prisma.sellerProfile.findUnique({ where: { userId: req.auth.user.id } });
  if (!profile) return res.json({ items: [], stats: null });
  const rows = await prisma.product.findMany({
    where: { sellerId: profile.id },
    orderBy: { updatedAt: "desc" },
    select: { ...cardSelect, declineReason: true, viewCount: true, updatedAt: true, _count: { select: { favorites: true, inquiries: true } } }
  });
  const items = rows.map((r) => ({
    ...toCard(r),
    declineReason: r.declineReason,
    viewCount: r.viewCount,
    updatedAt: r.updatedAt,
    favoriteCount: r._count.favorites,
    inquiryCount: r._count.inquiries
  }));
  const by = (s) => items.filter((i) => i.status === s).length;
  res.json({
    items,
    stats: {
      active: by("ACTIVE"),
      pending: by("PENDING_REVIEW"),
      sold: by("SOLD"),
      views: items.reduce((s, i) => s + i.viewCount, 0),
      inquiries: items.reduce((s, i) => s + i.inquiryCount, 0)
    }
  });
});

async function ownProduct(req, res) {
  const p = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { seller: { select: { userId: true } }, images: { orderBy: { position: "asc" }, select: { uploadId: true } } }
  });
  if (!p || p.seller.userId !== req.auth.user.id) {
    res.status(404).json({ error: "Listing not found" });
    return null;
  }
  return p;
}

router.get("/api/seller/products/:id", requireAuth, async (req, res) => {
  const p = await ownProduct(req, res);
  if (!p) return;
  res.json({ ...p, seller: undefined, images: p.images.map((i) => ({ id: i.uploadId, url: uploadUrl(i.uploadId) })) });
});

router.post("/api/seller/products", requireAuth, async (req, res) => {
  const seller = await requireSeller(req, res);
  if (!seller) return;
  const data = parseBody(productSchema, req, res);
  if (!data) return;
  if (!(await checkCategory(data.categoryId))) return res.status(400).json({ error: "Choose a valid category" });
  let imageIds;
  try {
    imageIds = await assertOwnedUploads(req.auth.user, data.imageIds);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }

  const moderate = moderationEnabled();
  const { imageIds: _ignored, ...fields } = data;
  const product = await prisma.product.create({
    data: {
      ...fields,
      sellerId: seller.id,
      status: moderate ? "PENDING_REVIEW" : "ACTIVE",
      publishedAt: moderate ? null : new Date(),
      images: { create: imageIds.map((uploadId, position) => ({ uploadId, position })) }
    },
    select: { id: true, title: true, status: true, price: true, currency: true }
  });

  if (moderate) {
    await notify(req.auth.user.id, {
      type: "product.submitted",
      title: "Listing submitted",
      body: `"${product.title}" was submitted and will appear in the marketplace once it's approved.`,
      link: "/sell"
    });
    await notifyAdmins(
      {
        type: "product.submitted",
        title: "New listing to review",
        body: `${seller.displayName} listed "${product.title}" for ${formatMoney(product.price, product.currency)}.`,
        link: "/admin#marketplace"
      },
      { email: true }
    );
  }
  res.status(201).json(product);
});

const CONTENT_FIELDS = ["title", "categoryId", "description", "condition", "conditionNotes", "brand", "specs"];

router.patch("/api/seller/products/:id", requireAuth, async (req, res) => {
  const seller = await requireSeller(req, res);
  if (!seller) return;
  const p = await ownProduct(req, res);
  if (!p) return;
  if (p.status === "REMOVED") return res.status(403).json({ error: "This listing was removed by GamePro and can't be edited" });

  const data = parsePatch(productSchema, req, res);
  if (!data) return;
  if (data.categoryId && !(await checkCategory(data.categoryId))) return res.status(400).json({ error: "Choose a valid category" });

  const { imageIds, ...fields } = data;
  let imagesChanged = false;
  let ownedIds = null;
  if (imageIds) {
    try {
      ownedIds = await assertOwnedUploads(req.auth.user, imageIds);
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }
    imagesChanged = ownedIds.join(",") !== p.images.map((i) => i.uploadId).join(",");
  }

  const contentChanged =
    imagesChanged || CONTENT_FIELDS.some((k) => fields[k] !== undefined && JSON.stringify(fields[k]) !== JSON.stringify(p[k]));
  let status = p.status;
  if (moderationEnabled() && ((p.status === "ACTIVE" && contentChanged) || p.status === "DECLINED")) status = "PENDING_REVIEW";
  if (!moderationEnabled() && p.status === "DECLINED") status = "ACTIVE";

  const updated = await prisma.$transaction(async (tx) => {
    if (imagesChanged) {
      await tx.productImage.deleteMany({ where: { productId: p.id } });
      await tx.productImage.createMany({ data: ownedIds.map((uploadId, position) => ({ productId: p.id, uploadId, position })) });
    }
    return tx.product.update({
      where: { id: p.id },
      data: {
        ...fields,
        status,
        declineReason: status === "PENDING_REVIEW" ? null : p.declineReason,
        publishedAt: status === "ACTIVE" && !p.publishedAt ? new Date() : p.publishedAt
      },
      select: { id: true, title: true, status: true }
    });
  });

  if (status === "PENDING_REVIEW" && p.status !== "PENDING_REVIEW") {
    await notifyAdmins({ type: "product.submitted", title: "Listing updated, needs review", body: `${seller.displayName} edited "${updated.title}".`, link: "/admin#marketplace" });
  }
  res.json({ ...updated, reReview: status === "PENDING_REVIEW" && p.status !== "PENDING_REVIEW" });
});

router.post("/api/seller/products/:id/status", requireAuth, async (req, res) => {
  const seller = await requireSeller(req, res);
  if (!seller) return;
  const p = await ownProduct(req, res);
  if (!p) return;
  const action = req.body?.action;

  let data;
  if (action === "sold" && ["ACTIVE", "INACTIVE"].includes(p.status)) {
    data = { status: "SOLD", soldAt: new Date(), availability: "OUT_OF_STOCK" };
  } else if (action === "deactivate" && ["ACTIVE", "PENDING_REVIEW"].includes(p.status)) {
    data = { status: "INACTIVE" };
  } else if ((action === "activate" && p.status === "INACTIVE") || (action === "relist" && p.status === "SOLD")) {
    // Listings that were approved before go straight back live; never-approved ones need review
    const live = !!p.publishedAt || !moderationEnabled();
    data = { status: live ? "ACTIVE" : "PENDING_REVIEW", publishedAt: p.publishedAt || (live ? new Date() : null) };
    if (action === "relist") Object.assign(data, { soldAt: null, availability: "AVAILABLE" });
  } else {
    return res.status(400).json({ error: "That action isn't possible for this listing right now" });
  }

  const updated = await prisma.product.update({ where: { id: p.id }, data, select: { id: true, status: true, title: true } });
  if (updated.status === "SOLD") {
    await notify(req.auth.user.id, { type: "product.sold", title: "Marked as sold", body: `"${updated.title}" is marked as sold. Congratulations!`, link: "/sell" });
  }
  res.json(updated);
});

router.delete("/api/seller/products/:id", requireAuth, async (req, res) => {
  const p = await ownProduct(req, res);
  if (!p) return;
  await prisma.product.delete({ where: { id: p.id } });
  res.json({ ok: true });
});

// ── Seller inquiries inbox ─────────────────────────────────────

router.get("/api/seller/inquiries", requireAuth, async (req, res) => {
  const rows = await prisma.productInquiry.findMany({
    where: { product: { seller: { userId: req.auth.user.id } } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, name: true, email: true, phone: true, message: true, readAt: true, createdAt: true, product: { select: { id: true, title: true } } }
  });
  res.json(rows);
});

router.post("/api/seller/inquiries/:id/read", requireAuth, async (req, res) => {
  const r = await prisma.productInquiry.updateMany({
    where: { id: req.params.id, product: { seller: { userId: req.auth.user.id } }, readAt: null },
    data: { readAt: new Date() }
  });
  res.json({ ok: true, updated: r.count });
});

export default router;
