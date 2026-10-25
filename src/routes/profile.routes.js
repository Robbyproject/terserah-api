// File: src/routes/profile.routes.js
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { MESSAGES, validateEmail } from '../lib/validators.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('profile').select('*');
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 1. Ambil data profil berdasarkan user_id (GET /api/profile/:userId)
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { data, error } = await supabase
      .from('profile')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    // Format selaras dengan tipe data User di React Native
    res.json({
      id: data.user_id,
      name: data.username,
      email: data.email,
      avatarUrl: data.profile_image,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 2. Perbarui profil / edit nama & email (PUT /api/profile/:userId)
// Auth: Bearer token milik :userId sendiri (§5) + validasi §1 (email format & unik)
router.put('/:userId', verifyToken, async (req, res) => {
  const { userId } = req.params;
  const { name, email, avatarUrl } = req.body;

  if (req.user.id !== userId) {
    return res.status(401).json({ message: 'Akses ditolak, token tidak valid untuk pengguna ini' });
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Nama tidak boleh kosong.' });
  }

  const emailError = validateEmail(typeof email === 'string' ? email.trim() : email);
  if (emailError) {
    return res.status(400).json({ message: emailError });
  }

  try {
    // Cek email unik (di tabel users, kecuali milik sendiri)
    const { data: sameEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.trim())
      .neq('id', userId)
      .maybeSingle();

    if (sameEmail) {
      return res.status(409).json({ message: MESSAGES.emailTaken });
    }

    const { data, error } = await supabase
      .from('profile')
      .update({
        username: name.trim(),
        email: email.trim(),
        profile_image: avatarUrl,
      })
      .eq('user_id', userId)
      .select()
      .single();

    // Sekalian sinkron ke tabel users (dipakai login & cek unik)
    await supabase
      .from('users')
      .update({ username: name.trim(), email: email.trim() })
      .eq('id', userId);

    if (error) throw error;

    res.json({
      id: data.user_id,
      name: data.username,
      email: data.email,
      avatarUrl: data.profile_image,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 3. Tambah profil baru secara manual (POST /api/profile)
router.post('/', async (req, res) => {
  const { userId, username, email, profileImage } = req.body;

  try {
    const { data, error } = await supabase
      .from('profile')
      .insert([{
        user_id: userId,
        username,
        email,
        profile_image: profileImage,
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;