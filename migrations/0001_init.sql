-- Akun (Auth0). Kolomnya mengikuti tabel users di assetweb (asset.inwebsite.online).
-- session_version: cookie sesi hanya berlaku selama membawa angka ini; keluar menaikkannya (keluar di semua perangkat).
-- banned = 1 memblokir akun penyalahguna (sesinya langsung tidak berlaku).
CREATE TABLE users (
  sub TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0,
  session_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

-- Satu baris per strip yang diunduh per hari (zona waktu WIB).
-- free = 0 berarti strip itu diunduh setelah jatah harian habis (diberi watermark).
CREATE TABLE strips (
  user_sub TEXT NOT NULL,
  day TEXT NOT NULL,
  strip_id TEXT NOT NULL,
  free INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_sub, strip_id)
);
CREATE INDEX strips_user_day ON strips (user_sub, day);
