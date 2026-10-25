// File: src/services/mailer.service.js
// Pengiriman kode OTP.
//
// Render (instance gratis) memblokir koneksi keluar ke port SMTP 25/465/587,
// jadi produksi memakai API HTTPS. SMTP tetap dipakai untuk pengembangan lokal.
//
// EMAIL_PROVIDER = 'brevo' | 'resend' | 'smtp' (opsional; kalau kosong dipilih
// otomatis: brevo -> resend -> smtp, tergantung kredensial yang tersedia).

import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER;
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Terserah App';
const HTTP_TIMEOUT_MS = 15_000;

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const RESEND_URL = 'https://api.resend.com/emails';

function resolveProvider() {
  const explicit = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  if (explicit) return explicit;
  if (BREVO_API_KEY) return 'brevo';
  if (RESEND_API_KEY) return 'resend';
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) return 'smtp';
  return null;
}

function createTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Tanpa batas ini, koneksi ke port yang diblokir menggantung 120 detik.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

const provider = resolveProvider();
const transporter = provider === 'smtp' ? createTransporter() : null;

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

async function postJson(url, init, label) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${label} ${res.status}: ${body.slice(0, 300)}`);
  }

  return res.json().catch(() => ({}));
}

async function sendViaBrevo({ to, subject, text, html }) {
  if (!BREVO_API_KEY) throw new Error('BREVO_API_KEY belum diset.');
  if (!EMAIL_FROM) throw new Error('EMAIL_FROM belum diset (pengirim harus diverifikasi di Brevo).');

  return postJson(
    BREVO_URL,
    {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: EMAIL_FROM, name: EMAIL_FROM_NAME },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    },
    'Brevo'
  );
}

async function sendViaResend({ to, subject, text, html }) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY belum diset.');
  if (!EMAIL_FROM) throw new Error('EMAIL_FROM belum diset.');

  return postJson(
    RESEND_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
        to,
        subject,
        html,
        text,
      }),
    },
    'Resend'
  );
}

async function sendViaSmtp({ to, subject, text, html }) {
  if (!transporter) throw new Error('SMTP belum dikonfigurasi.');

  await transporter.sendMail({
    from: `"${EMAIL_FROM_NAME}" <${EMAIL_FROM}>`,
    to,
    subject,
    text,
    html,
  });
}

/**
 * Kirim kode OTP ke email user.
 * @returns {Promise<{sent: boolean}>} sent=false hanya bila tidak ada provider
 *          sama sekali (kode dicetak ke console agar dev tetap bisa jalan).
 */
export async function sendOtpEmail(email, code, purpose) {
  const subject =
    purpose === 'reset'
      ? 'Atur Ulang Kata Sandi — Terserah App'
      : 'Verifikasi Email — Terserah App';

  const { text, html } = buildTemplate(code);
  const message = { to: email, subject, text, html };

  if (provider === 'brevo') {
    await sendViaBrevo(message);
    return { sent: true };
  }

  if (provider === 'resend') {
    await sendViaResend(message);
    return { sent: true };
  }

  if (provider === 'smtp') {
    await sendViaSmtp(message);
    return { sent: true };
  }

  console.warn(
    `[mailer] Tidak ada provider email (EMAIL_PROVIDER/BREVO_API_KEY/RESEND_API_KEY/SMTP). ` +
      `Kode OTP untuk ${email} (${purpose}): ${code}`
  );
  return { sent: false };
}
