# Audit Produk InWebBooth

Tanggal audit: 24 Oktober 2026  
Basis: pemeriksaan kode, dokumen produk, dan smoke test browser lokal. Tidak ada probe ke produksi, OAuth sungguhan, atau perangkat kamera fisik.

## Ringkasan kondisi

Alur inti sudah ada: pilih layout → foto → hias → unduh; 11 layout, lima rasio, empat format, filter, teks, stiker, kamera, unggah lokal, GIF/live photo, login, ruang langsung, estafet, dan patungan berkas tersedia. Pemrosesan foto solo tetap di browser. Estafet mengenkripsi frame di klien sebelum menyimpannya sementara di Worker/D1 dengan masa berlaku empat jam.

Temuan baseline paling penting adalah sesi foto dapat hilang pada beberapa jalur pemulihan, UI awal membebani pengguna dengan banyak pilihan sekaligus, dan aturan kepemilikan frame estafet tidak mengikat slot ke pemiliknya secara atomik. Pada awal audit belum ada runner tes otomatis.

## Bukti dan temuan

Tabel berikut merekam kondisi baseline sebelum implementasi. Status pasca-perubahan dan backlog verifikasi dicatat setelah tabel, bukan dianggap sebagai hasil audit awal.

| ID | Prioritas | Temuan dan bukti | Reproduksi / dampak | Perbaikan yang disarankan | Keyakinan |
|---|---|---|---|---|---|
| A1 | P0 | Start menampilkan format, 11 layout, rasio foto, template, dan semua jalur kolaborasi pada halaman panjang. `src/pages/Start.tsx`; `docs/wireframe.md`. | Pada 390×844, CTA tetap menempel di bawah, tetapi pengguna harus melewati banyak keputusan untuk memahami pilihan. | Tampilkan layout rekomendasi dan CTA sebagai jalur utama; kelompokkan semua layout; pindahkan konfigurasi sekunder ke area “Sesuaikan”; jadikan kolaborasi satu pintu masuk. | Tinggi, dari kode dan browser lokal. |
| A2 | P0 | Stash login dan ruang hanya membawa `photos`, tidak `sparePhotos`; pemulihan menempatkan kembali foto tersembunyi sebagai kosong. `src/store.ts`, `src/lib/stash.ts`, `src/lib/room.ts`. | Isi enam slot, ubah layout ke tiga slot, lakukan stash/pemulihan, kembali ke layout enam. Foto yang disimpan di luar slot aktif dapat hilang. | Simpan dan pulihkan foto aktif beserta foto cadangan; jangan hapus stash sebelum decode dan restore berhasil. | Tinggi, dari alur kode; belum diuji dengan IndexedDB yang sengaja gagal. |
| A3 | P0 | Restore stash menghapus kunci IndexedDB sebelum memvalidasi umur dan decode. Error saat membuat stash ditelan. `src/lib/stash.ts`. | Kegagalan decode/storage dapat menghilangkan kesempatan pemulihan tanpa pesan. | Validasi, decode, dan terapkan dulu; hapus hanya setelah sukses. Tampilkan status gagal dan opsi aman untuk mencoba lagi. | Tinggi, dari kode. |
| A4 | P0 | Hasil dipotong jatah melalui `claimStrip()` sebelum render JPG/PNG/GIF. `src/pages/Result.tsx`. | Jika render gagal setelah klaim, jatah harian berpotensi terpakai walau file tidak jadi. | Render lebih dulu, lalu klaim secara idempoten tepat sebelum unduh; pertahankan `stripId` dan penanganan retry. | Tinggi, dari urutan kode; kegagalan produksi tidak direproduksi. |
| A5 | P0 | Video kamera yang gagal `play()` tetap dapat menandai kamera siap. `src/pages/Capture.tsx`. | Shutter dapat aktif tanpa frame video yang dapat dibaca. | Tandai siap hanya setelah playback dan frame valid teramati; sediakan retry dan unggah galeri. | Tinggi, dari kode. |
| A6 | P0 | Mengganti layout melalui tab Atur mengosongkan overlay tanpa peringatan/undo. `src/pages/Edit.tsx`, `src/store.ts`. | Stiker atau teks hilang saat layout diganti. | Simpan/konversi overlay jika aman; jika tidak, jelaskan dampak dan beri batal/undo sebelum tindakan. | Tinggi, dari kode. |
| A7 | P1 | GET relay menampilkan `who`; PUT/DELETE menerima `X-Who` itu sebagai bukti kepemilikan. `worker/relay.ts:66-80,124-148`; `src/lib/relay.ts:214-223,259-266`. | Secara statis, peserta yang memiliki link dapat menyalin `who` dari respons, lalu menghapus atau mengganti frame peserta lain dan mengelabui kuota. Reproduksi belum dijalankan sebagai request. | Hentikan paparan identitas yang dapat dipakai ulang; ikat perubahan frame dan kuota ke bukti kepemilikan yang tidak dikirim dalam GET; pertahankan kompatibilitas link empat jam dengan migrasi/versi API yang aman dan tes. | Tinggi untuk cacat otorisasi di kode; dampak runtime belum diprobe. |
| A8 | P1 | Permintaan penghapusan relay mengabaikan status HTTP/error lalu menghapus status lokal; UI menyatakan foto langsung dihapus. `src/lib/relay.ts:446-452`; `src/components/Estafet.tsx:228-232`. | Jika jaringan/server gagal, frame masih tersimpan sampai TTL, namun pengguna melihat sukses. | Hanya tampilkan sukses setelah server mengonfirmasi; saat gagal, pertahankan state dan jelaskan bahwa penghapusan belum terkonfirmasi. | Tinggi, dari kode. |
| A9 | P1 | Pemulihan shell menunggu berurutan restore sesi, room, dan relay sebelum menampilkan halaman. Tidak terlihat fallback/timeout pada alur ini. `src/components/AppShell.tsx`, `src/lib/relay.ts`. | Jaringan estafet yang lambat dapat menahan seluruh aplikasi. | Render shell dengan status pemulihan yang tidak memblokir seluruh rute; beri batas waktu dan tindakan coba lagi. | Sedang-tinggi, berdasarkan alur kode; waktu tunggu jaringan tidak diukur. |
| A10 | P1 | Tidak ada pemeriksaan pembatalan sesudah `await burst(...)` sebelum foto ditulis. `src/pages/Capture.tsx`. | Navigasi saat burst berjalan dapat mengubah state setelah pengguna meninggalkan alur kamera. | Periksa token pembatalan sebelum menyimpan hasil burst; uji berhenti dan unmount. | Tinggi, dari kode. |
| A11 | P1 | Editor tidak memiliki undo/redo; `setLayout` mereset overlay. Riwayat state tidak disimpan pada reload biasa. `src/store.ts`, `src/pages/Edit.tsx`. | Perubahan salah atau navigasi yang bisa dipulihkan berisiko membuang kerja editor. | Tambahkan history berbatas untuk metadata overlay/setting; hindari menggandakan bitmap foto. | Tinggi, dari kode. |
| A12 | P1 | Sheet berperan sebagai dialog tetapi tidak memindah, mengurung, atau mengembalikan fokus. Radio semu tidak punya navigasi panah; canvas preview tidak diberi nama aksesibel. `Sheet.tsx`, `FormatPicker.tsx`, `PatunganGuide.tsx`, `MiniStrip.tsx`, `PhotoThumb.tsx`. | Keyboard dan pembaca layar dapat kehilangan konteks atau tidak mengoperasikan kontrol dengan pola yang diharapkan. | Tambahkan manajemen fokus dialog, radio native/roving focus, label preview, relasi tab-panel, dan alternatif keyboard untuk overlay. | Tinggi, dari inspeksi kode; belum ada audit WCAG otomatis/manual lengkap. |
| A13 | P1 | Share dapat memakai file render lama setelah ukuran/format berubah; error share selain batal ditelan. Klaim jatah terjadi sebelum render. `src/pages/Result.tsx`. | File yang dibagikan dapat berbeda dari pengaturan saat ini; kegagalan tidak memberi cara pulih. | Ikat file ke signature desain/format atau invalidasi saat berubah; tampilkan error selain pembatalan. | Tinggi, dari kode. |
| A14 | P1 | Cache gambar sukses tidak dievict sepanjang sesi; cache kanvas crop menahan sampai 121 entri dan `clearPhotoCache` tidak dipanggil. `src/lib/render.ts`. | Penggunaan memori dapat membesar dalam sesi panjang. Belum ada benchmark untuk membuktikan besarnya dampak di perangkat. | Tentukan masa hidup/eviction yang aman, bersihkan saat foto berubah, ukur sebelum dan sesudah pada perangkat terbatas. | Sedang. |
| A15 | P1 | Effect komposisi di `StripEditor.tsx` berjalan setelah tiap render; GIF mengerjakan kuantisasi piksel di thread utama. | Potensi lag pada ponsel; tidak ada pengukuran frame time/export saat audit. | Batasi dependency effect, cache hasil berbasis signature, ukur ekspor; pindah kerja berat hanya bila metrik membenarkan. | Sedang, risiko berdasarkan kode. |
| A16 | P1 | Batas ukuran relay diperiksa setelah `arrayBuffer()` dibaca; metadata diparse sebelum validasi ukuran. `worker/relay.ts`, `worker/index.ts`. | Request besar menggunakan memori sebelum ditolak; batas platform mungkin membatasi, belum diuji. | Batasi ukuran di stream/header seawal mungkin dan batasi request baca relay. | Sedang. |
| A17 | P1 | Quota `/api/strips` memeriksa penggunaan sebelum insert terpisah. `worker/index.ts:98-117`. | Dua strip berbeda yang diklaim serentak berpotensi melewati batas harian. | Jadikan pemeriksaan/claim atomik di D1; pertahankan idempotensi `stripId`; uji request paralel. | Sedang-tinggi, pola race terlihat di kode; belum diuji paralel. |
| A18 | P1 | Restore error jaringan relay dipetakan ke “estafet berakhir”; kegagalan membuat ruang tidak menampilkan pesan pemulihan. | Gangguan layanan tampak seperti link kedaluwarsa dan pengguna tidak tahu tindakan berikutnya. | Pisahkan `gone`, offline, timeout, dan server error; berikan coba lagi/alternatif. | Tinggi, dari kode. |
| A19 | P1 | Foto ruang disimpan di IndexedDB tanpa enkripsi; patungan berkas `.txt` berisi foto plaintext. | Foto dapat dibaca oleh pengguna lain pada profil browser yang sama atau oleh siapa pun yang menerima berkas. Ini bukan bukti foto solo dikirim ke server. | Jelaskan penyimpanan lokal/berkas secara akurat dan sediakan penghapusan lokal; pertimbangkan enkripsi lokal hanya setelah desain pemulihan kunci disepakati. | Tinggi, dari alur kode; akses perangkat nyata tidak diuji. |
| A20 | P1 | Copy di Capture/Login menyatakan foto “tidak pernah diunggah ke server”, padahal estafet mengirim payload terenkripsi sementara. | Klaim privasi tidak mencerminkan semua mode. | Gunakan copy spesifik mode: foto solo diproses lokal; estafet mengirim foto terenkripsi sementara sampai batas empat jam. | Tinggi. |
| A21 | P1 | Klaim ruang dapat diikuti jumlah orang berapa pun tanpa batas yang ditegakkan; ukuran kapasitas belum diukur. | Ekspektasi kapasitas berpotensi melampaui kemampuan perangkat/jaringan. | Hapus klaim absolut atau nyatakan kapasitas bergantung koneksi/perangkat; uji kapasitas sebelum menentukan angka. | Sedang. |
| A22 | P1 | Cakupan tes otomatis belum terlihat. `package.json` belum memiliki script test dan inventaris repo tidak menemukan test runner. | Perubahan state, worker, kamera, dan kolaborasi belum punya regression suite yang bisa dijalankan. | Tambahkan test framework tipis untuk utilitas/store/Worker lalu browser automation untuk alur inti. | Tinggi untuk inventaris; tidak menyimpulkan kualitas yang belum diuji. |

