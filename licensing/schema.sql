PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  license_key TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL CHECK(plan IN ('TRIAL','1_YEAR','2_YEAR','3_YEAR','5_YEAR')),
  duration_days INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS activations (
  license_id TEXT PRIMARY KEY REFERENCES licenses(id),
  device_id TEXT NOT NULL,
  activated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_licenses_user ON licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);

CREATE TABLE IF NOT EXISTS trial_devices (
  device_id TEXT PRIMARY KEY,
  used_at INTEGER NOT NULL
);
