# Requirement Backend — Alur Auth Standar (Register OTP, Login, Ganti Password)

> Dokumen ini ditulis dari sisi **Frontend (Expo — repo `terserah-app`, branch `development`)**
> untuk diserahkan ke **AI agent / developer Backend (Express JS + Supabase)**.
> Sifatnya: **kontrak API**. FE tidak perlu diubah selama bentuk respons di bawah dipenuhi.

---

## 0. Konteks integrasi FE

- App FE: Expo React Native (SDK 57), request via `fetch`.
- `EXPO_PUBLIC_API_BASE_URL` di FE berisi **sudah termasuk `/api`**,
  contoh: `http://192.168.1.5:5001/api`.
  → Di dokumen ini semua path (mis. `/users/register`) adalah **relatif terhadap `/api`**.
  → Request FE `POST {BASE}/users/register` = `POST http://192.168.1.5:5001/api/users/register`.
- FE **menampilkan `data.message` dari backend langsung ke layar**.
  **SEMUA pesan error WAJIB Bahasa Indonesia, sudah final, tidak perlu dibungkus lagi.**
- `Content-Type`: `application/json` untuk semua request.
- Setelah login, FE mengirim header `Authorization: Bearer <token>` pada endpoint yang butuh (ubah profil, ganti password).

### Bentuk object `user` yang diharapkan FE

```json
{
  "id": "uuid-supabase",
  "username": "doawahyudi",
  "email": "doa@gmail.com"
}
```

- Objek `user` untuk login/register selalu **dibungkus** di key `user` (contoh di bawah).
- Respons profil (`/profile/:id`) berbentuk **flat**: `{ "id", "name", "email", "avatarUrl" }`.

---

## 1. Kebutuhan akun & validasi (standar aplikasi)

| Field | Aturan | Pesan error (final, Bahasa Indonesia) |
|---|---|---|
| `username` | 3–30 karakter, hanya huruf/angka/underscore, **unik** | `"Nama sudah dipakai, gunakan nama lain."` (409) & `"Nama harus 3–30 karakter."` (400) |
| `email` | format valid & **unik** | `"Email sudah terdaftar, silakan masuk."` (409), `"Format email tidak valid."` (400) |
| `password` | **min. 8 karakter & wajib kombinasi: huruf + angka + simbol** | `"Kata sandi minimal 8 karakter & harus kombinasi huruf + angka + simbol."` (400) |
| Konfirmasi di FE | FE sudah memastikan `password === confirmPassword`, backend tetap memvalidasi ulang | — |
| *Change password* | `oldPassword` harus cocok dengan hash bcrypt di DB | `"Kata sandi lama salah."` (401) |

### Regex rekomendasi password (huruf + angka + simbol, min 8)

```js
const strongPassword = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;
```

Username / email di FE sudah di-trim; backend tetap WAJIB trim + validasi ulang. Password **jangan di-trim**.

---

## 2. Flow Register + Verifikasi Email via Kode (OTP)

### 2.1 `POST /users/register`

**Request:**
```json
{ "username": "doawahyudi", "email": "doa@gmail.com", "password": "Contoh#123" }
```

**Perilaku backend:**
1. Validasi sesuai tabel §1 (cek username & email unik di Supabase).
2. Buat user: `password_hash = bcrypt(cost ≥ 10)`, **`email_verified = false`**.
3. Generate **kode OTP 6 digit angka random** untuk `purpose: "register"`.
4. Simpan ke tabel `verification_codes` sebagai **HASH (sha256/bcrypt, bukan plaintext)**.
5. Kirim kode ke email user via **nodemailer + SMTP** (lihat §6).
6. **JANGAN** terbitkan JWT di sini — akun belum terverifikasi.

**Response sukses `202`:**
```json
{ "message": "Kode verifikasi dikirim ke email-mu. Cek kotak masuk atau folder spam.", "email": "doa@gmail.com" }
```

**Response gagal `400`/`409`:** `{ "message": "..." }` — pesan sesuai tabel §1.

### 2.2 `POST /users/verify-otp`

**Request:**
```json
{ "email": "doa@gmail.com", "code": "123456", "purpose": "register" }
```

