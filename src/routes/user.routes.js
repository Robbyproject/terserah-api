// File: src/routes/user.routes.js
// Kontrak API: docs/backend-auth-requirement.md
// Alur: Register + Verifikasi Email via OTP, Login (email/username),
//       Ganti Password (sudah login), Forgot/Reset Password via OTP.

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../lib/supabase.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { sendOtpEmail } from '../services/mailer.service.js';
import {
  createOtp,
  isResendOnCooldown,
  verifyOtp,
} from '../services/otp.service.js';
import {
  MESSAGES,
  validateEmail,
  validatePassword,
  validateUsername,
} from '../lib/validators.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'terserah_jwt_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // 7 hari (dev)

function signToken(user) {
  // Payload utama: { sub: user_id, email } (§8)
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

const userColumns = 'id, username, email, password, email_verified';

// ============================================================================
// 1. REGISTER + VERIFIKASI EMAIL VIA KODE OTP (§2.1)
// POST /api/users/register
// ============================================================================
router.post('/register', async (req, res) => {
  // username & email di-trim; password JANGAN di-trim (§1)
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const password = req.body.password;

  let errorM = validateUsername(username) || validateEmail(email) || validatePassword(password);
  if (errorM) return res.status(400).json({ message: errorM });

  try {
    // Cek unik username & email di Supabase (secara terpisah agar pesan akurat & aman)
    const [{ data: sameUsername }, { data: sameEmail }] = await Promise.all([
      supabase.from('users').select('id').eq('username', username).maybeSingle(),
      supabase.from('users').select('id').eq('email', email).maybeSingle(),
    ]);

    if (sameUsername) {
      return res.status(409).json({ message: MESSAGES.usernameTaken });
    }
    if (sameEmail) {
      return res.status(409).json({ message: MESSAGES.emailTaken });
    }

    // Hash password bcrypt cost >= 10
    const passwordHash = await bcrypt.hash(password, 10);

    // email_verified wajib false saat daftar
    const { data: userInserted, error: userError } = await supabase
      .from('users')
      .insert([
        {
          username,
          email,
          password: passwordHash,
          email_verified: false,
          provider: 'email',
        },
      ])
      .select('id, username, email')
      .single();

    let newUser = userInserted;

    if (userError) {
      // Fallback jika migration SQL (§7) belum dijalankan di Supabase
      if (userError.message?.includes('email_verified') || userError.message?.includes('provider')) {
        const { data: legacyUser, error: legacyError } = await supabase
          .from('users')
          .insert([{ username, email, password: passwordHash }])
          .select('id, username, email')
          .single();
        if (legacyError) throw legacyError;
        newUser = legacyUser;
      } else {
        throw userError;
      }
    }

    // Otomatis buatkan baris di tabel profile
    await supabase
      .from('profile')
      .insert([{ user_id: newUser.id, username: newUser.username, email: newUser.email }]);

    // Generate OTP 6 digit (disimpan sebagai hash) + kirim via SMTP
    const code = await createOtp(email, 'register');
    await sendOtpEmail(email, code, 'register');

    // JANGAN terbitkan JWT di sini — akun belum terverifikasi
    return res.status(202).json({
      message: MESSAGES.otpSent,
      email,
    });
  } catch (error) {
    console.error('[register]', error);
    return res.status(500).json({ message: MESSAGES.serverError });
  }
});

// ============================================================================
// 2. VERIFIKASI KODE OTP (§2.2)
// POST /api/users/verify-otp
// ============================================================================
router.post('/verify-otp', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
  const purpose = req.body.purpose || 'register';

  if (!email || !code) {
    return res.status(400).json({ message: MESSAGES.required });
  }

  try {
    const result = await verifyOtp(email, purpose, code);

    if (result === 'tooMany') {
      return res.status(429).json({ message: MESSAGES.otpTooMany });
    }
    if (result !== 'ok') {
      return res.status(400).json({ message: MESSAGES.otpInvalid });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select(userColumns)
      .eq('email', email)
      .maybeSingle();

    if (!user) {
      return res.status(400).json({ message: MESSAGES.otpInvalid });
    }

    // Tandai email terverifikasi
    const { error: updateError } = await supabase
      .from('users')
      .update({ email_verified: true })
      .eq('id', user.id);
    if (updateError) throw updateError;

    // Terbitkan JWT (bentuk sama seperti login) supaya FE langsung auto-login
    const token = signToken(user);
    return res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    console.error('[verify-otp]', error);
    return res.status(500).json({ message: MESSAGES.serverError });
  }
});

// ============================================================================
// 3. KIRIM ULANG KODE OTP (§2.3)
// POST /api/users/resend-otp
// ============================================================================
router.post('/resend-otp', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const purpose = req.body.purpose === 'reset' ? 'reset' : 'register';

  if (!email) {
    return res.status(400).json({ message: MESSAGES.required });
  }

  try {
    // Cooldown 60 detik antar pengiriman
    if (await isResendOnCooldown(email, purpose)) {
      return res.status(429).json({ message: MESSAGES.resendCooldown });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, email_verified')
      .eq('email', email)
      .maybeSingle();

    // Validasi kondisi akun; jangan bocorkan keberadaan email (§9):
    // - register + belum ada user  -> tetap 200 generik (tidak kirim email)
    // - reset + belum ada user     -> tetap 200 generik (tidak kirim email)
    if (!user) {
      return res.json({ message: MESSAGES.otpResent });
    }

    // register: akun sudah terverifikasi -> tolak
    if (purpose === 'register' && user.email_verified === true) {
      return res.status(400).json({ message: MESSAGES.alreadyVerified });
    }

    const code = await createOtp(email, purpose);
    await sendOtpEmail(email, code, purpose);

    return res.json({ message: MESSAGES.otpResent });
  } catch (error) {
    console.error('[resend-otp]', error);
    return res.status(500).json({ message: MESSAGES.serverError });
  }
});

// ============================================================================
// 4. LOGIN (email ATAU username) + BLOKIR AKUN BELUM VERIFIKASI (§3.1)
// POST /api/users/login
// ============================================================================
router.post('/login', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const password = req.body.password;

  if (!email || !password) {
    return res.status(400).json({ message: MESSAGES.required });
  }

  try {
    const input = email;

    // Cari user berdasarkan email ATAU username
    const [{ data: byEmail }, { data: byUsername }] = await Promise.all([
      supabase.from('users').select(userColumns).eq('email', input).maybeSingle(),
      supabase.from('users').select(userColumns).eq('username', input).maybeSingle(),
    ]);
    const user = byEmail || byUsername;

    if (!user) {
      return res.status(400).json({ message: MESSAGES.loginBadCreds });
    }

    // Verifikasi password (mendukung hash bcrypt atau data lama teks polos)
    const isMatch = user.password.startsWith('$2')
      ? await bcrypt.compare(password, user.password)
      : user.password === password;

    if (!isMatch) {
      return res.status(400).json({ message: MESSAGES.loginBadCreds });
    }

    // Kasus BARU: kredensial benar tapi email belum diverifikasi
    if (user.email_verified === false) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        message: MESSAGES.emailNotVerified,
      });
    }

    const token = signToken(user);
    return res.json({
      message: 'Login berhasil',
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    console.error('[login]', error);
    return res.status(500).json({ message: MESSAGES.serverError });
  }
});

