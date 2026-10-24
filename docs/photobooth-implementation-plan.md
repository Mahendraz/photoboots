# Rencana Implementasi InWebBooth

Tanggal: 24 Oktober 2026  
Ruang lingkup: P0 dan P1 pada master prompt. P2 tidak dikerjakan.

## Proposal perubahan sitemap dan wireframe (sebelum → sesudah)

| Area | Sebelum (`docs/sitemap.md` / `docs/wireframe.md`) | Sesudah yang diusulkan |
|---|---|---|
| `/` → `/app` | Redirect tetap; Start menampilkan format, 11 layout, bentuk, kiri/kanan, template, live room, estafet, patungan sekaligus. | Redirect tetap. Start: hero + preview, layout rekomendasi terpilih, kategori untuk menemukan seluruh 11 layout; bagian Sesuaikan untuk format/rasio/template/kiri-kanan; satu entry “Foto bareng dari jauh?” yang membuka pilihan live/estafet dan fallback patungan; sticky CTA tetap. |
| `/app/foto` | Kamera di atas panel panjang pada mobile; lanjut hias setelah deret kontrol; copy menyatakan foto tidak pernah diunggah, termasuk ketika sedang di estafet. | Urutan mobile: preview/shutter, progress, frame terakhir dan foto ulang, kontrol sekunder yang dapat dilipat, lanjut hias yang mudah dijangkau. Desktop camera + sidebar tetap. Recovery kamera/reconnect dan copy privasi spesifik mode. |
| `/app/hias` | Strip + panel dengan tinggi mobile tetap 46dvh; lima tab; belum ada undo/redo; ganti layout dapat membersihkan overlay. | Lima tab tetap; panel bisa diatur pada layar pendek, aksi undo/redo dan operasi keyboard, pilihan berbahaya memberi konfirmasi, tab/preview dilabeli aksesibel; layout/overlay pulih dalam navigasi yang didukung. |
| `/app/unduh` | Preview besar lalu panel aksi; tombol muncul lebih bawah; teaser link/QR “Segera”. | Preview aksesibel, judul selesai, aksi unduh utama tetap terlihat di mobile, JPG/PNG dan GIF kondisional, quota/watermark jelas sebelum ekspor, share punya fallback aktual, teaser link/QR yang belum berfungsi dihapus. Login tetap wajib sebelum unduh. |
| `/app/masuk` | Login email/Google dan returnTo sudah ada; error pemulihan tidak selalu terlihat. | Layout login tetap; alasan wajib login jelas; status stash/pemulihan dan retry disampaikan, fokus dan live-region benar. Foto/editor state dipulihkan. |
| `/app/bareng#kode` | Status connecting/ready/host-left; error umum dapat dianggap expired. | Route/hash sama; state ready, offline, timeout, host-left, frame penuh, dan expired dibedakan; retry dan patungan fallback tersedia; kepemilikan tetap benar. |
| `/app/estafet#kode` | Route/hash sama; status expired dan TTL; penghapusan lokal dapat tampak selesai sebelum Worker mengonfirmasi. | Route/hash dan TTL 4 jam tetap; loading/offline/server error/expired terpisah; frame dan owner tersinkron; penghapusan menunggu konfirmasi; metadata GET tidak membocorkan kredensial kepemilikan. |
| Sheet dan shell | Dialog tanpa trap/restore focus; shell menunggu proses recovery berantai. | Sheet mengelola fokus penuh; loading recovery tampil di shell tanpa mengunci rute, dengan batas waktu dan retry. Rute `/` dan fallback tetap. |

Proposal di atas sesuai dengan target UX dan aturan dalam master prompt yang user minta untuk dikerjakan. Persetujuan implementasi diberikan oleh permintaan user pada 24 Oktober 2026 (“kerjakan plan masterpromt ini … semuanya terimplement sekaligus”); sitemap dan wireframe diperbarui sebelum implementasi source code.

## Tahap dan file

### Tahap 1 — Dokumen dan baseline

