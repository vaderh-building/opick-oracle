import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { DATA_DIR, DB_PATH } from "../config";
import { runMigrations } from "./migrations";

export type Db = Database.Database;

let dbInstance: Db | null = null;

export function getDb(): Db {
  if (dbInstance) return dbInstance;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  dbInstance = db;
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export enum MarketState {
  TRADING = 0,
  PENDING_SETTLEMENT = 1,
  SETTLED = 2,
  DISPUTED = 3,
}

export enum MarketType {
  HEAD_TO_HEAD = 0,
  DIRECTION = 1,
}

export enum MetricType {
  MENTION_COUNT = 0,
  ENGAGEMENT_WEIGHTED = 1,
  ENGAGEMENT_DENSITY = 2,
  VELOCITY = 3,
}

export const METRIC_TYPE_NAMES: Record<number, string> = {
  0: "MENTION_COUNT",
  1: "ENGAGEMENT_WEIGHTED",
  2: "ENGAGEMENT_DENSITY",
  3: "VELOCITY",
};

export const MARKET_TYPE_NAMES: Record<number, string> = {
  0: "HEAD_TO_HEAD",
  1: "DIRECTION",
};

export const MARKET_STATE_NAMES: Record<number, string> = {
  0: "TRADING",
  1: "PENDING_SETTLEMENT",
  2: "SETTLED",
  3: "DISPUTED",
};

export interface MarketRow {
  id: number;
  address: string;
  market_type: number;
  metric_type: number;
  keyword_a: string;
  keyword_b: string | null;
  threshold: string | null;
  open_time: number;
  close_time: number;
  settlement_deadline: number;
  state: number;
  yes_won: number | null;
  settlement_value_a: string | null;
  settlement_value_b: string | null;
  last_synced: number;
}

export interface MetricSnapshotRow {
  id: number;
  keyword: string;
  metric_type: number;
  value: string;
  window_start: number;
  window_end: number;
  computed_at: number;
  raw_components: string;
}

export interface SettlementLogRow {
  id: number;
  market_id: number;
  value_a: string;
  value_b: string;
  signature: string;
  tx_hash: string | null;
  status: string;
  attempted_at: number;
  mined_at: number | null;
  error_message: string | null;
  hmac: string;
}

export function getKv(db: Db, key: string): string | null {
  const row = db.prepare("SELECT v FROM kv WHERE k = ?").get(key) as { v: string } | undefined;
  return row ? row.v : null;
}

export function setKv(db: Db, key: string, value: string): void {
  db.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v")
    .run(key, value);
}

export function dbPath(): string {
  return path.resolve(DB_PATH);
}