## Status tindak lanjut

| Temuan | Status setelah batch | Bukti / batas |
|---|---|---|
| A1–A6 | Diperbaiki di source | Start, camera-ready/cancel, recovery aktif + `sparePhotos`, quota setelah render, konfirmasi + undo/redo layout; hasilnya sudah diuji sejauh disebut di test matrix. |
| A7–A8 | Diperkeras | Respons GET tidak mengembalikan ID owner mentah; claim slot/delete hanya oleh `who` pemilik slot dan hasil delete gagal tidak dihapus lokal. Namun tanpa akun atau kredensial peserta, `X-Who` bisa dipalsukan/diganti; batas jatah per-orang bukan perlindungan terhadap peserta beritikad buruk. |
| A9–A10 | Diperbaiki di source | Shell punya timeout/retry; capture memeriksa pembatalan dan melepas reservasi sebelum menyimpan. Browser lifecycle penuh masih perlu media mock/perangkat. |
| A11–A13 | Sebagian besar diperbaiki | Undo/redo desain metadata berbatas 50, result mengikat render ke signature desain, quota klaim idempoten, fallback share/error. Ekspor final/login masih perlu browser QA. |
| A12 | Sebagian diperbaiki | Sheet fokus awal/trap/escape/restore, tabs berelasi, pilihan ukuran dan contoh patungan punya panah/Home/End, editor punya operasi keyboard. Kontras, screen reader, dan perjalanan keyboard menyeluruh belum diaudit. |
| A14 | Diperbaiki dengan batas memori | Cache gambar LRU dibatasi 48 item/64 MiB perkiraan; cache crop LRU dibatasi 32 MiB. Perkiraan byte tidak menggantikan pengukuran memori perangkat. |
| A15 | Belum selesai penuh | Preview dasar editor tidak merender ulang saat drag; GIF masih mengkuantisasi frame di main thread. Belum ada benchmark perangkat atau perubahan worker. |
| A16 | Diperbaiki di Worker | Route Worker yang membaca JSON atau frame memakai pembacaan body bertahap dengan batas sebelum parsing/buffer penuh. Batas produksi D1 dan behavior rate limiter tetap memerlukan Cloudflare integration QA. |
| A17–A18 | Diperbaiki di source | Claim quota atomik/idempoten; status relay membedakan offline/timeout/expired dan error dapat dicoba ulang. SQL diuji dengan SQLite Node, bukan D1. |
| A19–A20 | Copy diperbaiki; risiko lokal tetap | Copy membedakan foto solo, estafet, dan patungan. Foto ruang di IndexedDB tetap plaintext pada profil browser; file patungan memang plaintext yang dikirim sendiri. Simpanan lokal yang gagal dipulihkan dibedakan dari sesi kosong, dan kegagalan autosave ditampilkan. |
| A21 | Copy kapasitas diperbaiki | Invite sheet menyatakan kelancaran bergantung perangkat/koneksi; belum ada uji kapasitas untuk angka atau jaminan multi-perangkat. |
| A22 | Diperbaiki sebagian | Ada Vitest suite untuk store, body Worker, quota, dan endpoint relay (9 tes); belum ada suite browser otomatis penuh. |

