-- Estafet foto bareng: satu orang memulai strip, teman-teman mengisi frame bergiliran lewat link yang sama.
-- Semua isi dienkripsi di browser dengan kunci dari link (bagian setelah #, tidak pernah sampai ke server).
-- Berlaku 4 jam sejak dibuat; setelah itu baris dihapus (cron tiap menit + saat dibaca).
-- id = SHA-256 kode estafet; owner_hash = SHA-256 kunci tulis pembuatnya (hanya dia yang bisa menghapus semuanya).
CREATE TABLE relays (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  meta BLOB NOT NULL,
  slots INTEGER NOT NULL,
  per_person INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX relays_expires ON relays (expires_at);

-- Satu baris per frame yang sudah terisi. who = hash anggota (dari kunci acak di browser), untuk jatah per orang.
-- photo = foto + rekaman live terenkripsi.
CREATE TABLE relay_frames (
  relay_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  who TEXT NOT NULL,
  photo BLOB NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (relay_id, slot)
);
