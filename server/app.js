import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import speakeasy from "speakeasy";
import qrcode from "qrcode";
import { sendBookingStatusEmail, sendPasswordResetEmail } from "./mailer.js";
import { prisma } from "./lib/db.js";
import {
  verifySession,
  setSessionCookie,
  clearSessionCookie,
  getAuthUser,
  requireAuth,
  requireAdmin
} from "./lib/auth.js";
import uploadsRouter from "./routes/uploads.js";
import marketplaceRouter from "./routes/marketplace.js";
import adsRouter from "./routes/ads.js";
import adminMarketplaceRouter from "./routes/admin-marketplace.js";
import adminAdsRouter from "./routes/admin-ads.js";
import notificationsRouter from "./routes/notifications.js";
import cronRouter from "./routes/cron.js";

const app = express();

app.use(cookieParser());
// Image uploads read the raw body, so they are mounted before the JSON parser
app.use(uploadsRouter);
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: true }));

// Block direct static access to admin.html — all admin requests must go through the /admin route
app.get("/admin.html", (_req, res) => res.redirect(301, "/admin"));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
// admin.html lives outside public/ so it can only be reached through the guarded /admin route
const adminPage = path.join(__dirname, "views", "admin.html");

app.use(express.static(publicDir));

// Reports whether the database is reachable. Only shows Prisma's error code, never connection details.
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: "ok" });
  } catch (e) {
    console.error("[HEALTH] Database check failed:", e);
    const msg = String(e?.message || "");
    const hint = /Authentication failed|password authentication/i.test(msg)
      ? "wrong database password"
      : /Can't reach database|ENOTFOUND|tenant or user not found/i.test(msg)
        ? "wrong database host/user"
        : /environment variable not found|must start with the protocol/i.test(msg)
          ? "DATABASE_URL missing or badly formatted"
          : "unknown";
    res.status(503).json({ ok: false, db: "error", code: e?.errorCode || e?.code || null, hint });
  }
});

function requireLoginToBookEnabled() {
  return String(process.env.REQUIRE_LOGIN_TO_BOOK || "false").toLowerCase() === "true";
}

app.get("/api/games", async (_req, res) => {
  const games = await prisma.game.findMany({ orderBy: { title: "asc" } });
  res.json(games);
});

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().max(100).optional().or(z.literal(""))
});

app.post("/api/auth/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const email = parsed.data.email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  try {
    const user = await prisma.user.create({
      data: { email, name: parsed.data.name || null, passwordHash }
    });

    setSessionCookie(res, { userId: user.id, twoFactorOk: !user.twoFactorOn });
    res.status(201).json({ ok: true });
  } catch (e) {
    return res.status(409).json({ error: "Email already in use" });
  }
});

const signinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

app.post("/api/auth/signin", async (req, res) => {
  const parsed = signinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  setSessionCookie(res, { userId: user.id, twoFactorOk: !user.twoFactorOn });
  res.json({ ok: true, requiresTwoFactor: user.twoFactorOn });
});

app.post("/api/auth/signout", async (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  const auth = await getAuthUser(req);
  if (!auth) return res.status(401).json({ user: null });
  const { user, session } = auth;
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      twoFactorOn: user.twoFactorOn,
      isAdmin: user.isAdmin
    },
    twoFactorOk: !!session?.twoFactorOk
  });
});

// 2FA: setup (returns QR data URL) + enable + verify at login
app.post("/api/2fa/setup", requireAuth, async (req, res) => {
  const { user } = req.auth;
  if (user.twoFactorOn && user.twoFactorKey) {
    return res.status(400).json({ error: "2FA already enabled" });
  }

  const secret = speakeasy.generateSecret({
    name: `GamePro (${user.email})`
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorKey: secret.base32, twoFactorOn: false }
  });

  const otpauth = secret.otpauth_url;
  const qr = await qrcode.toDataURL(otpauth);
  res.json({ ok: true, qr, manualKey: secret.base32 });
});

