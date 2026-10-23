import { Router } from 'express';
import { reverseGeocode } from '../services/google-places.service.js';

const router = Router();

router.get('/reverse', async (req, res) => {
  const { lat, lng } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ message: 'Parameter lat dan lng wajib disertakan' });
  }

  try {
    const data = await reverseGeocode(lat, lng);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;