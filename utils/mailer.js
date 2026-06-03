const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.log("[mailer] SMTP not configured. Set SMTP_HOST SMTP_USER SMTP_PASS env vars.");
    console.log("[mailer] Verification codes will be shown on page instead.");
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

async function sendCode(to, code) {
  const t = getTransporter();

  if (!t) {
    console.log(`[mailer] VERIFICATION CODE for ${to}: ${code}`);
    return { sent: true, devCode: code };
  }

  try {
    await t.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject: "API 中转站 — 邮箱验证码",
      html: `<div style="max-width:400px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;background:#f8f9fa;border-radius:12px">
        <h2 style="color:#0891b2;margin:0 0 16px">API 中转站</h2>
        <p style="color:#333;font-size:14px;margin:0 0 8px">你的邮箱验证码是：</p>
        <div style="background:#fff;border:2px dashed #0891b2;border-radius:8px;padding:16px;text-align:center;margin:12px 0">
          <span style="font-size:28px;font-weight:bold;color:#0891b2;letter-spacing:6px">${code}</span>
        </div>
        <p style="color:#999;font-size:12px;margin:0">有效期 5 分钟，请勿泄露给他人。</p>
      </div>`,
    });
    console.log(`[mailer] Code sent to ${to}`);
    return { sent: true };
  } catch (e) {
    console.error(`[mailer] Failed to send to ${to}:`, e.message);
    return { sent: false };
  }
}

module.exports = { sendCode };
