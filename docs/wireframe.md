# Wireframe — InWebBooth

Terakhir diubah: 2026-10-23 · Peta route dan isi halaman: `docs/sitemap.md` · Desain visual: `docs/design.md` (bukan bagian dokumen ini)

Shell: semua halaman `/app/*` ada di dalam `AppShell` (tinggi layar penuh: header tetap + `<main>` yang memuat halaman).
Tirai antar langkah (`Curtain`) menutup `<main>` saat pindah halaman.

## Shell — `/app/*`

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER — logo · StepBar ①Layout ②Foto ③Hias ④Unduh · [akun]    │
│          → AppShell.tsx · StepBar.tsx · Logo.tsx              │
│  ▸ garis tergambar ke langkah berikut, angka jadi centang      │
├──────────────────────────────────────────────────────────────┤
│ MAIN (relative) — <Outlet/> halaman + <Curtain/>               │
│  ▸ tirai 7 panel turun dari sisi yang diklik, logo berputar    │
│    → Curtain.tsx                                               │
└──────────────────────────────────────────────────────────────┘
 + AccountSheet · InviteSheet · EstafetStartSheet (lihat Sheet)
Mobile: logo jadi ikon saja; label langkah non-aktif disembunyikan;
        tombol akun menampilkan sisa kuota "n/5" (atau "Masuk").
```

## /app — Langkah 1 · Layout

```
┌──────────────────────────────────────────────────────────────┐
│ H1 "Mau strip yang mana?" · 1 kalimat petunjuk                 │
│ [banner "Kamu lagi di ruang…" + [Keluar ruang]]  (kalau ada)   │
├──────────────────────────────────────────────────────────────┤
│ UKURAN HASIL — FormatPicker, grid 2 kolom (4 kolom ≥ lebar     │
│   wadah 3xl): Cetak · Story/Reels/TikTok · Feed IG · Kotak     │
│   → components/FormatPicker.tsx                                │
├──────────────────────────────────────────────────────────────┤
│ LAYOUT — grid 3/4/6 kolom, 11 kartu MiniStrip + nama + desc    │
│   (terkunci kecuali yang aktif saat tamu/estafet)              │
│   → components/MiniStrip.tsx                                   │
├──────────────────────────────────────────────────────────────┤
│ BENTUK FOTO — 5 pil │ STRIP KIRI & KANAN — kembar/beda        │
│   (kolom kanan hanya untuk layout Kiri–Kanan)  grid 2 kolom    │
├──────────────────────────────────────────────────────────────┤
│ TEMPLATE FRAME — FramePicker: pil kategori (scroll) + grid     │
│   thumbnail 4/6/8 kolom; toggle Sama/Kiri/Kanan (2 strip)      │
│   → components/FramePicker.tsx                                 │
├──────────────────────────────────────────────────────────────┤
│ FOTO BARENG TEMAN DARI JAUH (kotak abu)                        │
│   · [Ajak lewat link] → openInvite → /app/foto                 │
│   · [Mulai estafet] → EstafetStartSheet                        │
│   · PatunganGuide (panduan bergambar 4 langkah + contoh)       │
│   · [Buka berkas dari teman] (input file .txt) + pesan galat   │
│   → components/Room.tsx · Estafet.tsx · PatunganGuide.tsx      │
├──────────────────────────────────────────────────────────────┤
│ BAR BAWAH TETAP — "<Layout> · n foto · ukuran"  [Mulai foto →] │
└──────────────────────────────────────────────────────────────┘
Mobile: grid layout 3 kolom, bar bawah tetap menyesuaikan safe-area;
        kolom "Bentuk foto" dan "Kiri & kanan" tumpuk jadi satu kolom.
