-- Titipan ruang foto bareng: supaya teman tetap bisa masuk saat pembuat ruang keluar sebentar (mis. lagi kirim link
-- di WhatsApp). Isinya hanya layout, nama, dan pemilik frame, dienkripsi di browser dengan kunci dari link (bagian
-- setelah #, tidak pernah sampai ke server). Foto tidak pernah disimpan di sini.
-- id = SHA-256 kode ruang; owner_hash = SHA-256 kunci tulis milik pembuat ruang (hanya dia yang bisa mengubah).
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX rooms_updated ON rooms (updated_at);
