// File: src/routes/user.routes.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../lib/supabase.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'terserah_jwt_secret_key_2026';

// 1. REGISTER USER BARU (Dengan Enkripsi Bcrypt & Token JWT)
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Semua kolom wajib diisi' });
  }

  try {
    // Cek apakah username atau email sudah terdaftar sebelumnya
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${email.trim()},username.eq.${username.trim()}`)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ message: 'Username atau Email sudah terdaftar' });
    }

    // Hash kata sandi dengan bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Simpan ke tabel users
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert([{ username: username.trim(), email: email.trim(), password: hashedPassword }])
      .select('id, username, email')
      .single();

    if (userError) throw userError;

    // Otomatis buatkan baris di tabel profile
    const { error: profileError } = await supabase
      .from('profile')
      .insert([{ user_id: newUser.id, username: newUser.username, email: newUser.email }]);

    if (profileError) throw profileError;

    // Buat token JWT (berlaku 30 hari)
    const token = jwt.sign(
      { id: newUser.id, username: newUser.username, email: newUser.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      message: 'Registrasi berhasil',
      token,
      user: newUser,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 2. LOGIN USER (Mendukung Login via Email atau Username + Verifikasi Bcrypt)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email/Username dan kata sandi wajib diisi' });
  }

  const input = email.trim();

  try {
    // Cari user berdasarkan email atau username
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, email, password')
      .or(`email.eq.${input},username.eq.${input}`)
      .maybeSingle();

    if (error || !user) {
      return res.status(401).json({ message: 'Email/Username atau kata sandi salah' });
    }

    // Verifikasi password (mendukung hash bcrypt atau data lama teks polos)
    const isMatch = user.password.startsWith('$2')
      ? await bcrypt.compare(password, user.password)
      : user.password === password;

    if (!isMatch) {
      return res.status(401).json({ message: 'Email/Username atau kata sandi salah' });
    }

    // Terbitkan token JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Login berhasil',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 3. UBAH KATA SANDI AKUN (Dari Profil: Verifikasi Password Lama & Hash Password Baru)
router.put('/change-password/:userId', async (req, res) => {
  const { userId } = req.params;
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: 'Kata sandi lama dan baru wajib diisi' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Kata sandi baru minimal 6 karakter' });
  }

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, password')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ message: 'Pengguna tidak ditemukan' });
    }

    // Verifikasi kata sandi lama
    const isOldMatch = user.password.startsWith('$2')
      ? await bcrypt.compare(oldPassword, user.password)
      : user.password === oldPassword;

    if (!isOldMatch) {
      return res.status(400).json({ message: 'Kata sandi saat ini tidak sesuai' });
    }

    // Hash kata sandi baru
    const salt = await bcrypt.genSalt(10);
    const newHashedPassword = await bcrypt.hash(newPassword, salt);

    // Update ke database
    const { error: updateError } = await supabase
      .from('users')
      .update({ password: newHashedPassword })
      .eq('id', userId);

    if (updateError) throw updateError;

    res.json({ message: 'Kata sandi berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 4. RESET KATA SANDI (Sebelum Login / Lupa Kata Sandi Menggunakan Email)
router.put('/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ message: 'Email dan kata sandi baru wajib diisi' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Kata sandi baru minimal 6 karakter' });
  }

  const input = email.trim().toLowerCase();

  try {
    // Cari user berdasarkan email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', input)
      .maybeSingle();

    if (userError || !user) {
      return res.status(404).json({ message: 'Akun dengan email tersebut tidak ditemukan' });
    }

    // Hash kata sandi baru
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update kata sandi baru ke database
    const { error: updateError } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', user.id);

    if (updateError) throw updateError;

    res.json({ message: 'Kata sandi berhasil direset. Silakan masuk kembali.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;