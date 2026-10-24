# Matriks Tes InWebBooth

Tanggal: 24 Oktober 2026  
Hasil implementasi: 9 tes otomatis lulus; browser lokal menguji pemulihan foto/desain, rute 404, ukuran responsif, navigasi radio, dan fokus dialog. Baris di bawah membedakan bukti yang sudah ada dari QA yang masih perlu perangkat/layanan asli.

## Matriks state produk

| Dimensi | Keadaan wajib | Unit/integrasi | Browser/manual |
|---|---|---|---|
| Auth | guest, login, session expired | returnTo, cookie, stash decode | Google, email/reset, balik ke hasil yang sama |
| Kamera | loading, ready, denied, unavailable, failed | mapping DOMException, ready setelah frame | permission denied, upload fallback, switch, background/foreground |
| Foto | kosong, sebagian, penuh | `sparePhotos`, set/retake/restore | strip 4, ganti satu frame, 6→3→6 |
| Editing | bersih, berubah, restoring | undo/redo, invalidasi redo, bounds | tambah/pindah/resize/rotate/delete/text, kembali dan restore |
| Ekspor | idle, generating, success, failed | order render/claim, signature file | JPG/PNG/GIF, gagal lalu retry, share cancel/failure |
| Quota | tersedia, sisa satu, habis | `stripId` idempotent, parallel claims | watermark preview dan ekspor berikutnya |
| Room | none, host, guest, disconnected, expired | peer identity/ownership | host/guest, disconnect/reconnect, host balik |
| Relay | none, active, partial, complete, expired | auth per owner, quota, TTL cleanup | 2+ peserta, retake sendiri, menolak tampering, hapus gagal |
| Network | online, slow, offline, recovered | timeout/error classification | retry recovery; expired tidak disamakan dengan offline |
| Storage | tersedia, penuh, unavailable | stash retention pada failure | IndexedDB denied/full, decode corrupt, retry |
| Device | desktop, tablet, mobile | breakpoint/state layout | 320×700, 390×844, tablet, desktop, virtual keyboard |
| Motion | normal, reduced motion | helper media query | OS prefers-reduced-motion dan curtain |
| Accessibility | mouse/touch, keyboard, screen reader | aria relationships/role | tab/arrow/Enter/Escape, dialog focus trap/restore |

## Skenario prioritas

| ID | Skenario | Lapisan | Kriteria lulus | Status audit |
|---|---|---|---|---|
| T01 | Buka app → default → foto/upload → edit → export | Browser | selesai tanpa konfigurasi tambahan | Smoke lokal melalui upload gambar uji sampai editor/hasil; unduh akhir dan login tidak dituntaskan. |
| T02 | Ubah layout → foto → ubah format → ekspor | Browser | semua fitur/layout tetap; file cocok pengaturan | Belum dijalankan. |
| T03 | Tolak kamera → unggah galeri → selesaikan | Browser | kamera gagal tidak menghalangi flow | Upload stand-in berhasil; denial tidak dites. |
| T04 | Isi empat frame → ulang satu | Browser | frame lain tetap utuh | Belum dijalankan end-to-end. |
| T05 | Tambah stiker/teks → balik kamera → kembali editor | Browser | edit bertahan sesuai keputusan | Stiker/teks tetap ada setelah refresh; kembali dari kamera belum diuji end-to-end. |
| T06 | Refresh/recovery dengan 6→3→6 | Unit + browser | keenam foto pulih termasuk cadangan | Foto dan desain/editor pulih pada browser setelah refresh; transfer 6→3→6 lintas IndexedDB belum diuji penuh. Unit store menguji `sparePhotos` dan undo layout. Simulasi IndexedDB gagal/penuh belum dijalankan; kini restore/autosave memberi status kegagalan. |
| T07 | Rute invalid dan guard | Browser | rute pulih dengan penjelasan yang tepat | Rute tidak dikenal menampilkan halaman 404 kustom; semua variasi guard belum diuji. |
| T08 | Guest → login → hasil yang sama | Browser/Auth | foto dan desain tidak berubah | Belum dijalankan; OAuth/email memerlukan konfigurasi. |
| T09 | OAuth Google dan email sendiri | Browser/Auth | session kembali ke route yang diminta | Belum dijalankan. |
| T10 | Claim strip sukses/berbeda/paralel | Unit + Worker | maksimum 5 strip bebas watermark; retry idempoten | Lulus di harness Node SQLite: 12 claim paralel menghasilkan tepat 5 bebas watermark; strip sama idempoten. Bukan Cloudflare D1 sungguhan. |
| T11 | Kuota habis | Browser | watermark terlihat sebelum unduh dan diterapkan | Belum dijalankan. |
| T12 | Host room, guest join, owner frame | Browser + integration | owner tidak tertukar | Belum dijalankan; audit statis saja. |
| T13 | Guest disconnect/reconnect, host keluar sementara | Browser | state/frame tersinkron | Belum dijalankan. |
| T14 | Estafet multi-peserta dan TTL 4 jam | Worker + browser/manual | jatah per orang, status penuh/expired benar | Batas per orang diuji paralel dan TTL/cron diperiksa di kode; dua perangkat dan masa 4 jam belum diuji. |
| T15 | Hapus estafet saat online/offline | Unit + browser | sukses hanya saat server mengonfirmasi | Worker menolak hapus frame kosong/milik orang lain; alur server gagal dan UI offline belum disimulasikan. |
| T16 | Patungan file valid/rusak/ukuran besar | Unit + browser | validasi sebelum decode/memori besar | Belum dijalankan. |
| T17 | Coba menimpa/menghapus frame peserta lain | Worker integration | ditolak meski link sah | Harness menegaskan overwrite 409, delete 404, GET tidak membocorkan ID pemilik, dan jatah paralel tidak terlewati dengan identitas sama. Pemalsuan identitas acak tidak diselesaikan oleh autentikasi relay; lihat backlog keamanan. |
| T18 | Layout pada 320/390/tablet/desktop | Browser | tidak ada overflow halaman, CTA tetap terlihat | Start: 320, 360, 375, 390, 430, 768, 1024, 1440 px. Editor: 320, 390, 768, 1280 px. Tidak ditemukan overflow halaman horizontal. |
| T19 | Keyboard-only flow inti | Browser/manual | kontrol bisa ditemukan/dioperasikan | Dialog Shift+Tab/Escape diuji; format radio diuji panah kanan/kiri. Perjalanan seluruh aplikasi dan editor masih perlu QA keyboard. |
| T20 | Dialog buka/tutup fokus, Escape, backdrop | Browser/manual | fokus trap dan kembali ke pemicu | Fokus awal, Shift+Tab membungkus, Escape menutup dan fokus kembali ke pemicu lulus; backdrop tidak diuji. |
| T21 | Reduced motion | Browser/manual | animasi nonessential dikurangi | Dukungan Curtain terlihat di kode; tidak dites end-to-end. |
| T22 | Preview ekspor versus editor | Pixel/browser | crop/overlay/orientasi sama | Belum dijalankan. |
| T23 | Error ekspor dan retry | Unit + browser | tidak mengurangi quota pada render gagal | Belum dijalankan. |
| T24 | Navigasi saat burst, keluar kamera, tab hidden | Browser/media mock | track berhenti, hasil batal tidak menulis state | Belum dijalankan. |
| T25 | Export/memori 320–large image | Browser device | tidak hang/kehabisan memori; metrik dicatat | Belum dijalankan; belum ada baseline performa. |
| T26 | Payload Worker oversize dan JSON rusak | Unit + Worker | request ditolak sebelum body besar diparse/disimpan | Batas streamed relay body diuji dan ditolak 413; JSON valid diuji. Route lain menggunakan helper bersama dan lulus typecheck/build; payload error di setiap endpoint belum diuji langsung. |

