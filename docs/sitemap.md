# Sitemap — InWebBooth (photobooth.inwebsite.online)

Terakhir diubah: 2026-10-24 · Stack: React 19 + Vite 8 + react-router 8 (data router) + Zustand + Tailwind 4, Cloudflare Worker + D1
Definisi route: `src/main.tsx` (`createBrowserRouter`) · shell: `src/components/AppShell.tsx` · API: `worker/index.ts`

Tidak ada landing page: `/` tetap langsung diarahkan ke `/app`. Seluruh produk adalah satu aplikasi alur 4 langkah
(Layout → Foto → Hias → Unduh) ditambah halaman masuk dan dua halaman tujuan link undangan. Rute tak dikenal
menampilkan keadaan 404 yang bisa kembali ke `/app`. Foto solo diproses di browser. Estafet menyimpan frame
terenkripsi sementara sampai empat jam; klaim privasi harus menjelaskan pengecualian ini.

## Peta route

```
/                       redirect → /app                                   → src/main.tsx
*                       Rute tak dikenal → 404 di shell aplikasi          → src/pages/NotFound.tsx (rencana)

/app                    AppShell (header + StepBar + tirai + sheet global) → src/components/AppShell.tsx
├── /app                Langkah 1 · Layout (Start)                         → src/pages/Start.tsx
├── /app/foto           Langkah 2 · Foto (Capture)         [lazy]          → src/pages/Capture.tsx
├── /app/hias           Langkah 3 · Hias (Edit)            [lazy]          → src/pages/Edit.tsx
├── /app/unduh          Langkah 4 · Unduh (Result)         [lazy]          → src/pages/Result.tsx
├── /app/masuk          Masuk / buat akun / reset (di luar 4 langkah) [lazy] → src/pages/Login.tsx
├── /app/bareng#<kode>  Tujuan link "foto bareng" (tamu)   [lazy]          → src/pages/Join.tsx
└── /app/estafet#<kode> Tujuan link estafet (penerus)      [lazy]          → src/pages/Estafet.tsx
```

Aturan perpindahan (guard) yang ada di kode:
- `/app/hias` dan `/app/unduh` → redirect ke `/app/foto` kalau belum ada satu foto pun (`Edit.tsx`, `Result.tsx`).
- `/app/bareng` → redirect ke `/app` kalau kode di hash < 6 karakter; ke `/app/foto` kalau pemilik ruang membukanya sendiri.
- `/app/estafet` → redirect ke `/app` kalau kode di hash < 10 karakter.
- `/app/masuk` → kalau sudah login, redirect ke `returnTo` (default `/app`, disaring `safeBack`).
- Pindah antar langkah selalu lewat tirai animasi (`useStepNav`, `src/components/Curtain.tsx`), bukan `navigate` langsung.
- Shell dan halaman tetap dapat dipakai saat pemulihan lokal/jaringan berjalan; setiap pemulihan yang gagal atau
  lambat menampilkan status/retry tanpa menahan seluruh aplikasi. Rute terjaga agar tidak merender state invalid.

### Endpoint server (bukan halaman)

Worker hanya dijalankan untuk `/api/*` dan `/auth/*`; halaman dan aset statis dilayani tanpa Worker (`wrangler.jsonc`).

| Endpoint | Fungsi | File |
|---|---|---|
| `GET /api/me` | user + kuota hari ini + opsi login | `worker/index.ts` |
| `POST /api/strips` | catat strip yang diunduh, jawab perlu watermark atau tidak | `worker/index.ts` |
| `GET/PUT/DELETE /api/rooms/:id` | titipan terenkripsi ruang foto bareng (tamu masuk saat pembuat keluar sebentar) | `worker/index.ts` |
| `POST/GET/DELETE /api/relays/:id`, `PUT/GET/DELETE …/frames/:n` | estafet: meta + foto terenkripsi per frame, TTL 4 jam | `worker/relay.ts` |
| `GET /auth/login`, `GET /auth/callback` | Google lewat Auth0 (code + PKCE) | `worker/auth.ts` |
| `POST /auth/email/{login,signup,reset}` | email + kata sandi | `worker/auth.ts` |
| `POST /auth/logout`, `POST /auth/dev` | keluar semua perangkat; login dev lokal | `worker/auth.ts` |
| cron tiap menit | hapus estafet > 4 jam dan titipan ruang yang ditinggal | `worker/index.ts` (`scheduled`) |