**Perilaku backend:**
1. Cocokkan hash kode; cek `expires_at` (maks **10 menit**) & `attempts < 5`.
2. Jika salah → `attempts + 1`. Setelah 5x salah → kode hangus (hapus dari DB).
3. Jika benar → hapus baris kode → set `email_verified = true` → **terbitkan JWT** (bentuk sama seperti login).

**Response sukses `200` (bentuk identik dengan login, FE langsung auto-login):**
```json
{ "token": "jwt", "user": { "id": "uuid", "username": "doawahyudi", "email": "doa@gmail.com" } }
```

**Response gagal:**
- `400 { "message": "Kode verifikasi salah atau kedaluwarsa." }`
- `429 { "message": "Percobaan terlalu sering. Minta kode baru." }` (5x salah)

### 2.3 `POST /users/resend-otp`

**Request:** `{ "email": "...", "purpose": "register" | "reset" }`
- Cooldown **60 detik** antar pengiriman; jika < 60s → `429 { "message": "Tunggu 1 menit sebelum meminta kode baru." }`
- Selalu hapus/menggantikan kode lama yang belum dipakai untuk email + purpose yang sama.
- Validasi kondisi akun: untuk `purpose: "register"` jika akun sudah `email_verified = true` →
  `400 { "message": "Email ini sudah terverifikasi, silakan masuk." }`.

**Response:** `200 { "message": "Kode baru dikirim." }`

---

## 3. Login + Blokir akun belum verifikasi

### 3.1 `POST /users/login` (endpoint lama — payload & respons yang sudah dipakai FE TIDAK berubah)

**Request:** `{ "email": "...", "password": "..." }`
- FE memungkinkan login dengan **email ATAU username** → backend harus cek keduanya.
- Cocok & `email_verified = true` → respond 200 seperti biasa.

**Response sukses `200` (bentuk lama yang sudah terpakai FE — jangan ubah):**
```json
{ "token": "jwt", "user": { "id": "uuid", "username": "doawahyudi", "email": "doa@gmail.com" } }
```

- Password salah / user tidak ada → `400 { "message": "Email atau kata sandi salah!" }`

**Kasus BARU:** kredensial benar tapi `email_verified = false` →
`403 { "code": "EMAIL_NOT_VERIFIED", "message": "Email belum diverifikasi. Masukkan kode yang dikirim ke email-mu." }`
→ FE memakai `code` ini untuk melompat ke layar OTP (dengan tombol kirim ulang kode).

---

## 4. Ganti password (2 jenis alur)

### 4.1 Saat SUDAH login (dari Profil) — tetap pakai endpoint lama

`PUT /users/change-password/:userId` (payload lama, FE tidak berubah)

**Auth:** `Authorization: Bearer <token>` (wajib; token harus milik `:userId` itu sendiri).

**Request:** `{ "oldPassword": "...", "newPassword": "..." }`
- Validasi `newPassword` sesuai §1. Cek `oldPassword` vs bcrypt. Setelah update, sesi lama boleh di-invalidasi (opsional).
- `401` jika token tidak valid/bukan milik user; `400 { "message": "..." }` untuk kegagalan validasi.
- Sukses `200 { "message": "Kata sandi berhasil diperbarui." }`

### 4.2 Lupa password (BELUM login, dari layar Login) — format BARU pakai OTP

> Endpoint `PUT /users/reset-password` lama DITOLAK dan diganti, karena bentuk lama
> ([email + password baru] tanpa kode) tidak aman. Format BARU untuk reset password wajib melalui OTP.

1. `POST /users/forgot-password` — **Request:** `{ "email": "..." }`
   - **Security note:** balas selalu sama **tanpa membocorkan** keberadaan email terdaftar:
     `200 { "message": "Jika email terdaftar, kode reset dikirim ke email." }`
   - Kalau email tidak terdaftar → tetap 200 (jangan kirim email).
2. FE menampilkan layar OTP + form password baru.
3. `POST /users/reset-password` — **Request:** `{ "email": "...", "code": "123456", "newPassword": "..." }`
   - Backend verifikasi kode (`purpose: "reset"`, aturan §2.2) + validasi password §1 → update hash → hapus kode.
   - Sukses: `200 { "message": "Kata sandi berhasil diubah, silakan masuk." }`
   - Gagal: `400 { "message": "Kode verifikasi salah atau kedaluwarsa." }`

---

## 5. Profil (endpoint existing — pertahankan)

