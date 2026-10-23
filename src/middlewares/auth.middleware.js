// File: src/middlewares/auth.middleware.js
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
    req.user = decoded; // Berisi { id, email, username }
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Sesi kedaluwarsa atau token tidak valid' });
  }
}