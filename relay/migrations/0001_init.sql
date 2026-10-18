-- 同期用の部屋。data は端末で暗号化された文字列(サーバーは読めない)
CREATE TABLE IF NOT EXISTS rooms (
  room TEXT PRIMARY KEY,
  rev INTEGER NOT NULL,
  data TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rooms_updated_at ON rooms (updated_at);
