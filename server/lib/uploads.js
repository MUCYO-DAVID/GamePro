import crypto from "crypto";
import { prisma } from "./db.js";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // images are resized in the browser before upload
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "gamepro-uploads";

// Detect the real file type from its first bytes (never trust the browser's Content-Type).
// SVG/GIF are rejected on purpose: SVG can carry scripts.
export function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return url && key ? { url, key } : null;
}

export function storageDriver() {
  return supabaseConfig() ? "supabase" : "database";
}

async function supabasePut(cfg, key, buf, mimeType) {
  const put = () =>
    fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${key}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        apikey: cfg.key,
        "Content-Type": mimeType,
        "Cache-Control": "31536000",
        "x-upsert": "false"
      },
      body: buf
    });

  let r = await put();
  if (r.status === 404 || r.status === 400) {
    // Bucket may not exist yet: create it (public read) and retry once
    const body = await r.text();
    if (/bucket/i.test(body)) {
      await fetch(`${cfg.url}/storage/v1/bucket`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: BUCKET,
          name: BUCKET,
          public: true,
          file_size_limit: MAX_UPLOAD_BYTES,
          allowed_mime_types: ["image/jpeg", "image/png", "image/webp"]
        })
      });
      r = await put();
    }
  }
  if (!r.ok) throw new Error(`Supabase Storage upload failed (${r.status})`);
}

export async function saveImage(ownerId, buf) {
  const mimeType = sniffImageType(buf);
  if (!mimeType) {
    const err = new Error("Only JPEG, PNG or WebP images are allowed");
    err.status = 400;
    throw err;
  }
  const cfg = supabaseConfig();
  if (cfg) {
    const ext = mimeType.split("/")[1].replace("jpeg", "jpg");
    const key = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
    await supabasePut(cfg, key, buf, mimeType);
    return prisma.upload.create({ data: { ownerId, mimeType, size: buf.length, storageKey: key }, select: { id: true } });
  }
  return prisma.upload.create({ data: { ownerId, mimeType, size: buf.length, data: buf }, select: { id: true } });
}

export function uploadUrl(id) {
  return id ? `/api/uploads/${id}` : null;
}

export function publicStorageUrl(storageKey) {
  const cfg = supabaseConfig();
  const base = cfg?.url || (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${BUCKET}/${storageKey}`;
}

// Make sure every upload id belongs to this user (admins may use anyone's)
export async function assertOwnedUploads(user, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const rows = await prisma.upload.findMany({ where: { id: { in: unique } }, select: { id: true, ownerId: true } });
  if (rows.length !== unique.length) {
    const err = new Error("One of the images could not be found. Please upload it again.");
    err.status = 400;
    throw err;
  }
  if (!user.isAdmin && rows.some((r) => r.ownerId !== user.id)) {
    const err = new Error("You can only use images you uploaded");
    err.status = 403;
    throw err;
  }
  return unique;
}

// Remove images that were uploaded but never attached to a listing or ad
export async function deleteOrphanUploads(olderThanHours = 48) {
  const cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000);
  const orphans = await prisma.upload.findMany({
    where: { createdAt: { lt: cutoff }, productImages: { none: {} }, adBanners: { none: {} }, adLogos: { none: {} } },
    select: { id: true, storageKey: true },
    take: 500
  });
  const cfg = supabaseConfig();
  const keys = orphans.map((o) => o.storageKey).filter(Boolean);
  if (cfg && keys.length) {
    await fetch(`${cfg.url}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: keys })
    }).catch(() => {});
  }
  if (orphans.length) await prisma.upload.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
  return orphans.length;
}