- `GET /profile/:id` → `200 { "id", "name", "email", "avatarUrl" }`
- `PUT /profile/:id` → request `{ "name", "email" }`, **auth: Bearer**, validasi §1 (termasuk unik untuk `email`), respons bentuk sama setelah update.

---

## 6. Email & konfigurasi

- Package: `nodemailer`.
- SMTP via `process.env` (jangan commit credential!):
  ```
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=465
  SMTP_USER=xxx@gmail.com          ← email demo
  SMTP_PASS=<App Password 16 char>  ← myaccount.google.com → Security → 2FA → App passwords
  ```
- Template email kode (subjek: "Verifikasi Email — Terserah App"):
  ```
  Kode verifikasi kamu: 123456
  Berlaku 10 menit. Jangan bagikan kode ini ke siapa pun.
  ```
- Kirim versi plain text + HTML sederhana.

---

## 7. Skema DB (Supabase — kolom baru di users + tabel baru)

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider       text    NOT NULL DEFAULT 'email';  -- 'email' | 'google'

-- Tabel kode OTP (1 baris = 1 kode aktif)
CREATE TABLE IF NOT EXISTS verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  purpose text NOT NULL,               -- 'register' | 'reset'
  code_hash text NOT NULL,             -- sha256 (atau bcrypt) dari kode 6 digit
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,     -- created_at + interval '10 minutes'
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vc_email_purpose ON verification_codes (email, purpose, created_at DESC);
```

Kolom `users` yang dibutuhkan FE: `id (uuid)`, `username` (unik), `email` (unik), `password_hash` (bcrypt), `email_verified`, `provider`.

---

## 8. Kebutuhan token JWT

- Payload utama: `{ sub: user_id, email }`; FE tidak membaca claim tambahan.
- HS256 + `JWT_SECRET` dari `.env` (belum ada di `.env.example` — tambahkan di sana).
- FE hanya memakai: token disimpan di `AsyncStorage` (`saveAuthSession(token, user)`), lalu dikirim `Authorization: Bearer <token>` untuk `PUT /profile/:id` dan `PUT /users/change-password/:id`.
- Expiry: 7 hari (dev) / 1–2 hari (prod).

---

## 9. Keamanan (wajib semua)

- [ ] `bcrypt` cost ≥ 10 untuk password; kode OTP disimpan sebagai **hash**, tidak pernah plaintext.
- [ ] OTP: expire 10 menit, maks 5x salah (lalu hangus), cooldown 60 detik antar resend, single-use, dipakai = hapus baris.
- [ ] Hindari SQL injection → gunakan parameterized query (pg pool / Supabase client), jangan concatenated string.
- [ ] Rate limit global (mis. `express-rate-limit`) pada `/users/*` → `429 { "message": "Terlalu banyak percobaan, coba beberapa menit lagi." }`.
- [ ] Jangan membocorkan keberadaan email pada endpoint publik (lihat §4.2).
- [ ] Jangan pernah mengirim password (lama/baru) atau kode lain via email selain kode OTP aktif.

---

## 10. Definition of Done (skenario yang harus lulus)

1. Register → user menerima email berisi kode 6 digit.
2. `verify-otp` dengan kode benar → respons bentuk login + akun `email_verified = true`.
3. Login dengan akun belum verifikasi → 403 + `code: "EMAIL_NOT_VERIFIED"`.
4. Login dengan email ATAU username sama-sama jalan.
5. Password `abc123` atau `abcdefgh` → **DITOLAK** dengan pesan §1; `Abc#12g34` → diterima.
6. Register dengan email/username yang sudah dipakai → 409 dengan pesan final §1.
7. Forgot-password untuk email yang TIDAK terdaftar → tetap 200 dengan pesan generik.
8. Change-password (sudah login) dengan password lama salah → 401 + pesan final.
9. `resend-otp` < 60 detik → 429.
10. Semua pesan error berbahasa Indonesia (FE menampilkannya apa adanya).

---

## 11. Reserved (belum diterapkan — jangan dibuat dulu)

- **Login Google OAuth** — FE nanti menambah tombol dan mengirim `id_token` ke `POST /users/google`.
  Backend harus memverifikasi token tersebut (`google-auth-library`), find-or-create user
  dengan `provider = 'google'`, lalu respond bentuk sama seperti login.
  **Tunggu sampai endpoint OTP di atas stabil.**
- Social login Facebook.
