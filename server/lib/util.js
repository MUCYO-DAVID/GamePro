import crypto from "crypto";
import { z } from "zod";
import { prisma } from "./db.js";
import { sendNotificationEmail } from "../mailer.js";

// ── Request helpers ────────────────────────────────────────────

export function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  const first = (Array.isArray(xf) ? xf[0] : xf || "").split(",")[0].trim();
  return first || req.socket?.remoteAddress || "";
}

// Anonymous, non-reversible visitor id (IP + browser), used to de-duplicate views/clicks
// and to rate-limit guest actions. Never stored alongside the raw IP.
export function visitorHash(req) {
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "gamepro")
    .update(`${clientIp(req)}|${req.headers["user-agent"] || ""}`)
    .digest("base64url")
    .slice(0, 32);
}

export function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function isUniqueViolation(e) {
  return e?.code === "P2002";
}

// ── Validation helpers ─────────────────────────────────────────

// Strip control characters and trim. Output is always rendered as text (never HTML) by the frontend.
export function cleanText(s) {
  return String(s ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

export const text = (min, max) =>
  z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(min, `Must be at least ${min} characters`).max(max, `Must be at most ${max} characters`));

export const optionalText = (max) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v == null ? null : cleanText(v) || null))
    .pipe(z.string().max(max).nullable());

export const phone = z
  .string()
  .transform(cleanText)
  .pipe(z.string().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number"));

export const optionalEmail = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? cleanText(v).toLowerCase() : null))
  .pipe(z.string().email("Enter a valid email").nullable());

// Only http(s) links are allowed anywhere users can supply a URL
export function safeHttpUrl(value) {
  try {
    const u = new URL(String(value).trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export const optionalUrl = z
  .string()
  .optional()
  .nullable()
  .transform((v, ctx) => {
    const raw = cleanText(v || "");
    if (!raw) return null;
    const url = safeHttpUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!url) {
      ctx.addIssue({ code: "custom", message: "Enter a valid website link" });
      return z.NEVER;
    }
    return url.slice(0, 500);
  });

// Schema for PATCH requests: every field optional and NO defaults.
// (zod's .partial() keeps .default() values, which would silently overwrite fields the caller didn't send.)
export function patchSchema(objectSchema) {
  const shape = {};
  for (const [key, field] of Object.entries(objectSchema.shape)) {
    let inner = field;
    while (inner?.def?.type === "default" || inner?.def?.type === "optional") inner = inner.unwrap();
    shape[key] = inner.optional();
  }
  return z.object(shape);
}

// Parse a PATCH body: validates only the fields that were sent, and returns only those fields.
export function parsePatch(objectSchema, req, res) {
  const data = parseBody(patchSchema(objectSchema), req, res);
  if (!data) return null;
  const sent = req.body && typeof req.body === "object" ? req.body : {};
  for (const key of Object.keys(data)) if (!(key in sent)) delete data[key];
  return data;
}

export function firstError(zodError) {
  const issue = zodError?.issues?.[0];
  if (!issue) return "Invalid input";
  const field = issue.path?.join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
}

// Parse body with a zod schema; on failure send a 400 and return null.
export function parseBody(schema, req, res) {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: firstError(parsed.error), details: parsed.error.flatten?.() });
    return null;
  }
  return parsed.data;
}

// ── Audit log & notifications ──────────────────────────────────

export async function audit(actorId, action, entityType, entityId, details) {
  try {
    await prisma.auditLog.create({
      data: { actorId: actorId || null, action, entityType, entityId: entityId || null, details: details ?? undefined }
    });
  } catch (e) {
    console.error("[AUDIT] failed to record", action, e?.message);
  }
}

// In-app notification, optionally also emailed. Never throws: notifications must not break the main action.
export async function notify(userId, { type, title, body, link }, { email = false, emailTo } = {}) {
  if (!userId) return;
  try {
    await prisma.notification.create({ data: { userId, type, title, body, link: link || null } });
    if (email) {
      const to = emailTo || (await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email;
      if (to) {
        const r = await sendNotificationEmail({ to, subject: `GamePro: ${title}`, heading: title, lines: [body], link, linkLabel: "View on GamePro" });
        if (!r.ok && !r.skipped) console.error("[EMAIL] notification failed:", r.details || r.error);
      }
    }
  } catch (e) {
    console.error("[NOTIFY] failed", type, e?.message);
  }
}

export async function notifyAdmins(payload, opts) {
  const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
  await Promise.all(admins.map((a) => notify(a.id, payload, opts)));
}

export function formatMoney(amount, currency = "RWF") {
  return `${Number(amount || 0).toLocaleString("en-US")} ${currency}`;
}