// ============================================================================
// 5. GANTI PASSWORD SAAT SUDAH LOGIN (§4.1)
// PUT /api/users/change-password/:userId  (Auth: Bearer, milik :userId sendiri)
// ============================================================================
router.put('/change-password/:userId', verifyToken, async (req, res) => {
  const { userId } = req.params;
  const { oldPassword, newPassword } = req.body;

  if (req.user.id !== userId) {
    return res.status(401).json({ message: 'Akses ditolak, token tidak valid untuk pengguna ini' });
  }
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: MESSAGES.required });
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, password')
      .eq('id', userId)
      .single();

    if (!user) {
      return res.status(404).json({ message: 'Pengguna tidak ditemukan' });
    }

    // oldPassword harus cocok dengan hash bcrypt di DB
    const isOldMatch = user.password.startsWith('$2')
      ? await bcrypt.compare(oldPassword, user.password)
      : user.password === oldPassword;

    if (!isOldMatch) {
      return res.status(401).json({ message: MESSAGES.oldPasswordWrong });
    }

    const newHashedPassword = await bcrypt.hash(newPassword, 10);
    const { error: updateError } = await supabase
      .from('users')
      .update({ password: newHashedPassword })
      .eq('id', userId);
    if (updateError) throw updateError;

    return res.json({ message: MESSAGES.passwordChanged });
  } catch (error) {
    console.error('[change-password]', error);
    return res.status(500).json({ message: MESSAGES.serverError });
  }
});

// ============================================================================
// 6. LUPA PASSWORD (§4.2) — respons selalu generik, tanpa membocorkan email
// POST /api/users/forgot-password
// ============================================================================
router.post('/forgot-password', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';

  if (!email) {
    return res.status(400).json({ message: MESSAGES.required });
  }

  try {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    // Email TIDAK terdaftar -> tetap 200, jangan kirim email (§4.2)
    if (user) {
      const code = await createOtp(email, 'reset');
      await sendOtpEmail(email, code, 'reset');
    }

    return res.json({ message: MESSAGES.forgotPasswordGeneric });
  } catch (error) {
    console.error('[forgot-password]', error);
    return res.status(500).json({ message: MESSAGES.serverError });
  }
});

// ============================================================================
// 7. RESET PASSWORD VIA OTP (§4.2) — menggantikan PUT /users/reset-password lama
// POST /api/users/reset-password
// ============================================================================
router.post('/reset-password', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
  const newPassword = req.body.newPassword;

  if (!email || !code || !newPassword) {
    return res.status(400).json({ message: MESSAGES.required });
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    const result = await verifyOtp(email, 'reset', code);

    if (result === 'tooMany') {
      return res.status(429).json({ message: MESSAGES.otpTooMany });
    }
    if (result !== 'ok') {
      return res.status(400).json({ message: MESSAGES.otpInvalid });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const { error: updateError } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('email', email);
    if (updateError) throw updateError;

    return res.json({ message: MESSAGES.resetPasswordSuccess });
  } catch (error) {
    console.error('[reset-password]', error);
    return res.status(500).json({ message: MESSAGES.serverError });
  }
});

export default router;