State: openFile gagal = teks merah di bawah tombol berkas; opening = tombol "Menyiapkan…".
```

## /app/foto — Langkah 2 · Foto

```
┌───────────────────────────────┬──────────────────────────────┐
│ KAMERA (kiri, flex-1)          │ PANEL SAMPING (lg: 320px)     │
│  video + rasio bentuk foto     │  KARTU FRAME "Frame n/total"  │
│  · CameraGate (izin/galat)     │   badge bareng/estafet/patung.│
│  · angka hitung mundur besar   │   deret thumbnail frame       │
│  · kilat putih saat jepret     │   (warna + nama pemilik, "live│
│  · pil "● n/total" saat jalan  │   "/"teman", % transfer)      │
│  → pages/Capture.tsx           │   [Kosongkan frame n]         │
│    components/CameraGate.tsx   │   GANTI LAYOUT (LayoutSwitch) │
│ TOMBOL: [Upload] [Mulai foto/  │  KARTU PENGATURAN (buka/tutup)│
│  Foto n frame sisa/Berhenti]   │   hitung mundur 3/5/10 · jeda │
│  [Ganti kamera]                │   1/2/3/5 · cermin · suara ·  │
│ catatan galat (merah)          │   rekam live                  │
│                                │  KARTU RUANG / ESTAFET        │
│                                │   RoomCard | EstafetCard      │
│                                │  [Lanjut hias →] (n kosong)   │
│                                │  "<layout> · foto tidak       │
│                                │   pernah diunggah ke server"  │
└───────────────────────────────┴──────────────────────────────┘
Mobile/tablet: kamera di atas, panel di bawah (satu kolom); deret frame jadi
               satu baris geser horizontal.
State: kamera gagal = CameraGate tampil pesan + [Upload] [Coba lagi];
       frame milik orang lain tidak bisa dipilih (catatan "Frame n punya <nama>");
       tamu/estafet: LayoutSwitch diganti catatan "layout diatur pembuat ruang";
       host kelebihan orang: LayoutSwitch terbuka sendiri + peringatan kuning.
```

## /app/hias — Langkah 3 · Hias

Redirect ke `/app/foto` kalau belum ada foto.

```
┌───────────────────────────────────────┬──────────────────────┐
│ EDITOR (flex-1, bg subtle)             │ PANEL ALAT (lg: 400px)│
│  StripEditor: strip hasil + stiker     │  PillTabs 5 tab:      │
│  yang bisa digeser, dicubit, diputar   │   Frame·Filter·Stiker │
│  → components/StripEditor.tsx          │   ·Teks·Atur          │
│ TOOLBAR STIKER TERPILIH (muncul di     │  ISI TAB (scroll):    │
│  bawah strip, scroll horizontal):      │   Frame  = FramePicker│
│  − + ⟲ ⟳ [Ke depan] [Ke belakang]      │   Filter = grid 4–5   │
│  [Hapus]                               │     kolom, thumbnail  │
│                                        │     foto pertama      │
│                                        │   Stiker = baris emoji│
│                                        │     + pil paket + grid│
│                                        │     5–6 kolom sprinkle│
│                                        │   Teks   = tulisan    │
│                                        │     bawah strip, tgl, │
│                                        │     huruf, warna,     │
│                                        │     teks bebas        │
│                                        │   Atur   = ukuran     │
│                                        │     hasil, bentuk     │
│                                        │     foto, kembar/beda,│
│                                        │     Ganti layout,     │
│                                        │     Hapus semua stiker│
│                                        │  [← Foto][Selesai,    │
│                                        │   unduh →]            │
└───────────────────────────────────────┴──────────────────────┘
→ pages/Edit.tsx · components/PillTabs.tsx · StripEditor.tsx · FramePicker.tsx
Mobile: editor di atas, panel alat di bawah dengan tinggi tetap 46dvh (toolbar
        stiker ditaruh di bawah strip, bukan di panel, supaya daftar stiker tidak tertutup).
        Strip diperbesar mengikuti lebar kolom editor (kolom ini min-w-0).
State: tab awal = Stiker; Teks berubah jadi "Edit teks yang dipilih" saat teks bebas dipilih;
       "Mode Beda butuh foto lebih banyak" muncul di tab Atur kalau ada frame kosong;
       tamu/estafet: pilihan kembar/beda terkunci.
```

## /app/unduh — Langkah 4 · Unduh

Redirect ke `/app/foto` kalau belum ada foto.

```
┌───────────────────────────────┬──────────────────────────────┐
│ PRATINJAU (flex-1)             │ PANEL (lg: 384px)             │
│  MiniStrip hasil akhir,        │  KARTU HASIL                  │
│  skala mengikuti kotak         │   H1 "Strip-mu sudah jadi!"   │
│  → pages/Result.tsx            │   QuotaBar (login) | ajakan   │
│                                │   masuk (belum login)         │
│                                │   peringatan watermark        │
│                                │   Ukuran: px + pil 4 format   │
│                                │   (+ centang HD 2× untuk cetak)│
│                                │   [Unduh JPG] [Unduh PNG]     │
│                                │   [Unduh GIF live ✨] (ada    │
│                                │    foto live)                 │
│                                │   [Bagikan / simpan ke galeri]│
│                                │   galat · catatan cetak       │
│                                │  KARTU RUANG (RoomCard)       │
│                                │  TEASER "Segera: simpan &     │
│                                │   bagikan lewat link/QR"      │
│                                │  [← Hias lagi] [Foto lagi]    │
└───────────────────────────────┴──────────────────────────────┘
→ components/SparkleButton.tsx (percikan saat selesai) · LoginSheet.tsx (QuotaBar)
Mobile: pratinjau di atas (min 45dvh), panel di bawah.
State: belum login, tekan Unduh → /app/masuk?returnTo=/app/unduh;
       tombol "Membuat…" / "Membuat GIF… n%"; 401 → ke halaman masuk;
       "Foto lagi" keluar dari ruang dan mengosongkan foto.
```

## /app/masuk — Login

```
┌──────────────────────────────────────────────────────────────┐
│ (maskot kucing di atas kartu: tutup mata di kolom sandi,       │
│  senang di tombol utama)  → components/Mascot.tsx              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ H1 "Masuk ke InWebBooth" / "Buat akun…" / "Reset kata     │ │
│ │ sandi kamu" · 1 kalimat jelasan kuota                     │ │
│ │ [tab Masuk | Buat akun]                                   │ │
│ │ [Lanjutkan dengan Google]                                 │ │
│ │ ── atau gunakan email kamu ──                             │ │
│ │ (Nama opsional—daftar) Email · Kata sandi + "Lupa kata    │ │
│ │ sandi?" · [Masuk | Buat akun | Kirim tautan reset]        │ │
│ │ Mode pengembangan (hanya lokal): nama + [Masuk]           │ │
│ │ galat / pemberitahuan (aria-live)                         │ │
│ └──────────────────────────────────────────────────────────┘ │
│ [← Kembali]                                                    │
└──────────────────────────────────────────────────────────────┘
→ pages/Login.tsx · lib/api.ts
Mobile: kartu max-w-sm di tengah, sama di semua lebar.
State: "Memuat…" sebelum /api/me; "Login belum dikonfigurasi di server." kalau
       Auth0 mati dan bukan dev; galat dari callback lewat ?galat=; sudah login → redirect.
```

## /app/bareng#kode — Undangan foto bareng

```
┌──────────────────────────────────────────────────────────────┐
│ (tengah vertikal, max-w-md)                                    │
│ KARTU UNDANGAN (status ready/host-left):                       │
│  "Foto bareng dari jauh" · H1 "<host> ngajak kamu foto bareng" │
│  [MiniStrip 112×176]  nama layout · "n frame · m masih kosong" │
│                       chip anggota (MemberChip)                │
│  input "Namamu"                                                │
│  (host-left) kotak biru "lagi keluar sebentar…"                │
│  (frame penuh) kotak kuning "minta host ganti layout"          │
│  [Masuk & foto →] · "Foto dikirim langsung… tidak disimpan"    │
│ KARTU MENYAMBUNG (selain itu):                                 │
│  spinner · "Menyambung ke ruang foto…"                         │
│  (lambat) penyebab + [Coba lagi] [Pakai berkas patungan]       │
└──────────────────────────────────────────────────────────────┘
→ pages/Join.tsx · components/Room.tsx (MemberChip)
Mobile: sama (satu kolom).
```

## /app/estafet#kode — Penerus estafet

```
┌──────────────────────────────────────────────────────────────┐
│ (tengah vertikal, max-w-md)                                    │
│ MEMUAT: spinner "Membuka estafet foto…"                        │
│ BERAKHIR (gone/expired/bukan estafet): "Estafet ini sudah      │
│   berakhir" + [Bikin strip sendiri] → /app                     │
│ KARTU ESTAFET:                                                 │
│  "Estafet foto" · H1 berubah per keadaan (diundang / lanjutkan │
│  / bagianmu sudah masuk / strip sudah penuh)                   │
│  [MiniStrip]  layout · "x/y frame terisi · jatah n per orang"  │
│               chip pemilik frame                               │
│  input "Namamu" (hilang kalau strip penuh)                     │
│  EstafetWarning (link 4 jam, sampai jam …)                     │
│  [Isi bagianku → | Lihat strip-nya → | Lihat, hias & unduh →]  │
│  "Sisa … sebelum semua foto dihapus."                          │
└──────────────────────────────────────────────────────────────┘
→ pages/Estafet.tsx · components/Estafet.tsx
Mobile: sama (satu kolom). Tombol utama ke /app/hias kalau strip penuh, selain itu /app/foto.
```

## Sheet global (dialog)

`Sheet` = lembar bawah di HP, dialog tengah di ≥ sm (`src/components/Sheet.tsx`). Tutup lewat klik latar atau Esc.

```
AccountSheet "Akun kamu"          → components/LoginSheet.tsx
  halo <nama> · email · QuotaBar · [Keluar] · "mengakhiri sesi di semua perangkat"

InviteSheet "Ajak teman foto bareng"   → components/Room.tsx
  input nama · link ruang + [Salin] · [Kirim lewat WhatsApp] · [Bagikan ke aplikasi lain]
  · daftar 3 poin jaminan · "Di ruang sekarang" chip anggota
  · (ada foto) "Kirim berkas patungan saja"

EstafetStartSheet "Mulai estafet foto"  → components/Estafet.tsx
  jelasan · pilih jatah per orang (1–3 frame) + hitung orang · input nama
  · EstafetWarning 4 jam · catatan enkripsi · [Paham, mulai estafet →] · galat
```

## Kartu pendamping (dipakai di beberapa halaman)

| Kartu | Muncul di | Isi | File |
|---|---|---|---|
| `RoomCard` (di luar ruang) | `/app/foto`, `/app/unduh` | ajakan + [Ajak lewat link] + [Estafet lewat link] + panduan + tautan berkas patungan | `components/Room.tsx` |
| `RoomCard` (di ruang) | `/app/foto`, `/app/unduh` | status online, chip anggota, [Ajak teman], [Keluar ruang] | `components/Room.tsx` |
| `EstafetCard` | `/app/foto` (mode estafet) | sisa waktu, kemajuan, jatah, kirim link, [Hias & unduh →], [Hapus sekarang]/[Keluar] | `components/Estafet.tsx` |
| `PatunganGuide` / `PatunganHelp` | `/app` (inline), kartu ruang (sheet "Lihat caranya") | contoh skenario + 4 langkah bergambar | `components/PatunganGuide.tsx`, `PatunganHelp.tsx` |
