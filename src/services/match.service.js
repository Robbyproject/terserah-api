// Logika Takdir Mode: filter `Restaurant` (bentuk internal dari
// google-places.service.js) berdasarkan kriteria aplikasi, lalu pilih satu
// secara acak. Tidak ada I/O di sini supaya mudah diuji dan diubah.

const DISTANCE_METERS = {
  '1km': 1000,
  '3km': 3000,
  '5km': 5000,
  '8km': 8000,
  '10km': 10000,
};

const DEFAULT_RADIUS_METERS = 3000;
const MIN_RADIUS_METERS = 100;
const MAX_RADIUS_METERS = 50000;

const BUDGET_TIERS = new Set(['hemat', 'pas', 'nraktir', 'sultan']);

// Google Place Types (New) Table A, diverifikasi 2026-10-25. Semua tipe di sini
// ada di Table A (boleh dipakai sebagai filter), termasuk yang ditambahkan pada
// rilis 12 Februari 2026: chicken_restaurant, chicken_wings_restaurant,
// noodle_shop, chinese_noodle_restaurant, soup_restaurant, dumpling_restaurant,
// snack_bar.
const CRAVING_TYPES = {
  bakso_mie: [
    'noodle_shop',
    'chinese_noodle_restaurant',
    'ramen_restaurant',
    'soup_restaurant',
    'dumpling_restaurant',
  ],
  nasi_padang: ['indonesian_restaurant'],
  ayam_geprek: ['chicken_restaurant', 'chicken_wings_restaurant'],
  sate_street: ['barbecue_restaurant', 'snack_bar', 'food_court', 'meal_takeaway'],
  kopi_snack: ['coffee_shop', 'cafe', 'bakery', 'dessert_shop', 'tea_house'],
};

export function clampRadiusMeters(value) {
  const radius = Number(value);
  if (!Number.isFinite(radius) || radius <= 0) return DEFAULT_RADIUS_METERS;
  return Math.min(Math.max(radius, MIN_RADIUS_METERS), MAX_RADIUS_METERS);
}

function toRadiusMeters(radiusMeters, distance) {
  const explicit = Number(radiusMeters);
  if (Number.isFinite(explicit) && explicit > 0) return clampRadiusMeters(explicit);

  return DISTANCE_METERS[distance] ?? DEFAULT_RADIUS_METERS;
}

function toMinRating(value) {
  if (value === undefined || value === null || value === 'all') return 0;

  const rating = Number(value);
  return Number.isFinite(rating) && rating > 0 ? rating : 0;
}

function toCravingTypes(cravings) {
  if (!Array.isArray(cravings)) return null;

  const types = new Set();

  for (const key of cravings) {
    const mapped = CRAVING_TYPES[key];
    if (!mapped) continue;
    for (const type of mapped) types.add(type);
  }

  return types.size > 0 ? types : null;
}

// Menerima body baru ({ criteria: {...} }) maupun body lama
// ({ distance, minRating }) agar klien lama tetap jalan.
export function normalizeCriteria(body = {}) {
  const criteria = body.criteria ?? {};

  return {
    radiusMeters: toRadiusMeters(body.radiusMeters, criteria.distance ?? body.distance),
    budgetTier: BUDGET_TIERS.has(criteria.budgetTier) ? criteria.budgetTier : null,
    cravingTypes: toCravingTypes(criteria.cravings),
    minRating: toMinRating(criteria.minRating ?? body.minRating),
  };
}

function matchesCraving(restaurant, types) {
  if (restaurant.primaryType && types.has(restaurant.primaryType)) return true;

  return Array.isArray(restaurant.types) && restaurant.types.some((type) => types.has(type));
}

// Tempat tanpa data harga tetap lolos: Google sering tidak mempublikasikan
// priceRange/priceLevel, dan menyaringnya akan mengosongkan hasil "Pas Kantong".
function matchesBudget(restaurant, budgetTier) {
  if (!budgetTier || !restaurant.budgetTier) return true;

  return restaurant.budgetTier === budgetTier;
}

// rating null tidak dianggap memenuhi batas eksplisit; biar tangga pelonggaran
// yang memutuskan, bukan tebakan.
function matchesRating(restaurant, minRating) {
  if (minRating <= 0) return true;

  return typeof restaurant.rating === 'number' && restaurant.rating >= minRating;
}

// Jarak tidak pernah dilonggarkan: radius sudah ditegakkan oleh
// locationRestriction.circle di Google, dan haversine yang dibulatkan bisa
// membuang hasil 3.0004 km.
const RELAXATION_LADDER = [
  { craving: true, budget: true, rating: true, relaxed: [] },
  { craving: false, budget: true, rating: true, relaxed: ['craving'] },
  { craving: false, budget: false, rating: true, relaxed: ['craving', 'budget'] },
  {
    craving: false,
    budget: false,
    rating: false,
    relaxed: ['craving', 'budget', 'rating'],
  },
];

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function selectMatch(restaurants, criteria) {
  for (const step of RELAXATION_LADDER) {
    const candidates = restaurants.filter(
      (restaurant) =>
        (!step.craving ||
          !criteria.cravingTypes ||
          matchesCraving(restaurant, criteria.cravingTypes)) &&
        (!step.budget || matchesBudget(restaurant, criteria.budgetTier)) &&
        (!step.rating || matchesRating(restaurant, criteria.minRating))
    );

    if (candidates.length > 0) {
      return {
        match: pickRandom(candidates),
        candidates,
        poolSize: candidates.length,
        totalNearby: restaurants.length,
        relaxed: step.relaxed,
      };
    }
  }

  return null;
}
