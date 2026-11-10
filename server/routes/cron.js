import express from "express";
import crypto from "crypto";
import { sweepAds } from "../lib/ads.js";
import { deleteOrphanUploads } from "../lib/uploads.js";

const router = express.Router();

// Vercel Cron calls this daily (see vercel.json) with "Authorization: Bearer <CRON_SECRET>".
// Expiry also happens on demand when ads are loaded, so this is a safety net + notifications.
router.get("/api/cron/daily", async (req, res) => {
  const secret = process.env.CRON_SECRET || "";
  const got = String(req.headers.authorization || "");
  const expected = `Bearer ${secret}`;
  const ok = secret && got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  if (!ok) return res.status(401).json({ error: "Unauthorized" });

  await sweepAds({ force: true });
  const removedUploads = await deleteOrphanUploads();
  res.json({ ok: true, removedUploads });
});

export default router;
