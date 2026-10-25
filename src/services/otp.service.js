// File: src/services/otp.service.js
// Logika kode OTP 6 digit: pembuatan, hash sha256, kedaluwarsa, percobaan salah, cooldown.
// Aturan: expire 10 menit, maks 5x salah (hangus/dihapus), single-use, cooldown resend 60 detik.
// Sumber: docs/backend-auth-requirement.md §2, §9

import crypto from 'node:crypto';
import { supabase } from '../lib/supabase.js';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 menit
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 detik

// Kode TIDAK PERNAH disimpan plaintext — hanya hash sha256.
function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Hapus/menggantikan semua kode lama untuk email + purpose yang sama,
 * lalu buat kode baru dan simpan (hashed) ke tabel verification_codes.
 *
 * @returns {Promise<string>} kode 6 digit plaintext (hanya untuk dikirim via email)
 */
export async function createOtp(email, purpose) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  await supabase
    .from('verification_codes')
    .delete()
    .eq('email', email)
    .eq('purpose', purpose);

  const { error } = await supabase.from('verification_codes').insert({
    email,
    purpose,
    code_hash: hashCode(code),
    attempts: 0,
    expires_at: expiresAt,
  });
  if (error) throw error;

  return code;
}

/**
 * Cek cooldown 60 detik antar pengiriman untuk email + purpose yang sama.
 * @returns {Promise<boolean>} true jika masih dalam masa tunggu.
 */
export async function isResendOnCooldown(email, purpose) {
  const { data: latest } = await supabase
    .from('verification_codes')
    .select('created_at')
    .eq('email', email)
    .eq('purpose', purpose)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest?.created_at) return false;
  return Date.now() - new Date(latest.created_at).getTime() < RESEND_COOLDOWN_MS;
}

/**
 * Verifikasi kode OTP:
 * - salah / kedaluwarsa -> 'invalid'
 * - salah 5x -> kode hangus (dihapus), 'tooMany'
 * - benar -> baris kode dihapus (single-use), 'ok'
 *
 * @returns {Promise<'ok'|'invalid'|'tooMany'>}
 */
export async function verifyOtp(email, purpose, code) {
  const { data: row } = await supabase
    .from('verification_codes')
    .select('id, code_hash, attempts, expires_at')
    .eq('email', email)
    .eq('purpose', purpose)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return 'invalid';

  // Sisa percobaan habis -> kode hangus
  if (row.attempts >= MAX_ATTEMPTS) {
    await supabase.from('verification_codes').delete().eq('id', row.id);
    return 'tooMany';
  }

  // Kedaluwarsa
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await supabase.from('verification_codes').delete().eq('id', row.id);
    return 'invalid';
  }

  // Kode salah -> attempts + 1; setelah 5x salah -> hangus
  if (row.code_hash !== hashCode(String(code))) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await supabase.from('verification_codes').delete().eq('id', row.id);
      return 'tooMany';
    }
    await supabase.from('verification_codes').update({ attempts }).eq('id', row.id);
    return 'invalid';
  }

  // Kode benar -> pakai lalu hapus (single-use)
  await supabase.from('verification_codes').delete().eq('id', row.id);
  return 'ok';
}
