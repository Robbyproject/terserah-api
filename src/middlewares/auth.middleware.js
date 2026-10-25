// File: src/middlewares/auth.middleware.js
// Verifikasi token JWT (payload: { sub: user_id, email } — §8).
// req.user berisi { id, email } setelah decoding, siap dipakai route berikutnya.

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'terserah_app_jwt_secret_key_super_aman_2026';

export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Akses ditolak, token tidak ditemukan' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Normalkan payload lama ({ id }) dan baru ({ sub })
    req.user = {
      id: decoded.sub || decoded.id,
      email: decoded.email,
      username: decoded.username,
    };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Sesi kedaluwarsa atau token tidak valid' });
  }
}