## Model ancaman singkat

- **Aset:** foto, key enkripsi di link, daftar slot/pemilik, ketersediaan relay, sesi dan data IndexedDB lokal.
- **Batas kepercayaan:** perangkat/browser peserta; peer WebRTC; Worker/D1 relay; siapa pun yang menerima link estafet. Payload frame relay dienkripsi di client sebelum dikirim, sedangkan nama/status/slot dan ciphertext tetap diketahui Worker.
- **Ancaman utama:** pemegang link mencoba menimpa atau menghapus frame lain, menebak/membocorkan owner ID, mengirim payload besar, atau memenuhi slot kosong. Worker kini tidak mempublikasikan ID owner, mengikat update/delete ke ID yang mengisi slot, membatasi body, dan mengandalkan limiter yang sudah dikonfigurasi.
- **Batas:** relay tidak memiliki autentikasi individu; `X-Who` adalah identifier klien. Link-holder dapat membuat identitas tambahan untuk menghindari jatah per-orang atau mengisi slot kosong. Proteksi terhadap penyalahgunaan itu memerlukan identitas/kapabilitas server-side dan desain kompatibilitas tautan baru.
- **Ancaman lokal:** foto ruang disimpan tanpa enkripsi di IndexedDB dan file patungan plaintext; siapa pun yang memakai profil/perangkat yang sama atau menerima file dapat membacanya. Hanya perubahan copy yang dilakukan; enkripsi lokal memerlukan desain retensi dan pemulihan kunci.

