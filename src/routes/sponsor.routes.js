import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

const CTA_LABEL = 'Lihat';
const SPONSOR_ICON = 'local_offer';

function isActiveToday(sponsor, today) {
  const started = !sponsor.start_date || sponsor.start_date <= today;
  const notExpired = !sponsor.end_date || sponsor.end_date >= today;
  return started && notExpired;
}

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sponsors')
      .select('*')
      .order('nama_restoran', { ascending: true });

    if (error) throw error;

    const today = new Date().toISOString().slice(0, 10);

    // Bentuknya sudah `Sponsor` di src/types/sponsor.ts: carousel merender tile
    // Material Symbols, jadi logo_url tidak dikirim.
    const sponsors = (data || [])
      .filter((sponsor) => isActiveToday(sponsor, today))
      .map((sponsor) => ({
        id: sponsor.id,
        title: sponsor.nama_restoran,
        tagline: sponsor.tagline || '',
        ctaLabel: CTA_LABEL,
        icon: SPONSOR_ICON,
      }));

    res.json(sponsors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
