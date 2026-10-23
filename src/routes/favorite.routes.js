// File: src/routes/favorite.routes.js
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

// Ambil daftar favorit berdasarkan user_id
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Tambah restoran favorit
router.post('/', async (req, res) => {
  const { userId, namaRestoran } = req.body;

  if (!userId || !namaRestoran) {
    return res.status(400).json({ message: 'userId dan namaRestoran wajib diisi' });
  }

  try {
    const { data, error } = await supabase
      .from('favorites')
      .insert([{ user_id: userId, nama_restoran: namaRestoran }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Hapus favorit berdasarkan ID
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Berhasil dihapus dari favorit' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;