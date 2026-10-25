// File: src/services/google-places.service.js
import axios from 'axios';

// 1. Reverse Geocoding (Menggunakan OpenStreetMap Nominatim - Gratis tanpa Billing Google Cloud)
export async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1&accept-language=id`;
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'TerserahApp/1.0',
      },
    });

    if (res.data && res.data.address) {
      const addr = res.data.address;
      const subdistrict =
        addr.suburb ||
        addr.village ||
        addr.neighbourhood ||
        addr.quarter ||
        addr.road;
      const city =
        addr.city_district ||
        addr.city ||
        addr.town ||
        addr.municipality ||
        addr.county;

      const displayName = res.data.display_name || 'Sekitar Anda';
      const areaName = subdistrict
        ? `${subdistrict}${city ? `, ${city}` : ''}`
        : displayName.split(',')[0];

      return {
        formattedAddress: displayName,
        areaName,
      };
    }

    return { formattedAddress: 'Lokasi tidak dikenal', areaName: 'Sekitar Anda' };
  } catch (error) {
    console.error('Error reverse geocoding:', error.message);
    return { formattedAddress: 'Sekitar Anda', areaName: 'Sekitar Anda' };
  }
}

// 2. Nearby Search (Places API New)
export async function fetchNearbyRestaurants(lat, lng, radiusMeters = 3000) {
  // Ambil API Key di dalam fungsi
  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

  if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_MAPS_API_KEY tidak ditemukan di file .env');
  }

  try {
    const endpoint = 'https://places.googleapis.com/v1/places:searchNearby';

    const headers = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.primaryType,places.photos',
    };

    const body = {
      includedTypes: ['restaurant', 'cafe', 'fast_food_restaurant', 'indonesian_restaurant'],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: {
            latitude: parseFloat(lat),
            longitude: parseFloat(lng),
          },
          radius: parseFloat(radiusMeters),
        },
      },
    };

    const res = await axios.post(endpoint, body, { headers });
    const places = res.data.places || [];

    const priceMap = {
      PRICE_LEVEL_FREE: 1,
      PRICE_LEVEL_INEXPENSIVE: 1,
      PRICE_LEVEL_MODERATE: 2,
      PRICE_LEVEL_EXPENSIVE: 3,
      PRICE_LEVEL_VERY_EXPENSIVE: 4,
    };

    return places.map((place) => {
      let imageUrl = null;
      if (place.photos && place.photos.length > 0) {
        const photoName = place.photos[0].name;
        imageUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&maxHeightPx=800&key=${GOOGLE_API_KEY}`;
      }

      let category = 'Restoran';
      if (place.primaryType?.includes('cafe')) category = 'Kafe';
      else if (place.primaryType?.includes('indonesian')) category = 'Masakan Indonesia';
      else if (place.primaryType?.includes('fast_food')) category = 'Fast Food';

      return {
        id: place.id,
        name: place.displayName?.text || 'Restoran Tanpa Nama',
        category,
        rating: place.rating || 4.0,
        userRatingsTotal: place.userRatingCount || 0,
        price: priceMap[place.priceLevel] || 2,
        address: place.formattedAddress || 'Alamat tidak tersedia',
        location: {
          latitude: place.location?.latitude || parseFloat(lat),
          longitude: place.location?.longitude || parseFloat(lng),
        },
        imageUrl,
      };
    });
  } catch (error) {
    console.error('Error Google Places:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || 'Gagal memanggil Google Places API');
  }
}