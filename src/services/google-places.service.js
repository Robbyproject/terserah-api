import axios from 'axios';

const PLACES_NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const PLACES_SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';

// Geocoding lewat OpenStreetMap Nominatim: gratis dan tidak butuh billing
// Google Cloud (Geocoding API Google diblokir di project ini). Kebijakan
// Nominatim: User-Agent yang jelas, maksimal 1 request/detik, dan hasil
// sebaiknya di-cache.
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_USER_AGENT = 'TerserahApp/1.0 (development)';
const NOMINATIM_TIMEOUT_MS = 8000;
const GEOCODE_CACHE_TTL_MS = 10 * 60 * 1000;

const geocodeCache = new Map();

// Setiap field di bawah ini masih dalam SKU Enterprise/Pro yang sama, kecuali
// editorialSummary / generativeSummary / reviewSummary yang menaikkan tagihan ke
// Enterprise + Atmosphere. Jangan tambahkan ketiganya tanpa keputusan baru.
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.priceRange',
  'places.primaryType',
  'places.photos',
  'places.regularOpeningHours',
  'places.timeZone',
  'places.nationalPhoneNumber',
  'places.websiteUri',
].join(',');

const CACHE_TTL_MS = 60_000;
const nearbyCache = new Map();

const PRICE_BY_LEVEL = {
  PRICE_LEVEL_FREE: { min: 0, max: 30000 },
  PRICE_LEVEL_INEXPENSIVE: { min: 0, max: 30000 },
  PRICE_LEVEL_MODERATE: { min: 30000, max: 75000 },
  PRICE_LEVEL_EXPENSIVE: { min: 75000, max: 150000 },
  PRICE_LEVEL_VERY_EXPENSIVE: { min: 150000, max: 400000 },
};

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Google mencocokkan `includedTypes` ke SEMUA type sebuah place, bukan primary
// type-nya. Mall, hotel, dan gedung serbaguna punya `restaurant` di daftar type
// (karena ada food court / restoran di dalamnya), jadi harus disaring sendiri.
const NON_DINING_PRIMARY_TYPES = new Set([
  'shopping_mall',
  'department_store',
  'supermarket',
  'grocery_store',
  'convenience_store',
  'gas_station',
  'hotel',
  'motel',
  'resort_hotel',
  'lodging',
  'event_venue',
  'convention_center',
  'community_center',
  'movie_theater',
  'casino',
  'night_club',
  'spa',
  'gym',
  'fitness_center',
  'sports_complex',
]);

const CAFE_TYPES = [
  'cafe',
  'coffee_shop',
  'bakery',
  'dessert_shop',
  'ice_cream_shop',
  'tea_house',
  'juice_shop',
  'donut_shop',
];

const FAST_FOOD_TYPES = ['fast_food_restaurant', 'meal_takeaway', 'meal_delivery'];

function getApiKey() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY tidak ditemukan di file .env');
  }
  return apiKey;
}

function haversineKm(origin, target) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const dLat = toRadians(target.latitude - origin.latitude);
  const dLng = toRadians(target.longitude - origin.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(origin.latitude)) *
      Math.cos(toRadians(target.latitude)) *
      Math.sin(dLng / 2) ** 2;

  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function moneyUnits(money) {
  if (!money?.units) return null;
  const value = Number(money.units);
  return Number.isFinite(value) ? value : null;
}

function toPriceRange(place) {
  const start = moneyUnits(place.priceRange?.startPrice);
  const end = moneyUnits(place.priceRange?.endPrice);

  if (start !== null && end !== null && end > start) {
    return { min: start, max: end };
  }

  const byLevel = PRICE_BY_LEVEL[place.priceLevel];
  if (byLevel) {
    return { ...byLevel };
  }

  return start !== null ? { min: start, max: start } : null;
}

function toBudgetTier(price) {
  if (!price) return null;
  if (price.max <= 30000) return 'hemat';
  if (price.max <= 75000) return 'pas';
  if (price.max <= 150000) return 'nraktir';
  return 'sultan';
}

