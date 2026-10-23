// File: src/routes/sponsor.routes.js
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sponsors')
      .select('*')
      .order('nama_restoran', { ascending: true });

    if (error) throw error;

    // Petakan ke format props SponsorCarousel di frontend
    const sponsors = (data || []).map((s) => ({
      id: s.id,
      name: s.nama_restoran,
      imageUrl: s.logo_url,
      tagline: s.tagline || '',
    }));

    res.json(sponsors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;