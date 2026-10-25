import { Router } from 'express';
import { fetchNearbyRestaurants } from '../services/google-places.service.js';

const router = Router();

const DEFAULT_RADIUS_METERS = 3000;
const MIN_RADIUS_METERS = 100;
const MAX_RADIUS_METERS = 50000;

function parseCoords({ lat, lng }) {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;

  return { latitude, longitude };
}

function clampRadius(value) {
  const radius = Number(value);
  if (!Number.isFinite(radius) || radius <= 0) return DEFAULT_RADIUS_METERS;
  return Math.min(Math.max(radius, MIN_RADIUS_METERS), MAX_RADIUS_METERS);
}

// Endpoint daftar restoran terdekat, sudah berbentuk `Restaurant` di frontend.
router.get('/nearby', async (req, res) => {
  const coords = parseCoords(req.query);

  if (!coords) {
    return res
      .status(400)
      .json({ message: 'Parameter lat dan lng wajib diisi dengan benar' });
  }

  const radius = clampRadius(req.query.radius);

  try {
    const restaurants = await fetchNearbyRestaurants(
      coords.latitude,
      coords.longitude,
      radius
    );
    res.json(restaurants);
  } catch (error) {
    res.status(502).json({ message: error.message });
  }
});

// Endpoint acak Takdir Mode (belum dipakai frontend pada pass ini)
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
    res.status(502).json({ message: error.message });
  }
});

export default router;
