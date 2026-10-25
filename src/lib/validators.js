// File: src/lib/validators.js
// Validasi akun standar aplikasi + pesan error final (Bahasa Indonesia, dari kontrak FE).
// Sumber: docs/backend-auth-requirement.md §1

export const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// huruf + angka + simbol, min 8 karakter (regex rekomendasi dari §1)
export const STRONG_PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;

export const MESSAGES = {
  required: 'Semua kolom wajib diisi.',
  usernameFormat: 'Nama harus 3–30 karakter.',
  usernameTaken: 'Nama sudah dipakai, gunakan nama lain.',
  emailFormat: 'Format email tidak valid.',
  emailTaken: 'Email sudah terdaftar, silakan masuk.',
  passwordWeak: 'Kata sandi minimal 8 karakter & harus kombinasi huruf + angka + simbol.',
  otpInvalid: 'Kode verifikasi salah atau kedaluwarsa.',
  otpTooMany: 'Percobaan terlalu sering. Minta kode baru.',
  resendCooldown: 'Tunggu 1 menit sebelum meminta kode baru.',
  alreadyVerified: 'Email ini sudah terverifikasi, silakan masuk.',
  otpSent: 'Kode verifikasi dikirim ke email-mu. Cek kotak masuk atau folder spam.',
  otpResent: 'Kode baru dikirim.',
  loginBadCreds: 'Email atau kata sandi salah!',
  emailNotVerified: 'Email belum diverifikasi. Masukkan kode yang dikirim ke email-mu.',
  oldPasswordWrong: 'Kata sandi lama salah.',
  passwordChanged: 'Kata sandi berhasil diperbarui.',
  forgotPasswordGeneric: 'Jika email terdaftar, kode reset dikirim ke email.',
  resetPasswordSuccess: 'Kata sandi berhasil diubah, silakan masuk.',
  rateLimited: 'Terlalu banyak percobaan, coba beberapa menit lagi.',
  serverError: 'Terjadi kesalahan pada server.',
};

// Semua fungsi mengembalikan `null` jika valid, atau string pesan error.
export function validateUsername(username) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return MESSAGES.usernameFormat;
  }
  return null;
}

export function validateEmail(email) {
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return MESSAGES.emailFormat;
  }
  return null;
}

export function validatePassword(password) {
  if (typeof password !== 'string' || !STRONG_PASSWORD_RE.test(password)) {
    return MESSAGES.passwordWeak;
  }
  return null;
}
