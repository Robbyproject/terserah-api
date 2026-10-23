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

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server terserah-api & database aktif!' });
});

// Jalur Endpoint
app.use('/api/location', locationRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/sponsors', sponsorRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profile', profileRoutes); // <-- GET/PUT/POST /api/profile/:userId
app.use('/api/favorites', favoriteRoutes);

app.listen(PORT, () => {
  console.log(`Server terserah-api berjalan di http://localhost:${PORT}`);
});