- Selesaikan empat dokumen audit/produk/implementasi/test matrix.
- Perbarui bagian terkait di `docs/sitemap.md`, `docs/wireframe.md`, dan `docs/design.md` sebelum kode.
- Baseline awal: `npm run typecheck` dan `npm run build` tersedia; saat itu belum ada runner tes. Vitest ditambahkan kemudian agar aturan Worker/store dapat dites otomatis.

### Tahap 2 — P0 state, ekspor, dan kamera

- `src/lib/stash.ts`, `src/lib/room.ts`, `src/store.ts`: simpan/pulihkan `photos`, `sparePhotos`, dan state edit; hapus stash hanya sesudah pemulihan berhasil.
- `src/pages/Result.tsx`, `worker/index.ts`: generate sebelum quota claim; atomikkan claim quota dan pertahankan `stripId`.
- `src/pages/Capture.tsx`: pastikan video siap dan frame terbaca; cegah burst menulis setelah dibatalkan; pertahankan retake per frame dan upload.
- `src/pages/Edit.tsx`, `src/store.ts`: konfirmasi/undo sebelum tindakan yang menghilangkan overlay.
- Penerimaan: login/refresh/room restore menjaga foto aktif dan `sparePhotos`; render gagal tidak memakai quota; empat foto bisa diisi dan satu diulang tanpa mengubah lainnya.

### Tahap 3 — P0 pengalaman ponsel dan navigasi

- `src/pages/Start.tsx`, `src/components/FramePicker.tsx`, `src/components/FormatPicker.tsx`, `src/components/Room.tsx`, `src/components/Estafet.tsx`: rekomendasi + kategori + sesuaikan + entry kolaborasi.
- `src/pages/Capture.tsx`: susun ulang kontrol responsif dan status kamera.
- `src/pages/Edit.tsx`, `src/components/StripEditor.tsx`: panel mobile fleksibel, lima tab tetap, perbaiki gestur dan jalur keyboard.
- `src/pages/Result.tsx`: aksi unduh utama mudah dijangkau; validasi preview watermark/share; hapus tautan palsu.
- Penerimaan: semua fitur lama dapat ditemukan; 320, 390, tablet, desktop tanpa overflow halaman; CTA utama dapat dipakai tanpa scroll panjang.

### Tahap 4 — P1 keamanan dan kolaborasi

- `worker/relay.ts`, `src/lib/relay.ts`: hilangkan paparan identitas yang bisa dipakai ulang; ikat write/delete dan quota; tes tampering, owner, dan guest; jangan mengubah TTL/link tanpa alasan.
- `src/lib/relay.ts`, `src/components/Estafet.tsx`, `src/pages/Estafet.tsx`: tampilkan sukses hapus hanya setelah server mengonfirmasi; bedakan expiry/offline/error.
- `src/lib/room.ts`, `worker/index.ts`: tinjau identitas peer dan klaim quota; lakukan perubahan minimum yang bisa dibuktikan kompatibel.
- `src/pages/Capture.tsx`, `src/components/AppShell.tsx`: lifecycle tab background dan batas pemulihan.
- `src/lib/patungan.ts`, `src/lib/media.ts`, copy `src/pages/Capture.tsx`/`Login.tsx`: jelaskan file plaintext dan mode lokal/terenkripsi tanpa janji keliru.

### Tahap 5 — P1 editor, aksesibilitas, dan performa

- `src/store.ts`, `src/pages/Edit.tsx`, `src/components/StripEditor.tsx`: undo/redo berbatas atas metadata, bukan bitmap.
- `src/components/Sheet.tsx`, `PillTabs.tsx`, `FormatPicker.tsx`, `PatunganGuide.tsx`, `MiniStrip.tsx`, `PhotoThumb.tsx`: fokus dialog, semantik radio/tab, nama preview, live status, operasi tanpa drag.
- `src/lib/render.ts`, `src/components/FramePicker.tsx`, `src/components/StripEditor.tsx`, `src/lib/export.ts`: eviction dan memoisasi aman; ukur sebelum klaim performa.

### Tahap 6 — Uji dan konsolidasi

