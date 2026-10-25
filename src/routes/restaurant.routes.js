import { Router } from 'express';
import {
  fetchNearbyRestaurants,
  toApiRestaurant,
} from '../services/google-places.service.js';
import {
  clampRadiusMeters,
  normalizeCriteria,
  selectMatch,
} from '../services/match.service.js';

const router = Router();

function parseCoords({ lat, lng }) {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;

  return { latitude, longitude };
}

// Endpoint daftar restoran terdekat, sudah berbentuk `Restaurant` di frontend.
router.get('/nearby', async (req, res) => {
  const coords = parseCoords(req.query);

  if (!coords) {
    return res
      .status(400)
      .json({ message: 'Parameter lat dan lng wajib diisi dengan benar' });
  }

  const radius = clampRadiusMeters(req.query.radius);

  try {
    const restaurants = await fetchNearbyRestaurants(
      coords.latitude,
      coords.longitude,
      radius
    );
    res.json(restaurants.map(toApiRestaurant));
  } catch (error) {
    res.status(502).json({ message: error.message });
  }
});

// Endpoint Takdir Mode. Menerima kriteria dari bottom sheet, mengembalikan
// `match` plus seluruh `candidates` agar tombol "Cari Lain" bisa mengocok ulang
// di aplikasi tanpa request baru.
//
// Catatan: radius diambil dari `criteria.distance` (1/3/8 km), bukan radius
// lokasi di pill home — keduanya punya pilihan berbeda dan pilihan di sheet
// adalah yang paling eksplisit dari pengguna.
router.post('/match', async (req, res) => {
  const coords = parseCoords(req.body);

  if (!coords) {
    return res
      .status(400)
      .json({ message: 'Lokasi (lat, lng) diperlukan untuk match' });
  }

  const criteria = normalizeCriteria(req.body);

  try {
    const nearby = await fetchNearbyRestaurants(
      coords.latitude,
      coords.longitude,
      criteria.radiusMeters
    );

    if (nearby.length === 0) {
      return res
        .status(404)
        .json({ message: 'Tidak ada restoran di sekitar lokasi ini' });
    }

    const result = selectMatch(nearby, criteria);

    res.json({
      ...result,
      match: toApiRestaurant(result.match),
      candidates: result.candidates.map(toApiRestaurant),
    });
  } catch (error) {
    res.status(502).json({ message: error.message });
  }
});

export default router;