function toCategory(primaryType = '') {
  if (CAFE_TYPES.some((type) => primaryType.includes(type))) return 'Kafe';
  if (primaryType.includes('indonesian')) return 'Masakan Indonesia';
  if (FAST_FOOD_TYPES.some((type) => primaryType.includes(type))) return 'Fast Food';
  return 'Restoran';
}

function toClock(point) {
  const hour = String(point.hour ?? 0).padStart(2, '0');
  const minute = String(point.minute ?? 0).padStart(2, '0');
  return `${hour}:${minute}`;
}

function toMinutes(point) {
  return (point.hour ?? 0) * 60 + (point.minute ?? 0);
}

function localNow(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'Asia/Jakarta',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const read = (type) => parts.find((part) => part.type === type)?.value;

  return {
    day: WEEKDAY_INDEX[read('weekday')] ?? 0,
    minutes: (Number(read('hour')) % 24) * 60 + Number(read('minute')),
  };
}

// Period array tidak dijamin mulai dari hari Minggu, jadi selalu cocokkan lewat
// `open.day`, bukan lewat index.
function closesAtFrom(openingHours, timeZone) {
  const periods = openingHours?.periods;
  if (!Array.isArray(periods) || periods.length === 0) return null;

  const now = localNow(timeZone);
  let upcoming = null;

  for (const period of periods) {
    if (!period.open || !period.close) continue;
    if (period.open.day !== now.day) continue;

    const open = toMinutes(period.open);
    const close = toMinutes(period.close);

    // Periode 24 jam dikirim Google tanpa `close`; periode dengan open == close
    // tidak punya jam tutup yang berarti.
    if (open === close) continue;

    const crossesMidnight = close <= open;
    const current = crossesMidnight && now.minutes < close ? now.minutes + 1440 : now.minutes;

    if (open <= current && current < (crossesMidnight ? close + 1440 : close)) {
      return toClock(period.close);
    }

    if (open > now.minutes && (upcoming === null || open < upcoming.open)) {
      upcoming = { open, close: period.close };
    }
  }

  return upcoming ? toClock(upcoming.close) : null;
}

