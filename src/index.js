// File: src/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import locationRoutes from './routes/location.routes.js';
import restaurantRoutes from './routes/restaurant.routes.js';
import sponsorRoutes from './routes/sponsor.routes.js';
import userRoutes from './routes/user.routes.js';
import profileRoutes from './routes/profile.routes.js'; // <-- Impor baru
import favoriteRoutes from './routes/favorite.routes.js';
import rateLimit from 'express-rate-limit';
import { MESSAGES } from './lib/validators.js';

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Rate limit global untuk semua endpoint /users/* (§9)
const usersRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  limit: 100, // maks 100 request per IP per window
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ message: MESSAGES.rateLimited });
  },
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server terserah-api & database aktif!' });
});

// Jalur Endpoint
app.use('/api/location', locationRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/sponsors', sponsorRoutes);
app.use('/api/users', usersRateLimit, userRoutes);
app.use('/api/profile', profileRoutes); // <-- GET/PUT/POST /api/profile/:userId
app.use('/api/favorites', favoriteRoutes);

app.listen(PORT, () => {
  console.log(`Server terserah-api berjalan di http://localhost:${PORT}`);
});