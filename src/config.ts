import dotenv from "dotenv";
import path from "path";

dotenv.config();

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback: string = ""): string {
  return process.env[name] || fallback;
}

export const X_BEARER_TOKEN = str("X_BEARER_TOKEN");
export const PORT = num("PORT", 8081);

export const BASE_RPC_URL = str(
  "BASE_RPC_URL",
  "https://base-mainnet.g.alchemy.com/v2/DgJFpft_bkGhr6Dbg1eMH"
);
export const CHAIN_ID = num("CHAIN_ID", 8453);
export const V6_FACTORY_ADDRESS = str("V6_FACTORY_ADDRESS");
export const V6_MARKET_IMPLEMENTATION = str("V6_MARKET_IMPLEMENTATION");
export const ORACLE_SIGNER_PRIVATE_KEY = str("ORACLE_SIGNER_PRIVATE_KEY");
export const AUDIT_HMAC_KEY = str("AUDIT_HMAC_KEY");

export const MARKET_SYNC_INTERVAL_MINUTES = num("MARKET_SYNC_INTERVAL_MINUTES", 5);
export const METRIC_POLL_INTERVAL_MINUTES = num("METRIC_POLL_INTERVAL_MINUTES", 15);
export const SETTLEMENT_CHECK_INTERVAL_MINUTES = num("SETTLEMENT_CHECK_INTERVAL_MINUTES", 10);

export const DASHBOARD_ENABLED = (process.env.DASHBOARD_ENABLED || "true").toLowerCase() !== "false";

// Legacy backward-compatible fields
export const POLL_INTERVAL_MINUTES = METRIC_POLL_INTERVAL_MINUTES;
export const TRACKED_KEYWORDS = ["Elon Musk", "Sam Altman"];
export const MAX_HISTORY_POINTS = 96;

// Paths
export const DATA_DIR = path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_DIR, "oracle.db");

// Safety
export const MAX_SETTLEMENTS_PER_HOUR = 10;
export const MAX_GAS_PRICE_GWEI = 0.1;

export function requireKey(name: string, value: string): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}