function photoUrl(place, apiKey) {
  const photoName = place.photos?.[0]?.name;
  if (!photoName) return null;

  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&maxHeightPx=800&key=${apiKey}`;
}

function toRestaurant(place, origin, apiKey) {
  const price = toPriceRange(place);

  return {
    id: place.id,
    name: place.displayName?.text || 'Restoran Tanpa Nama',
    category: toCategory(place.primaryType),
    imageUrl: photoUrl(place, apiKey),
    rating: typeof place.rating === 'number' ? place.rating : null,
    reviewCount: place.userRatingCount ?? 0,
    price,
    distanceKm: place.location ? haversineKm(origin, place.location) : 0,
    address: place.formattedAddress || null,
    closesAt: closesAtFrom(place.regularOpeningHours, place.timeZone?.id),
    isOpenNow: place.regularOpeningHours?.openNow ?? null,
    phone: place.nationalPhoneNumber || null,
    website: place.websiteUri || null,
    budgetTier: toBudgetTier(price),
  };
}

function nominatimAreaName(address) {
  if (!address) return null;

  const subdistrict =
    address.suburb ||
    address.village ||
    address.neighbourhood ||
    address.quarter ||
    address.road;
  const city =
    address.city_district ||
    address.city ||
    address.town ||
    address.municipality ||
    address.county;

  if (!subdistrict) return city || null;
  if (!city || city === subdistrict) return subdistrict;

  return `${subdistrict}, ${city}`;
}

export async function reverseGeocode(lat, lng) {
  try {
    const { data } = await axios.get(NOMINATIM_REVERSE_URL, {
      params: {
        format: 'jsonv2',
        lat,
        lon: lng,
        zoom: 16,
        addressdetails: 1,
        'accept-language': 'id',
      },
      headers: { 'User-Agent': NOMINATIM_USER_AGENT },
      timeout: NOMINATIM_TIMEOUT_MS,
    });

    if (!data?.address) {
      return { formattedAddress: 'Lokasi tidak dikenal', areaName: 'Sekitar Anda' };
    }

    const displayName = data.display_name || 'Sekitar Anda';

    return {
      formattedAddress: displayName,
      areaName: nominatimAreaName(data.address) || displayName.split(',')[0],
    };
  } catch (error) {
    console.error('Error reverse geocoding (Nominatim):', error.message);
    return { formattedAddress: 'Sekitar Anda', areaName: 'Sekitar Anda' };
  }
}

async function nominatimSearch(query) {
  const cacheKey = query.toLowerCase();
  const cached = geocodeCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const { data } = await axios.get(NOMINATIM_SEARCH_URL, {
    params: {
      format: 'jsonv2',
      q: query,
      limit: 1,
      countrycodes: 'id',
      addressdetails: 1,
      'accept-language': 'id',
    },
    headers: { 'User-Agent': NOMINATIM_USER_AGENT },
    timeout: NOMINATIM_TIMEOUT_MS,
  });

  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit) return null;

  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const result = {
    formattedAddress: hit.display_name || query,
    areaName: nominatimAreaName(hit.address) || query,
    location: { lat, lng: lon },
  };

  geocodeCache.set(cacheKey, {
    data: result,
    expiresAt: Date.now() + GEOCODE_CACHE_TTL_MS,
  });

  return result;
}

// Label bebas ketik -> koordinat. Nominatim dulu (gratis); Places Text Search
// dipakai sebagai cadangan kalau Nominatim tidak menemukan apa pun.
export async function forwardGeocode(query) {
  try {
    const viaNominatim = await nominatimSearch(query);
    if (viaNominatim) return viaNominatim;
  } catch (error) {
    console.error('Error forward geocoding (Nominatim):', error.message);
  }

  if (process.env.GOOGLE_MAPS_API_KEY) {
    return searchTextPlace(query, process.env.GOOGLE_MAPS_API_KEY);
  }

  return null;
}

// Cadangan ketika Nominatim tidak menemukan apa pun:
// Places Text Search memakai API yang sama dengan /nearby, jadi biasanya tetap
// jalan. Untuk nama daerah hasilnya bagus ("Kecamatan Menteng", "Ragunan") dan
// koordinatnya cukup untuk memusatkan pencarian.
async function searchTextPlace(query, apiKey) {
  try {
    const { data } = await axios.post(
      PLACES_SEARCH_TEXT_URL,
      {
        textQuery: query,
        languageCode: 'id',
        regionCode: 'ID',
        maxResultCount: 1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location',
        },
      }
    );

    const place = data.places?.[0];

    if (!place?.location) return null;

    return {
      formattedAddress: place.formattedAddress || query,
      areaName: place.displayName?.text || query,
      // Places memakai {latitude, longitude}; Geocoding memakai {lat, lng}.
      // Samakan ke bentuk Geocoding supaya route tinggal baca satu bentuk.
      location: { lat: place.location.latitude, lng: place.location.longitude },
    };
  } catch (error) {
    console.error('Error Places Text Search:', error.response?.data || error.message);
    return null;
  }
}

export async function fetchNearbyRestaurants(lat, lng, radiusMeters = 3000) {
  const apiKey = getApiKey();
  const origin = { latitude: Number(lat), longitude: Number(lng) };
  const cacheKey = `${origin.latitude.toFixed(3)},${origin.longitude.toFixed(3)},${radiusMeters}`;

  const cached = nearbyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const { data } = await axios.post(
      PLACES_NEARBY_URL,
      {
        includedTypes: ['restaurant', 'cafe', 'fast_food_restaurant', 'indonesian_restaurant'],
        maxResultCount: 20,
        languageCode: 'id',
        regionCode: 'ID',
        locationRestriction: {
          circle: {
            center: origin,
            radius: Number(radiusMeters),
          },
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
      }
    );

    const restaurants = (data.places || [])
      .filter((place) => !NON_DINING_PRIMARY_TYPES.has(place.primaryType))
      .map((place) => toRestaurant(place, origin, apiKey));

    nearbyCache.set(cacheKey, { data: restaurants, expiresAt: Date.now() + CACHE_TTL_MS });

    return restaurants;
  } catch (error) {
    console.error('Error Google Places:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.error?.message || 'Gagal memanggil Google Places API'
    );
  }
}