const twoFaVerifySchema = z.object({ token: z.string().min(6).max(12) });

app.post("/api/2fa/enable", requireAuth, async (req, res) => {
  const parsed = twoFaVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid token" });
  const { user } = req.auth;
  if (!user.twoFactorKey) return res.status(400).json({ error: "2FA not setup yet" });

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorKey,
    encoding: "base32",
    token: parsed.data.token,
    window: 1
  });
  if (!verified) return res.status(400).json({ error: "Invalid code" });

  await prisma.user.update({ where: { id: user.id }, data: { twoFactorOn: true } });
  setSessionCookie(res, { userId: user.id, twoFactorOk: true });
  res.json({ ok: true });
});

app.post("/api/2fa/verify", async (req, res) => {
  // For login flow: user is signed in but twoFactorOk=false
  const token = req.cookies?.gp_session;
  const session = verifySession(token);
  if (!session?.userId) return res.status(401).json({ error: "Unauthorized" });

  const parsed = twoFaVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid token" });

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.twoFactorOn || !user.twoFactorKey) {
    return res.status(400).json({ error: "2FA not enabled" });
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorKey,
    encoding: "base32",
    token: parsed.data.token,
    window: 1
  });
  if (!verified) return res.status(400).json({ error: "Invalid code" });

  setSessionCookie(res, { userId: user.id, twoFactorOk: true });
  res.json({ ok: true });
});

// Forgot password: returns resetLink for local dev (hook up email later)
const forgotPasswordSchema = z.object({ email: z.string().email() });

app.post("/api/auth/forgot-password", async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: true });

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  // Always return ok to avoid user enumeration
  if (!user) return res.json({ ok: true });

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt
    }
  });

  const resetLink = `/reset-password?token=${encodeURIComponent(rawToken)}`;

  const emailResult = await sendPasswordResetEmail({ to: email, resetLink });
  const emailSent = emailResult.ok === true;

  // If SMTP is not configured, return the link in the response so developers can still test the flow
  res.json({ ok: true, emailSent, resetLink: emailSent ? undefined : resetLink });
});

const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200)
});

app.post("/api/auth/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const tokenHash = crypto.createHash("sha256").update(parsed.data.token).digest("base64url");

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });
  if (!record) return res.status(400).json({ error: "Invalid or expired token" });
  if (record.usedAt) return res.status(400).json({ error: "Token already used" });
  if (record.expiresAt.getTime() < Date.now()) return res.status(400).json({ error: "Token expired" });

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })
  ]);

  // sign-in the user (2FA will still be required if enabled)
  setSessionCookie(res, { userId: record.userId, twoFactorOk: !record.user.twoFactorOn });
  res.json({ ok: true, requiresTwoFactor: record.user.twoFactorOn });
});

const createBookingSchema = z.object({
  gameSlug: z.string().min(1),
  name: z.string().min(2).max(100),
  phone: z.string().min(6).max(30),
  email: z.string().email().optional().or(z.literal("")),
  date: z.string().min(1),
  notes: z.string().max(500).optional().or(z.literal(""))
});

app.post("/api/bookings", async (req, res) => {
  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }

  const { gameSlug, name, phone, email, date, notes } = parsed.data;
  const auth = await getAuthUser(req);
  if (requireLoginToBookEnabled() && !auth) {
    return res.status(401).json({ error: "Please sign in to book" });
  }
  if (auth?.user?.twoFactorOn && !auth.session?.twoFactorOk) {
    return res.status(403).json({ error: "Two-factor required" });
  }

  const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
  if (!game) return res.status(404).json({ error: "Game not found" });

  const bookingDate = new Date(date);
  if (Number.isNaN(bookingDate.getTime())) return res.status(400).json({ error: "Invalid date" });

  const bookingEmail = email || auth?.user?.email || null;

  const booking = await prisma.booking.create({
    data: {
      gameId: game.id,
      userId: auth?.user?.id || null,
      name,
      phone,
      email: bookingEmail,
      date: bookingDate,
      notes: notes || null
    },
    include: { game: true }
  });

  res.status(201).json(booking);
});

