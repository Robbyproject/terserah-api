// File: src/routes/profile.routes.js
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

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
router.put('/:userId', async (req, res) => {
  const { userId } = req.params;
  const { name, email, avatarUrl } = req.body;

  try {
    const { data, error } = await supabase
      .from('profile')
      .update({
        username: name,
        email: email,
        profile_image: avatarUrl,
      })
      .eq('user_id', userId)
      .select()
      .single();

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