// File: src/services/mailer.service.js
// Pengiriman kode OTP via SMTP (nodemailer). Kredensial dari process.env, jangan commit.
// Sumber: docs/backend-auth-requirement.md §6

import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

function createTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // 465 = SSL langsung
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

const transporter = createTransporter();

function buildTemplate(code) {
  const text =
    `Kode verifikasi kamu: ${code}\n` +
    'Berlaku 10 menit. Jangan bagikan kode ini ke siapa pun.';

  const html =
    `<div style="font-family:Arial,sans-serif;font-size:15px;color:#333">` +
    `<p>Kode verifikasi kamu:</p>` +
    `<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>` +
    `<p>Berlaku <b>10 menit</b>. Jangan bagikan kode ini ke siapa pun.</p>` +
    `</div>`;

  return { text, html };
}

/**
 * Kirim kode OTP ke email user.
 * @returns {Promise<{sent: boolean}>} sent=false bila SMTP belum dikonfigurasi
 *          (kode tetap tercetak di console agar bisa dites di dev).
 */
export async function sendOtpEmail(email, code, purpose) {
  const subject =
    purpose === 'reset'
      ? 'Atur Ulang Kata Sandi — Terserah App'
      : 'Verifikasi Email — Terserah App';

  const { text, html } = buildTemplate(code);

  if (!transporter) {
    console.warn(
      `[mailer] SMTP belum dikonfigurasi. Kode OTP untuk ${email} (${purpose}): ${code}`
    );
    return { sent: false };
  }

  await transporter.sendMail({
    from: `"Terserah App" <${SMTP_USER}>`,
    to: email,
    subject,
    text,
    html,
  });

  return { sent: true };
}
