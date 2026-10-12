# Photobooth Online

Photobooth gratis di browser untuk `photobooth.inwebsite.online`. Pengguna memilih layout strip, foto pakai kamera atau upload, menghias, lalu mengunduh.

- **Layout**: Strip 3 & 4, Kiri–Kanan 6/8/10 (dua strip di kertas 4R, isinya kembar atau beda, frame kiri & kanan bisa beda), Grid 4/6/8/9/10, Polaroid.
- **Bentuk foto**: landscape 4:3, portrait 3:4, kotak, 16:9, 4:5.
- **Ukuran hasil**: Cetak 300 dpi (strip 600×1800, 4R 1200×1800; opsi HD 2×), Story/Reels/TikTok 1080×1920,
  Feed IG 1080×1350, Kotak 1080×1080. Di format sosmed layout satu region disusun ulang otomatis (mis. strip 4 → 2×2 di kotak).
  Plus GIF live (tiap frame bergerak).
- **Hias**: 58 template frame — 23 dengan latar ilustrasi (generate Codex, `public/frames/`), sisanya digambar kode —
  14 filter, 514 stiker sprinkle InWebAsset + emoji, teks footer, tanggal, teks bebas. Stiker bisa digeser, dicubit dua jari,
  diputar, dan diatur urutan depan/belakang.
- **Patungan**: foto bareng teman dari jauh tanpa server. Satu orang mengisi sebagian frame lalu mengirim berkas patungan (.txt berisi JSON) lewat WhatsApp; temannya membuka berkas itu di web ini dan mengisi sisanya.
- **Kuota**: login (Google atau email + kata sandi lewat Auth0), gratis 5 strip/hari tanpa watermark (reset 00.00 WIB). Setelah itu tetap bisa unduh, tapi diberi watermark.

## Hemat biaya

Foto **tidak pernah** dikirim ke server. Semua komposisi strip, filter, dan GIF dikerjakan di browser.
Worker hanya melayani `/api/*` dan `/auth/*` (`run_worker_first`); halaman dan aset dilayani sebagai berkas statis
yang tidak dihitung request Worker.

| Aksi pengguna | Request Worker | D1 |
|---|---|---|
| Buka app tanpa login | 1 (`/api/me`) | 0 |
| Buka app saat login | 1 | 2 baca (versi sesi + kuota) |
| Login (Google: 2 request, email: 1) | 1–2 | 1 tulis + 1 baca |
| Unduh strip baru | 1 | 3–4 baca + 1 tulis |
| Unduh ulang / ganti format strip yang sama | 1 | 1–2 baca |

Stiker dimuat dari CDN InWebAsset.

## Login (skema asset.inwebsite.online)

Sama dengan `assetweb/worker/auth.ts`: Auth0 ditangani penuh oleh Worker, tanpa SDK.

- Halaman `/app/masuk`: tombol **Lanjutkan dengan Google** (`/auth/login?connection=google-oauth2`) dan form email + kata sandi
  (`POST /auth/email/{login,signup,reset}`, koneksi `Username-Password-Authentication`, akun email baru dapat sesi setelah emailnya dikonfirmasi).
- Alur authorization code + PKCE; state login di cookie bertanda tangan `pb_login` (Path=/auth, 10 menit).
- Sesi: cookie `__Host-pb_session` (lokal: `pb_session_dev`) berisi versi sesi akun; `POST /auth/logout` menaikkan
  `users.session_version` (keluar di semua perangkat) lalu keluar dari Auth0. `users.banned = 1` memblokir akun.
- Login berpindah halaman, padahal foto hanya ada di memori: sebelum pindah, foto sesi disimpan sementara di IndexedDB perangkat
  (`src/lib/stash.ts`) dan dipulihkan begitu kembali. Login email tidak berpindah halaman.
- Lokal tanpa Auth0 (`AUTH0_CLIENT_ID` kosong, `ENVIRONMENT=development`): login dev dengan nama saja.

## Struktur

```
worker/index.ts        API: /api/me, /api/strips (kuota) + akun D1
worker/auth.ts         login Auth0 (/auth/*), disalin dari assetweb
migrations/            skema D1 (users, strips)
src/lib/layouts.ts     definisi layout + hitung posisi slot
src/lib/templates.ts   50 template frame (pola, warna, bentuk slot, hiasan)
src/lib/render.ts      mesin render kanvas (pola, slot, teks, stiker, watermark)
src/lib/filters.ts     filter berbasis piksel (sama di semua browser)
src/lib/export.ts      unduh JPG/PNG, encoder GIF live
src/lib/patungan.ts    format berkas patungan
src/data/stickers.ts   katalog stiker sprinkle (tanpa makanan/minuman)
public/frames/         latar ilustrasi template: <id>.webp (1200×1800) + <id>-kecil.webp (thumbnail)
scripts/frames.py      olah PNG hasil generate → dua berkas webp di atas
src/pages/             Start (layout) → Capture (foto) → Edit (hias) → Result (unduh), Login (/app/masuk)
```

## Jalan di lokal

```bash
npm install
cp .dev.vars.example .dev.vars        # AUTH0_CLIENT_ID kosong = login dev (nama saja)
npm run db:migrate:local
npm run dev                            # http://localhost:5173/app
```

## Deploy

`npm run deploy`. Infrastruktur yang sudah ada (13 Okt 2026):

- Worker `photobooth`, custom domain `photobooth.inwebsite.online`.
- D1 `photobooth-db` (`a3bc346a-…`). Migrasi baru: `npm run db:migrate:remote`.
- Secret Worker: `SESSION_SECRET`, `AUTH0_CLIENT_SECRET`.
- Aplikasi Auth0 `photobooth` di tenant `nehard.us.auth0.com` (client ID di `wrangler.jsonc`):
  Regular Web Application, grant `authorization_code` + `password` + `http://auth0.com/oauth/grant-type/password-realm`
  (wajib untuk login email; tanpa grant ini /auth/email/login membalas 502), Trust Token Endpoint IP Header aktif,
  koneksi `google-oauth2` + `Username-Password-Authentication`.
  - Allowed Callback URLs: `https://photobooth.inwebsite.online/auth/callback, http://localhost:5173/auth/callback`
  - Allowed Logout URLs: `https://photobooth.inwebsite.online/, http://localhost:5173/`
  - Allowed Web Origins: `https://photobooth.inwebsite.online`

## Menambah latar ilustrasi

1. Generate gambar 2:3 (mis. 1024×1536) berpola merata ke seluruh kanvas, tanpa teks, tanpa makanan/minuman, tanpa orang.
   Foto akan menutupi bagian tengah, jadi yang terlihat hanya pinggir, sela antar foto, dan area tulisan.
2. Simpan sebagai `<id>.png` di satu folder, lalu `python scripts/frames.py <folder> [id ...]`.
3. Pakai di `src/lib/templates.ts`: `bg: { color, image: '<id>' }` (lihat `art(...)` dan `UPGRADES`).

## Catatan

- Watermark digambar di browser berdasarkan jawaban server. Pengguna biasa tidak bisa melewatinya, tapi orang yang
  paham kode bisa. Penyalahguna bisa diblokir lewat kolom `users.banned`.
- Belum dibuat: foto bareng **live** (P2P WebRTC), simpan & bagikan lewat link/QR (premium, butuh R2), pembayaran.