## Navigasi

- **Header (semua halaman `/app/*`)**: logo (ke `/app` lewat tirai; ikon saja di HP, logo horizontal di ≥ sm) · `StepBar` 4 langkah di tengah · tombol akun di kanan.
  - `StepBar` (`src/components/StepBar.tsx`) hanya penanda, bukan tautan. Di halaman luar 4 langkah (`/app/masuk`, `/app/bareng`, `/app/estafet`) tidak ada langkah yang menyala. Di HP < 640px hanya langkah aktif yang berlabel.
  - Tombol akun: belum login → "Masuk" → `/app/masuk?returnTo=<halaman sekarang>`; sudah login → sisa kuota `n/5` → buka `AccountSheet`.
- **Footer**: tidak ada.
- **Sheet global** (dipasang di `AppShell`, dibuka lewat state `useUi`/`useRoom`, `src/components/Sheet.tsx`):
  - `AccountSheet` — nama, email, kuota, tombol Keluar → `src/components/LoginSheet.tsx`
  - `InviteSheet` — link ruang foto bareng → `src/components/Room.tsx`
  - `EstafetStartSheet` — mulai estafet → `src/components/Estafet.tsx`
- **Navigasi antar langkah** (tombol di halaman): Layout `Mulai foto →` · Foto `Lanjut hias →` · Hias `← Foto` / `Selesai, unduh →` · Unduh `← Hias lagi` / `Foto lagi`.

## Isi tiap halaman

| Route | Tujuan | Section (urut, atas ke bawah) |
|---|---|---|
| `/app` | Pilih layout dan mulai solo atau kolaborasi | Hero + preview · layout rekomendasi dan kategori semua 11 layout · Sesuaikan (format, rasio, template, kiri/kanan) · satu entry foto jauh (live/estafet; patungan sebagai fallback) · bar bawah tetap `Mulai foto →` |
| `/app/foto` | Ambil foto (kamera/upload) ke frame | Mobile: kamera/shutter/progress/retake lebih dulu, kontrol sekunder dapat dilipat, lanjut hias mudah dijangkau; desktop: kamera + sidebar · recovery kamera dan status privasi sesuai mode |
| `/app/hias` | Hias strip: frame, filter, stiker, teks, atur | Kanvas + toolbar · lima tab tetap · panel mobile dapat diatur · undo/redo dan operasi keyboard · peringatan sebelum perubahan yang membuang overlay · tombol `← Foto` / `Selesai, unduh →` |
| `/app/unduh` | Unduh hasil | Preview aksesibel + judul selesai · aksi unduh utama mudah dijangkau · JPG/PNG/GIF kondisional · quota dan pratinjau watermark · share native/fallback unduh · tanpa teaser fitur yang belum tersedia |
| `/app/masuk` | Login | Maskot kucing · tab Masuk/Buat akun · Google · form email · mode dev (lokal) · alasan unduh perlu login · status pemulihan dan retry · `← Kembali` |
| `/app/bareng#kode` | Tamu masuk ruang | Loading/ready/offline/host-left/expired dibedakan · kartu undangan (strip, anggota, nama) · `Masuk & foto →` · retry atau berkas patungan |
| `/app/estafet#kode` | Penerus estafet | Loading/active/partial/complete/offline/expired dibedakan · kartu strip, jatah, sisa waktu, nama · `Isi bagianku →` · hapus menunggu konfirmasi Worker |
| 404 dalam shell | Pulih dari route tak dikenal | Pesan rute tidak ditemukan · aksi kembali ke `/app`; route `/` tetap redirect, bukan 404 |

