import nodemailer from "nodemailer";

function hasSmtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!hasSmtpConfigured()) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

function baseUrl() {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function computeFrom() {
  const user = process.env.SMTP_USER || "";
  const fromEnv = process.env.SMTP_FROM || "";
  if (!fromEnv) return user ? `GamePro <${user}>` : "GamePro <no-reply@gamepro.local>";
  // Gmail often rejects arbitrary "From" domains; default back to the authenticated mailbox.
  if (fromEnv.includes("@gamepro.local") && user) return `GamePro <${user}>`;
  return fromEnv;
}

export async function sendPasswordResetEmail({ to, resetLink }) {
  const transporter = getTransporter();
  if (!transporter) return { ok: false, skipped: true, reason: "SMTP not configured" };

  const from = computeFrom();
  const fullLink = `${baseUrl()}${resetLink}`;
  const subject = "Reset your GamePro password";
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color:#111;">
      <h2 style="margin:0 0 12px 0;">Reset your GamePro password</h2>
      <p style="margin:0 0 10px 0;">
        Click the button below to reset your password. This link expires in <b>30 minutes</b>.
      </p>
      <p style="margin:16px 0;">
        <a href="${fullLink}" style="background:#6c3fc5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Reset Password</a>
      </p>
      <p style="margin:16px 0 0 0;font-size:0.9em;color:#555;">
        If you didn't request this, you can safely ignore this email.<br/>
        Or copy this link: <a href="${fullLink}">${fullLink}</a>
      </p>
    </div>
  `.trim();

  try {
    await transporter.verify();
  } catch (e) {
    return { ok: false, error: "SMTP verify failed", details: e?.message || String(e) };
  }

  try {
    const info = await transporter.sendMail({ from, to, subject, html });
    return { ok: true, messageId: info?.messageId };
  } catch (e) {
    return { ok: false, error: "Email send failed", details: e?.message || String(e) };
  }
}

export async function sendBookingStatusEmail({ to, booking, gameTitle }) {
  const transporter = getTransporter();
  if (!transporter) return { ok: false, skipped: true, reason: "SMTP not configured" };

  const from = computeFrom();
  const status = booking.status;
  const when = new Date(booking.date).toLocaleString();

  const subject =
    status === "CONFIRMED"
      ? `Your booking is confirmed — ${gameTitle}`
      : status === "CANCELLED"
        ? `Your booking was cancelled — ${gameTitle}`
        : `Booking update — ${gameTitle}`;

  const headline =
    status === "CONFIRMED"
      ? "Confirmed"
      : status === "CANCELLED"
        ? "Cancelled"
        : "Updated";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color:#111;">
      <h2 style="margin:0 0 12px 0;">${headline}: GamePro booking</h2>
      <p style="margin:0 0 10px 0;">
        <b>Game/Room:</b> ${gameTitle}<br/>
        <b>Date & time:</b> ${when}<br/>
        <b>Status:</b> ${status}
      </p>
      <p style="margin:16px 0 0 0;">
        Manage or book another session at <a href="${baseUrl()}">${baseUrl()}</a>.
      </p>
    </div>
  `.trim();

  try {
    await transporter.verify();
  } catch (e) {
    return { ok: false, error: "SMTP verify failed", details: e?.message || String(e) };
  }

  try {
    const info = await transporter.sendMail({ from, to, subject, html });
    return { ok: true, messageId: info?.messageId };
  } catch (e) {
    return { ok: false, error: "Email send failed", details: e?.message || String(e) };
  }
}

