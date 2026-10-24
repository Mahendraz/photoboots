# Rencana Produk InWebBooth

Tanggal: 24 Oktober 2026  
Tujuan: membuat pengalaman “mudah mulai, menyenangkan dipakai, kuat saat dibutuhkan” tanpa mengurangi kapabilitas atau mengubah kontrak bisnis.

## Prinsip produk

1. Satu jalur utama yang langsung bisa dipakai; pengaturan lanjutan muncul bila dicari.
2. Koreksi foto dan pengeditan tidak menghapus kemajuan tanpa pemberitahuan.
3. Status kamera, login, ekspor, ruang, dan estafet menyebut keadaan serta langkah pemulihan.
4. Foto solo tetap diproses lokal; mode estafet menjelaskan enkripsi dan masa simpan empat jam.
5. Semua layout, rasio, format, template, filter, fitur kamera, dan tiga metode kolaborasi tetap tersedia.
6. Navigasi keyboard, pembaca layar, touch, reduced motion, dan perangkat kecil diperlakukan sebagai jalur inti.

## Perjalanan sasaran

### 1. Mulai

Pengguna membuka `/` dan tetap diarahkan ke `/app`. Mereka melihat rekomendasi layout Strip 4, preview yang mewakili hasil, dan tombol “Mulai foto →”. Semua 11 layout tetap bisa dipilih lewat kategori Rekomendasi/Strip/Grid/Polaroid/Semua. Rasio, format, template, dan kiri/kanan berada dalam Sesuaikan; pengaturan yang tidak relevan tidak ditampilkan. “Foto bareng dari jauh?” menjadi satu entry point dengan pilihan live room atau estafet; patungan file tetap tersedia sebagai fallback.

### 2. Foto

Di ponsel urutannya kamera, shutter, jumlah frame, hasil terakhir, lalu kontrol sekunder. Tombol lanjut dapat dijangkau saat ada foto. Foto ulang frame tetap menjadi operasi per-frame. Izin ditolak, kamera tidak ada, video gagal, tab disembunyikan, atau kamera berganti menghasilkan status yang benar dan opsi galeri/retry. Desktop mempertahankan preview bersama panel samping.

### 3. Hias

Lima tab tetap: Frame, Filter, Stiker, Teks, Atur. Kanvas mendapat ruang yang cukup di perangkat pendek; alat bisa diperluas/diciutkan. Aksi tambah, pindah, ubah ukuran, putar, urut, hapus, teks, dan reset dapat dibatalkan dengan Undo/Redo dan dioperasikan tanpa drag. Ganti layout memberi pratinjau konsekuensi sebelum menghapus overlay. Foto dan overlay tetap pulih saat login atau navigasi yang didukung.

### 4. Unduh

Hasil punya judul selesai, preview aksesibel, tombol unduh JPG utama yang terlihat tanpa menelusuri seluruh panel, pemilih JPG/PNG, GIF bila ada, ukuran, kuota, watermark preview, share native/fallback unduh, dan kembali ke editor/foto. Kegagalan render tidak memakai kuota; download ulang strip yang sama tetap tidak menambah hitungan. Fitur simpan URL/QR hanya ditampilkan setelah benar-benar tersedia.

### 5. Login dan pemulihan

Login menjelaskan alasan yang ada: diperlukan sebelum mengunduh. Foto dan state editor dikembalikan persis setelah Google/email login. Kegagalan IndexedDB/decode diberi pesan dan data stash dipertahankan untuk retry. Navigasi ke rute foto/hias/unduh yang tak valid tetap diarahkan dengan alasan yang jelas; loading restore tidak membekukan seluruh shell.

### 6. Kolaborasi

Live room, estafet, dan patungan tetap ada. Room menampilkan status koneksi/reconnect dan owner frame tanpa klaim kapasitas absolut. Estafet menampilkan aktif/partial/complete/expired/offline secara berbeda. Penghapusan hanya dinyatakan berhasil setelah Worker mengonfirmasi. Identitas yang dapat dipakai untuk menimpa frame tidak pernah dikirim pada respons baca; otorisasi dan quota diuji terhadap peserta yang telah memiliki link. Waktu hidup estafet tetap empat jam.

## Prioritas

| Prioritas | Hasil | Pekerjaan utama |
|---|---|---|
| P0 | Jalur inti mudah dipahami dan tidak mengorbankan foto/kuota | Start progressive disclosure; susunan mobile Capture/Edit/Result; restore `photos` + `sparePhotos` dan overlay; kamera baru siap setelah frame valid; klaim quota setelah render; konfirmasi perubahan yang membuang overlay; satu entry kolaborasi. |
| P1 | Pemulihan, aksesibilitas, kolaborasi, dan ketahanan | Undo/Redo berbatas; shell dan error state yang tidak memblokir; dialog/focus/radio/keyboard; lifecycle kamera/burst; otorisasi relay; penghapusan terkonfirmasi; status expired/offline; perlindungan quota race; cache dan render; test coverage. |
| P2 | Pertumbuhan produk | Landing SEO, analytics privacy-safe, PWA, discovery lanjutan, premium—perencanaan saja, tidak dikerjakan pada batch ini. |

## Keputusan terkunci dan batas produk

- `/` tetap redirect ke `/app`; route inti dan hash invite tetap dipertahankan.
- Layout default/format tetap nilai saat ini kecuali eksperimen browser menunjukkan alasan kuat mengubahnya; default yang teramati adalah Strip 4, Cetak, landscape, frame putih.
- Lima ekspor gratis per hari, reset pukul 00.00 WIB, watermark setelah kuota habis, login wajib sebelum download, dan idempotensi `stripId` tidak berubah.
- Foto solo tidak dikirim ke server. Estafet tetap encrypted-at-rest/in-transit pada payload frame dan ephemeral maksimal empat jam. Patungan adalah file plaintext yang pengguna pilih untuk buat/kirim sendiri.
- API, D1, dan auth dipertahankan kecuali perubahan otorisasi estafet yang beralasan keamanan, dibatasi pada endpoint terkait, dan diuji.
- Klaim kapasitas room tidak absolut sebelum uji perangkat/jaringan.

## Dampak yang diharapkan dan ukurannya

- Pengguna bisa langsung mulai dengan layout default tanpa membuka pengaturan.
- Tugas inti berhasil tanpa kehilangan foto/overlay pada skenario kembali, login, ganti layout, dan pemulihan yang diuji.
- Tidak ada klaim sukses penghapusan/unduh sebelum backend/file mengonfirmasi.
- Kontrol penting dapat digunakan dengan keyboard dan punya nama/relasi pembaca layar.
- Bundle, interaksi editor, memori, dan waktu ekspor diukur; angka hanya dicatat bila pengukuran benar-benar dijalankan.

## Yang belum diketahui

Belum ada baseline konversi, analytics, performa di perangkat fisik, audit screen reader, atau kapasitas multi-device. Target kualitas 9.3/10 pada prompt master bukan skor hasil audit yang sudah diukur.