// Admin bookings dashboard APIs
app.get("/api/admin/bookings", requireAdmin, async (_req, res) => {
  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      game: true,
      user: { select: { id: true, email: true, name: true } }
    }
  });
  res.json(bookings);
});

const updateBookingStatusSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED"])
});

app.patch("/api/admin/bookings/:id", requireAdmin, async (req, res) => {
  const parsed = updateBookingStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid status" });

  const updated = await prisma.booking.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status },
    include: { game: true, user: { select: { id: true, email: true, name: true } } }
  });

  // Notify customer by email (if we have an address and SMTP is configured)
  const to = updated.email || updated.user?.email || null;
  console.log("[EMAIL] Booking status updated to", parsed.data.status, "| recipient:", to);
  console.log("[EMAIL] SMTP config check — host:", process.env.SMTP_HOST, "user:", process.env.SMTP_USER, "pass set:", !!process.env.SMTP_PASS);

  let emailResult = { attempted: false };
  if (to) {
    try {
      emailResult = {
        attempted: true,
        to,
        ...(await sendBookingStatusEmail({
          to,
          booking: updated,
          gameTitle: updated.game?.title || "GamePro"
        }))
      };
      console.log("[EMAIL] Result:", JSON.stringify(emailResult));
    } catch (emailErr) {
      console.error("[EMAIL] Unexpected error:", emailErr);
      emailResult = { attempted: true, ok: false, error: "Unexpected error", details: emailErr?.message || String(emailErr) };
    }
    if (!emailResult.ok && !emailResult.skipped) {
      console.error("[EMAIL] Send failed:", emailResult.details || emailResult.error);
    }
  } else {
    console.log("[EMAIL] Skipped — no recipient email on this booking");
    emailResult = { attempted: false, skipped: true, reason: "No recipient email on booking" };
  }

  res.json({ ...updated, emailResult });
});

// Marketplace, advertising, notifications, scheduled jobs
app.use(marketplaceRouter);
app.use(adsRouter);
app.use(adminMarketplaceRouter);
app.use(adminAdsRouter);
app.use(notificationsRouter);
app.use(cronRouter);

// Simple routes to match your deployed URLs
app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
app.get("/games", (_req, res) => res.sendFile(path.join(publicDir, "games.html")));
app.get("/booking", (_req, res) => res.sendFile(path.join(publicDir, "booking.html")));
app.get("/signup", (_req, res) => res.sendFile(path.join(publicDir, "signup.html")));
app.get("/signin", (_req, res) => res.sendFile(path.join(publicDir, "signin.html")));
app.get("/2fa", (_req, res) => res.sendFile(path.join(publicDir, "twofa.html")));
app.get("/forgot-password", (_req, res) => res.sendFile(path.join(publicDir, "forgot-password.html")));
app.get("/reset-password", (_req, res) => res.sendFile(path.join(publicDir, "reset-password.html")));
app.get("/admin", async (req, res) => {
  const auth = await getAuthUser(req);
  if (!auth?.user?.isAdmin) return res.redirect("/signin");
  res.sendFile(adminPage);
});
app.get("/marketplace", (_req, res) => res.sendFile(path.join(publicDir, "marketplace.html")));
app.get("/marketplace/:id", (_req, res) => res.sendFile(path.join(publicDir, "product.html")));
app.get("/sell", (_req, res) => res.sendFile(path.join(publicDir, "sell.html")));
app.get("/advertise", (_req, res) => res.sendFile(path.join(publicDir, "advertise.html")));
app.get("/notifications", (_req, res) => res.sendFile(path.join(publicDir, "notifications.html")));

// Unknown API routes → JSON 404 (pages fall through to the default 404)
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// Last-resort error handler: log details server-side, never leak them to the browser
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "That file or request is too large" });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid request body" });
  console.error("[ERROR]", req.method, req.originalUrl, err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

export default app;

