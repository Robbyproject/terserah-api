import { Router } from 'express';
import { forwardGeocode, reverseGeocode } from '../services/google-places.service.js';

const router = Router();

const DEFAULT_RADIUS_KM = 3;

function parseCoords({ lat, lng }) {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;

  return { latitude, longitude };
}

function parseRadiusKm(value) {
  const radiusKm = Number(value);
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) return DEFAULT_RADIUS_KM;
  return radiusKm;
}

function locationId(latitude, longitude) {
  return `loc_${latitude.toFixed(4)}_${longitude.toFixed(4)}`;
}

// Koordinat -> UserLocation (dipakai location pill di home)
router.get('/reverse', async (req, res) => {
  const coords = parseCoords(req.query);

  if (!coords) {
    return res
      .status(400)
      .json({ message: 'Parameter lat dan lng wajib diisi dengan benar' });
  }

  try {
    const data = await reverseGeocode(coords.latitude, coords.longitude);

    res.json({
      id: locationId(coords.latitude, coords.longitude),
      // `label` = sedetail mungkin (nama jalan), `areaLabel` = kecamatan/kota
      // untuk baris kedua di sheet.
      label: data.preciseName ?? data.areaName,
      areaLabel: data.areaName,
      radiusKm: parseRadiusKm(req.query.radiusKm),
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
  } catch (error) {
    res.status(502).json({ message: error.message });
  }
});

// Label bebas ketik -> UserLocation (dipakai sheet "Ubah Lokasi")
router.get('/resolve', async (req, res) => {
  const query = String(req.query.q || '').trim();

  if (!query) {
    return res.status(400).json({ message: 'Parameter q wajib diisi' });
  }

  try {
    const data = await forwardGeocode(query);

    if (!data) {
      return res.status(404).json({ message: 'Lokasi tidak ditemukan' });
    }

    res.json({
      id: locationId(data.location.lat, data.location.lng),
      // Area yang diketik tetap ditampilkan sebagai area, bukan nama jalan.
      label: data.areaName,
      areaLabel: data.areaName,
      radiusKm: parseRadiusKm(req.query.radiusKm),
      latitude: data.location.lat,
      longitude: data.location.lng,
    });
  } catch (error) {
    res.status(502).json({ message: error.message });
  }
});

export default router;
