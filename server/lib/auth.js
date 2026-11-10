import crypto from "crypto";
import { prisma } from "./db.js";

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required");
  return secret;
}

function signSession(payload) {
  const secret = getSessionSecret();
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token) {
  if (!token) return null;
  const secret = getSessionSecret();
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function setSessionCookie(res, payload) {
  res.cookie("gp_session", signSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 7
  });
}

export function clearSessionCookie(res) {
  res.clearCookie("gp_session", { path: "/" });
}

export async function getAuthUser(req) {
  const token = req.cookies?.gp_session;
  if (!token) return null;
  const session = verifySession(token);
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return null;
  return { user, session };
}

// Signed-in user (and 2FA completed when enabled), or null. Never throws for anonymous visitors.
export async function getVerifiedUser(req) {
  const auth = await getAuthUser(req);
  if (!auth) return null;
  if (auth.user.twoFactorOn && !auth.session?.twoFactorOk) return null;
  return auth.user;
}

export function requireAuth(req, res, next) {
  getAuthUser(req)
    .then((auth) => {
      if (!auth) return res.status(401).json({ error: "Unauthorized" });
      if (auth.user.twoFactorOn && !auth.session?.twoFactorOk) {
        return res.status(403).json({ error: "Two-factor required" });
      }
      req.auth = auth;
      next();
    })
    .catch(next);
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.auth?.user?.isAdmin) return res.status(403).json({ error: "Admin only" });
    next();
  });
}