- Tambah tes unit/integrasi untuk stash, store, quota, relay authorization dan error mapping.
- Browser test untuk flow inti, ukuran viewport, keyboard/focus, upload fallback, recovery, dan ekspor.
- Jalankan `npm run typecheck`, `npm run build`, tes yang ditambahkan, inspect screenshot; dokumentasikan batas yang masih memerlukan kamera/OAuth/perangkat nyata.

## Risiko dan mitigasi

- **Kontrak relay:** perubahan hak akses perlu klien dan Worker kompatibel; versi endpoint/compatibility behavior harus dirancang sebelum menyentuh route. Jangan menerapkan perubahan server yang membuat peserta lama kehilangan pemulihan diam-diam.
- **Foto dan memori:** stash yang lebih lengkap dapat mendekati kuota IndexedDB. Batasi ukuran/umur, pertahankan stash lama saat gagal, dan beri pemulihan yang jujur.
- **Undo:** rekam hanya perubahan desain/overlay; jangan simpan salinan blob/canvas pada tiap langkah.
- **Quota:** klaim harus atomik per `stripId`, termasuk dua request yang datang bersamaan; retry aman.
- **Pengukuran:** lingkungan ini tidak menyediakan kamera fisik/OAuth produksi; gunakan media mock dan catat manual QA tersisa.
- **Desain:** tidak mengubah brand token InWebsite dan tidak membuang fitur. Tidak menambahkan analytics/PWA/payment/premium.

## Hasil implementasi dan batas tersisa

Tanggal status: 24 Oktober 2026. Perbaikan UX/state P0 dan sebagian besar penguatan P1 telah diterapkan pada source/docs batch ini, tetapi belum semua kriteria P1 dapat dinyatakan selesai atau siap produksi. Tiga Luna subagent meninjau UX awal, state/performa, dan keamanan relay; pemeriksaan final dilakukan setelah integrasi ke checkout utama.

- **Perbaikan kode yang sudah diterapkan:** Start dengan progressive disclosure dan semua 11 layout; hirarki mobile capture/result; readiness kamera, pembatalan burst, retry dan fallback unggah; simpan/pulihkan foto aktif + cadangan + desain editor dan peringatan gagal autosave; konfirmasi dan undo/redo desain berbatas 50; restore shell punya timeout/retry; 404; quota D1 atomik/idempoten; relay menyamarkan owner, membatasi ownership/frame/quota paralel, dan baru menyatakan hapus setelah konfirmasi; semua body JSON/binary Worker dibatasi sebelum parsing; cache render gambar/crop berbatas; dialog fokus keyboard dan radio berpola panah.
- **Verifikasi lokal:** `npm test` (9 lulus), `npm run build` (termasuk typecheck aplikasi/Worker), `git diff --check`; browser smoke lokal, reload restore, route 404, viewport, format radio, dan keyboard dialog. Bukti rinci ada di `docs/photobooth-test-matrix.md`.
- **Masih perlu QA:** kamera nyata/izin dan lifecycle lintas browser; full login Google/email; unduh final/GIF dan kesamaan pixel editor; room dua perangkat/reconnect; D1/Worker produksi dan TTL empat jam nyata; audit WCAG/screen reader/perangkat; benchmark kinerja dan long task.
- **Batas keamanan relay:** GET tidak lagi membeberkan ID owner dan satu frame tidak dapat diubah/dihapus pemilik lain. Karena peserta masuk lewat link tanpa autentikasi individual, `X-Who` tetap identitas klien, bukan bukti unik yang tak dapat dipalsukan; peserta yang dimotivasi dapat membuat beberapa identitas untuk melewati jatah per-orang atau memenuhi slot kosong. Menghilangkan batas ini memerlukan keputusan autentikasi/kontrak baru; jangan klaim jatah relay sebagai proteksi terhadap peserta jahat.
- **P2:** landing SEO publik, analytics, PWA, premium, dan fitur pertumbuhan tetap proposal terpisah seperti diminta master prompt.

Sitemap, wireframe, design guide, product plan, audit, implementation plan, dan test matrix menggambarkan perilaku setelah perubahan serta batas QA di atas.
