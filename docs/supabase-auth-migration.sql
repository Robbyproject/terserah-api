-- File: docs/supabase-auth-migration.sql
-- Migration auth: kolom baru di users + tabel kode OTP (docs/backend-auth-requirement.md §7)
-- Jalankan di Supabase SQL Editor SEBELUM deploy kode baru.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider       text    NOT NULL DEFAULT 'email'; -- 'email' | 'google'

-- Tabel kode OTP (1 baris = 1 kode aktif)
CREATE TABLE IF NOT EXISTS verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  purpose text NOT NULL,              -- 'register' | 'reset'
  code_hash text NOT NULL,            -- sha256 dari kode 6 digit (BUKAN plaintext)
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,    -- created_at + interval '10 minutes'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vc_email_purpose
  ON verification_codes (email, purpose, created_at DESC);
