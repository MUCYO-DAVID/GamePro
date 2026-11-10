import express from "express";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";

const router = express.Router();

router.get("/api/notifications", requireAuth, async (req, res) => {
  const userId = req.auth.user.id;
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.notification.count({ where: { userId, readAt: null } })
  ]);
  res.json({ items, unread });
});

router.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
  const unread = await prisma.notification.count({ where: { userId: req.auth.user.id, readAt: null } });
  res.json({ unread });
});

// Body: { ids: [...] } to mark some, or {} to mark all as read
router.post("/api/notifications/read", requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => typeof x === "string").slice(0, 100) : null;
  const r = await prisma.notification.updateMany({
    where: { userId: req.auth.user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() }
  });
  res.json({ ok: true, updated: r.count });
});

export default router;
