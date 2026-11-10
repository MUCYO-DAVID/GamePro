import express from "express";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { MAX_UPLOAD_BYTES, saveImage, uploadUrl, publicStorageUrl } from "../lib/uploads.js";

const router = express.Router();
const MAX_UPLOADS_PER_HOUR = 80;

// Upload one image as the raw request body (Content-Type: image/jpeg|png|webp)
router.post(
  "/api/uploads",
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_UPLOAD_BYTES }),
  requireAuth,
  async (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ error: "Send a JPEG, PNG or WebP image (max 2 MB)" });
    }
    const user = req.auth.user;
    const recent = await prisma.upload.count({
      where: { ownerId: user.id, createdAt: { gt: new Date(Date.now() - 3600 * 1000) } }
    });
    if (recent >= MAX_UPLOADS_PER_HOUR && !user.isAdmin) {
      return res.status(429).json({ error: "Too many uploads. Please try again in an hour." });
    }
    try {
      const up = await saveImage(user.id, buf);
      res.status(201).json({ id: up.id, url: uploadUrl(up.id) });
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  }
);

// Serve an image. Uploads never change, so browsers and Vercel's CDN can cache them for a year.
router.get("/api/uploads/:id", async (req, res) => {
  const up = await prisma.upload.findUnique({
    where: { id: req.params.id },
    select: { mimeType: true, data: true, storageKey: true }
  });
  if (!up) return res.status(404).json({ error: "Image not found" });
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  if (up.storageKey) return res.redirect(302, publicStorageUrl(up.storageKey));
  res.setHeader("Content-Type", up.mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "inline");
  res.send(Buffer.from(up.data));
});

export default router;