Isi pilihan yang tetap (dari kode):
- **Layout (11)**: Strip 3, Strip 4, Kiri–Kanan 6/8/10, Grid 4/6/8/9/10, Polaroid — `src/lib/layouts.ts`.
- **Bentuk foto (5)**: Landscape 4:3, Portrait 3:4, Kotak 1:1, Lebar 16:9, Tinggi 4:5.
- **Ukuran hasil (4)**: Cetak 300 dpi (HD 2× opsional), Story/Reels/TikTok 1080×1920, Feed IG 1080×1350, Kotak 1080×1080.
- **Template frame**: kategori Simpel, Pastel, Lucu, Retro, Elegan, Gelap, Musiman, Pola + Ilustrasi — `src/lib/templates.ts`.
- **Filter**: 14 — `src/lib/filters.ts`. **Stiker**: emoji + paket sprinkle InWebAsset dari CDN — `src/data/stickers.ts`.

## Alur utama

1. **Sendiri**: `/app` → `/app/foto` → `/app/hias` → `/app/unduh`.
2. **Foto bareng live**: pembuat ruang tekan `Ajak lewat link` (di `/app` atau kartu ruang) → `InviteSheet` → kirim link WhatsApp/bagikan/salin → teman buka `/app/bareng#kode` → `Masuk & foto →` → `/app/foto` (frame berwarna per orang). Foto lewat WebRTC (Trystero); ruang hidup selama tab pembuat terbuka.
3. **Estafet** (tidak perlu online barengan): `Mulai estafet` → `EstafetStartSheet` (jatah frame/orang + peringatan 4 jam) → `/app/foto` → kirim link → penerus buka `/app/estafet#kode` → isi bagian → teruskan; strip penuh → `Hias & unduh →`. Berakhir 4 jam setelah dibuat.
4. **Patungan (berkas, cadangan)**: kirim berkas `.txt` lewat WhatsApp (`src/lib/patungan.ts`, `src/lib/share.ts`) → teman buka lewat tombol `Buka berkas dari teman` di `/app` (atau cadangan di `/app/bareng`) → `/app/foto`.
5. **Login lalu kembali**: tombol Masuk menyimpan foto aktif, foto cadangan, dan state desain ke IndexedDB (`src/lib/stash.ts`), pindah ke `/app/masuk` (atau redirect Auth0 untuk Google), lalu state dipulihkan dan stash dihapus hanya setelah berhasil.

## Dashboard

Tidak ada. Satu-satunya area akun adalah `AccountSheet` (nama, email, sisa kuota, Keluar).
- Autentikasi: Google atau email + kata sandi lewat Auth0 yang ditangani Worker (`worker/auth.ts`); sesi = cookie `__Host-pb_session`. Lokal tanpa Auth0: login dev dengan nama saja.
- Peran: tidak ada peran. Pembeda hanya tamu (belum login, tidak bisa unduh) dan user login (kuota). Di ruang foto bareng ada peran host/guest (`useRoom().role`), bukan peran akun.

## Konversi

- **CTA utama**: `Mulai foto →` (`/app`, bar bawah tetap) lalu `Selesai, unduh →` (`/app/hias`) lalu `Unduh JPG` (`/app/unduh`).
- **Gerbang unduh**: tanpa login, tombol Unduh mengarah ke `/app/masuk?returnTo=/app/unduh`. Login: gratis 5 strip/hari tanpa watermark (reset 00.00 WIB, `DAILY_LIMIT`); setelah habis tetap bisa unduh, diberi watermark. Strip yang sama (`stripId`) tidak memakan jatah dua kali.
- **Form**: hanya form login/daftar/reset di `/app/masuk` (ke `/auth/email/*`) dan isian nama di sheet/halaman undangan. Tidak ada form kontak.
- **Pembayaran/premium**: belum ada; tidak ada aksi/teaser yang tampak seperti fitur aktif.

## Belum dibangun / menunggu

- Simpan & bagikan strip lewat link/QR (premium, butuh R2), pembayaran — baru teaser di `Result.tsx`.
- Landing page: sengaja belum ada (`/` → `/app`).
- Rute tak dikenal memakai halaman 404 di dalam shell; `/` sengaja tetap redirect ke `/app`.
