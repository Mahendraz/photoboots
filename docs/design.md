# InWebBooth: Design System

InWebBooth (photobooth.inwebsite.online) adalah produk InWebsite, jadi identitas visualnya **ikut design
system InWebsite** v3 "Tenang & Terpercaya". Sumber kebenarannya `design.md` di repo in-website
(`C:\WORK\github\InWeb\in-website\design.md`). Dokumen ini hanya mencatat cara aturan itu dipetakan ke
app ini, plus bagian yang sengaja berbeda. Kalau keduanya bertentangan soal warna, tipografi, radius, atau
tombol, yang benar adalah design.md InWebsite: perbarui dokumen dan kode di sini.

Diadopsi 2026-10-15. Sebelumnya app memakai palet playful (krem `#fff7ec`, pink `#ff4f6d`, kuning, biru
muda, mint), heading Fredoka, dan tombol bergaya stiker (garis tinta 2px + bayangan keras).

## Aturan inti yang diikuti

1. **Satu aksen: biru `#0B5FFF`** (`accent`). Untuk tombol utama, langkah aktif, pilihan aktif, tautan,
   dan cincin fokus. Bukan dekorasi.
2. **Netral hangat**, bukan abu-abu dingin: halaman `#FBFAF8`, kartu putih, garis `#E3DFD8`.
3. **Tidak ada gradient brand.** Latar kanvas Hias dulunya radial krem; sekarang `bg-subtle` polos.
4. **Plus Jakarta Sans** untuk heading (`font-heading`, h1–h3 otomatis), **Inter** untuk teks dan UI.
5. **Kedalaman dari garis tipis + bayangan halus** (`shadow-sm/md/lg`), bukan garis tinta tebal.
6. **Light mode saja.**

## Token (`src/index.css`, `@theme`)

| Kelas Tailwind | Hex | Token InWebsite |
|---|---|---|
| `bg-bg` | `#FBFAF8` | `--bg` |
| `bg-bg-subtle` | `#F2F0EC` | `--bg-subtle` (kanvas Hias, kotak info) |
| `bg-surface` | `#FFFFFF` | `--surface` (header, kartu, panel) |
| `border-border` | `#E3DFD8` | `--border` |
| `border-border-strong` | `#C9C3B8` | `--border-strong` (hover, garis putus-putus) |
| `text-text` | `#14181F` | `--text` |
| `text-muted` | `#5A6472` | `--text-muted` |
| `bg-inverse` | `#0D1117` | `--bg-inverse` (jendela kamera) |
| `text-inverse-muted` | `#A3ACBA` | `--text-inverse-muted` |
| `bg-accent` / `text-accent` | `#0B5FFF` | `--accent` |
| `accent-hover` | `#0A4FD6` | `--accent-hover` (hover, tulisan di atas `accent-subtle`) |
| `bg-accent-subtle` | `#E8F0FF` | `--accent-subtle` (latar pilihan aktif, badge). Latar saja, bukan teks. |
| `text-success` / `text-warning` / `text-danger` | `#1B7A4B` / `#8A5A00` / `#C62828` | sama |
| `bg-warning-subtle` | `#FBF1DC` | `--warning-subtle` (catatan watermark) |

Hex mentah hanya boleh di `@theme`, kecuali nilai yang harus dianimasikan GSAP (pil tab Hias:
`PILL`/`PILL_INK` di `pages/Edit.tsx`, harus sama dengan `accent-subtle`/`accent-hover`).

## Komponen

- **Tombol**: `btn` = sekunder (putih, garis `border`, hover `bg-subtle`); `btn btn-primary` = biru solid.
  Tinggi 44px, sudut 10px, weight 600, tanpa bayangan, tekan turun 1px. Satu tombol primer per area.
- **Kartu**: `card` = putih, garis 1px `border`, sudut 16px, `shadow-sm`.
- **Pilihan aktif** (layout, ukuran, template, filter, huruf): `border-accent bg-accent-subtle`. Tidak aktif:
  `border-border bg-surface hover:border-border-strong`.
- **Chip / segmen aktif** (kategori, bentuk foto, sisi kiri/kanan, ukuran hasil, tab masuk): `bg-accent text-white`.
- **Langkah header**: pil aktif biru, garis penghubung terisi biru, langkah selesai jadi centang tinta.
- **Tab Hias**: pil `accent-subtle` dengan ikon clay InWebAsset; tulisan aktif `accent-hover`, lainnya `muted`.
- **Input**: `rounded-md border border-border bg-surface`, fokus cincin aksen (global `:focus-visible`).
- **Error** `text-danger`, tautan `text-accent`, peringatan `bg-warning-subtle text-warning`.
- **Dialog / lembar bawah**: latar `bg-black/50 backdrop-blur-sm`, isi `card`.
- **Tirai antar langkah**: panel biru aksen (selang-seling sedikit lebih gelap), lencana putih dengan simbol logo.

## Logo

Set lengkap di `docs/brand/inwebbooth/` (format sama dengan keluarga InWeb di
`InWeb/docs/brand/four-batches-inkfix-2026-10-02/`): simbol kamera + strip foto `#0B5FFF` di kedua tema,
wordmark "InWebBooth" Plus Jakarta Sans 700, `#14181F` (terang) / putih (gelap). Varian horizontal,
stacked, dan mark; ekspor siap pakai di `ready/` (PNG/WebP/ICO/SVG). Yang dipasang di app ada di
`public/brand/inwebbooth/`; favicon dan apple-touch-icon di `public/`.

- Header: `logo-horizontal-light.svg` setinggi `h-10` (rasio 469:116) mulai `sm`; di bawahnya simbol saja.
- Logo dibuat dari kode (`docs/brand/inwebbooth/source/build.mjs`), bukan generate AI, supaya bisa dibangun
  ulang persis. Kandidat lain yang tidak dipakai: `source/candidates.png`.

## Pengecualian: isi strip

Seperti snippet di InWebAsset, **isi strip adalah produknya, bukan brand**. Aturan warna dan font di atas
tidak berlaku untuk: template frame (`lib/templates.ts`, latar `public/frames/`), stiker sprinkle, palet
warna teks di tab Teks, dan font strip (Fredoka, Baloo 2, Pacifico, Bebas Neue, dll. yang dimuat di
`index.html`). Watermark tetap `photobooth.inwebsite.online`.

## Perbedaan yang disengaja dari InWebsite

1. **Maskot kucing** di halaman masuk tetap ada (karakter, bukan dekorasi aksen), badannya biru `#0B5FFF`
   agar senada dengan simbol logo.
2. **Gerak lebih "aplikasi"**: tirai, pil melar, dan percikan tombol unduh dari snippet InWebAsset tetap
   dipakai karena itu umpan balik aksi, bukan dekorasi halaman.
3. **Inter dimuat 400/600/700** (InWebsite hanya 400/600) karena label UI app ini banyak memakai `font-bold`.
4. **Ukuran teks** memakai skala Tailwind biasa (`text-sm`, `text-xs`); kelas `text-*-mobile` InWebsite
   belum diterapkan di app ini.