## Kekuatan yang harus dipertahankan

- Semua fitur inti dan 11 layout tersedia; simplifikasi harus mengubah cara menemukan fitur, bukan menghapusnya.
- Pemotretan mendukung pilih frame, foto ulang frame terpilih, unggah galeri, dan coba ulang kamera.
- `sparePhotos` menjaga foto di luar layout aktif saat layout berubah.
- Lima tab editor dipertahankan; editor mulai pada Stiker dan toolbar objek berada di bawah pratinjau.
- JPG/PNG dan ekspor GIF tersedia; `stripId` membuat klaim strip yang sama idempoten.
- `Curtain` memperhatikan `prefers-reduced-motion`; kamera, observer, dan animasi punya sebagian besar cleanup saat unmount.
- Auth memakai cookie Secure/HttpOnly/SameSite, validasi sesi, OIDC state/nonce/PKCE, dan return path aman. Tidak ditemukan open redirect pada jalur yang diperiksa.
- Enkripsi frame estafet sisi klien memakai AES-GCM; TTL empat jam dan pembersihan terjadwal per menit tersedia.

## Verifikasi awal

- Browser lokal melewati `/app` → unggah gambar uji ke frame → `/app/hias` → `/app/unduh` pada lebar 390 px; tidak ada overflow halaman horizontal pada 390 px dan 320 px.
- Gambar uji adalah screenshot UI lokal, bukan foto pengguna. Alur kamera nyata tidak tervalidasi karena browser tetap menunggu izin/perangkat kamera.
- Snapshot console pada alur tersebut tidak menunjukkan error; ini bukan bukti audit aksesibilitas atau tes lintas perangkat.
- `npm run typecheck`, `npm run build`, dan DB migration tersedia tetapi belum dijalankan selama audit.
- Tidak ada probe produksi, tes OAuth, uji kapasitas ruang, atau reproduksi request Worker langsung. Temuan estafet/quota/race di atas adalah audit kode statis.

## Batas dan backlog

P0 dan P1 dikerjakan dalam rencana implementasi. P2 (landing SEO publik, analytics, PWA, premium, rekomendasi baru) ditunda sesuai master prompt. Klaim keamanan/runtime, skor Lighthouse/WCAG, dan benchmark performa tidak dibuat tanpa pengukuran.
