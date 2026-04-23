import type Database from "better-sqlite3";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS markets (
  id INTEGER PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  market_type INTEGER NOT NULL,
  metric_type INTEGER NOT NULL,
  keyword_a TEXT NOT NULL,
  keyword_b TEXT,
  threshold TEXT,
  open_time INTEGER NOT NULL,
  close_time INTEGER NOT NULL,
  settlement_deadline INTEGER NOT NULL,
  state INTEGER NOT NULL,
  yes_won INTEGER,
  settlement_value_a TEXT,
  settlement_value_b TEXT,
  last_synced INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS metric_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  metric_type INTEGER NOT NULL,
  value TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  computed_at INTEGER NOT NULL,
  raw_components TEXT NOT NULL,
  UNIQUE(keyword, metric_type, computed_at)
);

CREATE TABLE IF NOT EXISTS settlement_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id INTEGER NOT NULL,
  value_a TEXT NOT NULL,
  value_b TEXT NOT NULL,
  signature TEXT NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL,
  attempted_at INTEGER NOT NULL,
  mined_at INTEGER,
  error_message TEXT,
  hmac TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS keyword_registry (
  hash TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,
  first_seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_markets_state ON markets(state);
CREATE INDEX IF NOT EXISTS idx_markets_close_time ON markets(close_time);
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_key_metric_time
  ON metric_snapshots(keyword, metric_type, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_log_market ON settlement_log(market_id);
CREATE INDEX IF NOT EXISTS idx_settlement_log_status ON settlement_log(status);
`;

export function runMigrations(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}
