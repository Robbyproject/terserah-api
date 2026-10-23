// File: src/services/google-places.service.js
import axios from 'axios';

// 1. Reverse Geocoding
export async function reverseGeocode(lat, lng) {
  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_API_KEY}&language=id`;
    const res = await axios.get(url);

    if (res.data.status === 'OK' && res.data.results.length > 0) {
      const result = res.data.results[0];
      const subdistrict = result.address_components.find((c) =>
        c.types.includes('administrative_area_level_4') || c.types.includes('sublocality')
      )?.long_name;
      const city = result.address_components.find((c) =>
        c.types.includes('administrative_area_level_2')
      )?.long_name;

      return {
        formattedAddress: result.formatted_address,
        areaName: subdistrict ? `${subdistrict}, ${city || ''}` : result.formatted_address.split(',')[0],
      };
    }
    return { formattedAddress: 'Lokasi tidak dikenal', areaName: 'Sekitar Anda' };
  } catch (error) {
    console.error('Error reverse geocoding:', error.message);
    throw error;
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