## Pemeriksaan yang sudah dijalankan

- `npm test` — 9 tes lulus, 0 gagal.
- `npm run build` — typecheck aplikasi + Worker dan build client/Worker lulus.
- `git diff --check` — lulus; Git hanya memberi peringatan normal konversi LF/CRLF.

`npm run db:migrate:local` tidak dijalankan karena bukan bagian dari verifikasi yang dibutuhkan dan akan mengubah database lokal. OAuth production, izin kamera fisik, screen reader perangkat nyata, perangkat multi-user, dan TTL empat jam memerlukan QA manual di lingkungan yang sesuai.

## Smoke browser yang dilakukan saat audit

- Vite lokal dibuka di `http://127.0.0.1:5173/`.
- 390×844: Start → Capture → unggah gambar stand-in → Hias; foto bertahan setelah refresh di Foto dan Hias, termasuk overlay teks/stiker.
- 320×700, 390 px dan breakpoint Start/Editor tercatat di T18; 404 kustom terlihat pada route tidak dikenal.
- Radio “Ukuran hasil” berpindah dengan panah kanan/kiri dan memperbarui pilihan.
- Dialog room: fokus awal, Shift+Tab membungkus, Escape menutup dan fokus kembali ke pemicu.
- Vite lama sempat menghasilkan 504 `Outdated Optimize Dep` untuk `trystero.js`; server bersih dengan dependency re-optimized membuka invite sheet tanpa error JavaScript dan menampilkan batas kapasitas yang baru. Koneksi Trystero ke relay WebSocket publik tetap mengeluarkan warning gagal koneksi; ruang kosong uji ditutup sesudahnya, jadi jalur live multi-perangkat belum lulus browser.
- Tes ini bukan bukti kamera fisik, OAuth, aksesibilitas lengkap, D1 produksi, atau lintas-browser.

## QA yang masih diperlukan

- Full flow empat foto, retake satu frame, login OAuth/email, hasil/unduh, serta retry setelah kegagalan render.
- Browser media mock atau perangkat nyata untuk denial, switch, burst yang dibatalkan, background/foreground, dan cleanup stream.
- Dua perangkat untuk host/guest, reconnect, estafet multi-peserta, patungan file, dan keamanan kapasitas relay.
- Ekspor pixel parity, GIF di perangkat terbatas, reduced motion, screen reader, kontras, virtual keyboard, dan landscape.
- Cloudflare D1/Worker integration untuk SQL/limiter/TTL/authorization sesuai runtime produksi.
