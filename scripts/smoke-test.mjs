// Smoke test kontrak API auth — hanya jalur yang TIDAK menulis data baru ke DB.
// Pemakaian: node scripts/smoke-test.mjs  (server harus sudah jalan di :5001)
const base = 'http://localhost:5001/api/users';

const cases = [
  ['register password lemah (abc123)', 'POST', `${base}/register`, { username: 'doawahyudi', email: 'doa@gmail.com', password: 'abc123' }],
  ['register password tanpa simbol', 'POST', `${base}/register`, { username: 'doawahyudi', email: 'doa@gmail.com', password: 'abcdefgh1' }],
  ['register username terlalu pendek', 'POST', `${base}/register`, { username: 'ab', email: 'doa@gmail.com', password: 'Abc#12g34' }],
  ['register username karakter invalid', 'POST', `${base}/register`, { username: 'doa wahyu!', email: 'doa@gmail.com', password: 'Abc#12g34' }],
  ['register email format salah', 'POST', `${base}/register`, { username: 'doawahyudi', email: 'doa', password: 'Abc#12g34' }],
  ['register kolom kosong', 'POST', `${base}/register`, { username: 'doawahyudi', password: 'Abc#12g34' }],
  ['register password valid (Abc#12g34)', 'POST', `${base}/register`, { username: 'doawahyudi', email: 'doa@gmail.com', password: 'Abc#12g34' }],
  ['verify-otp field kosong', 'POST', `${base}/verify-otp`, { email: 'x@y.com' }],
  ['login field kosong', 'POST', `${base}/login`, { email: 'doa@gmail.com' }],
  ['forgot-password email kosong', 'POST', `${base}/forgot-password`, {}],
  ['change-password tanpa token', 'PUT', `${base}/change-password/00000000-0000-0000-0000-000000000000`, { oldPassword: 'x', newPassword: 'y' }],
];

let fail = 0;
for (const [label, method, url, body] of cases) {
  try {
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    console.log(`[${r.status}] ${label} -> ${JSON.stringify(j)}`);
  } catch (e) {
    console.log(`[ERR] ${label} -> ${e.message}`);
    fail = 1;
  }
}
process.exit(fail);
