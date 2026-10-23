import { Router } from 'express';
import { fetchNearbyRestaurants } from '../services/google-places.service.js';

const router = Router();

// Endpoint daftar restoran terdekat
router.get('/nearby', async (req, res) => {
  const { lat, lng, radius = 3000 } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ message: 'Parameter lat dan lng wajib disertakan' });
  }

  try {
    const restaurants = await fetchNearbyRestaurants(lat, lng, Number(radius));
    res.json(restaurants);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Endpoint acak Takdir Mode
router.post('/match', async (req, res) => {
  const { lat, lng, distance = '3km', minRating = '4.0' } = req.body;

  if (!lat || !lng) {
    return res.status(400).json({ message: 'Lokasi (lat, lng) diperlukan untuk match' });
  }

  const radiusMap = { '1km': 1000, '3km': 3000, '5km': 5000, '10km': 10000 };
  const radius = radiusMap[distance] || 3000;

  try {
    const all = await fetchNearbyRestaurants(lat, lng, radius);
    let filtered = all.filter((r) => r.rating >= parseFloat(minRating));

    if (filtered.length === 0) {
      filtered = all;
    }

    if (filtered.length === 0) {
      return res.status(404).json({ message: 'Tidak ada restoran yang ditemukan' });
    }

    const selected = filtered[Math.floor(Math.random() * filtered.length)];
    res.json(selected);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;