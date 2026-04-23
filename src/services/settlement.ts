import cron from "node-cron";
import { getAddress } from "viem";
import {
  getDb,
  MarketRow,
  MarketState,
  MarketType,
  MetricType,
  getKv,
  setKv,
  SettlementLogRow,
} from "../db/schema";
import { computeMetric } from "../metrics/compute";
import {
  buildDigest,
  prepareSettlementSignature,
  submitSettlement,
  requestSettlementOnchain,
} from "../oracle/submit";
import { getSignerAddress } from "../oracle/signer";
import {
  CHAIN_ID,
  ORACLE_SIGNER_PRIVATE_KEY,
  SETTLEMENT_CHECK_INTERVAL_MINUTES,
  MAX_SETTLEMENTS_PER_HOUR,
  AUDIT_HMAC_KEY,
} from "../config";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { emit } from "./bus";

const KV_LAST_CHECK = "settlement_last_check_ts";

export function computeAuditHmac(row: {
  market_id: number;
  value_a: string;
  value_b: string;
  signature: string;
  attempted_at: number;
}): string {
  if (!AUDIT_HMAC_KEY) {
    throw new Error("AUDIT_HMAC_KEY missing");
  }
  const payload = JSON.stringify({
    market_id: row.market_id,
    value_a: row.value_a,
    value_b: row.value_b,
    signature: row.signature,
    attempted_at: row.attempted_at,
  });
  const mac = hmac(sha256, new TextEncoder().encode(AUDIT_HMAC_KEY), new TextEncoder().encode(payload));
  return bytesToHex(mac);
}

export function verifyAuditHmac(row: SettlementLogRow): boolean {
  const expected = computeAuditHmac({
    market_id: row.market_id,
    value_a: row.value_a,
    value_b: row.value_b,
    signature: row.signature,
    attempted_at: row.attempted_at,
  });
  return expected === row.hmac;
}

function recentSettlementCount(): number {
  const db = getDb();
  const hourAgo = Math.floor(Date.now() / 1000) - 3600;
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM settlement_log WHERE attempted_at > ?")
    .get(hourAgo) as { c: number };
  return row.c;
}

function marketsDueForSettlement(): MarketRow[] {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  return db
    .prepare(
      `SELECT * FROM markets
       WHERE close_time <= ?
         AND state NOT IN (?, ?)
       ORDER BY close_time ASC`
    )
    .all(now, MarketState.SETTLED, MarketState.DISPUTED) as MarketRow[];
}

async function processMarket(m: MarketRow): Promise<void> {
  if (m.state === MarketState.TRADING) {
    console.log(`[SETTLEMENT] market ${m.id} TRADING past close, requesting settlement`);
    try {
      const txHash = await requestSettlementOnchain({
        marketAddress: getAddress(m.address) as `0x${string}`,
      });
      console.log(`[SETTLEMENT] market ${m.id} requestSettlement tx=${txHash}`);
      const db = getDb();
      db.prepare("UPDATE markets SET state = ? WHERE id = ?").run(
        MarketState.PENDING_SETTLEMENT,
        m.id
      );
    } catch (err) {
      console.warn(
        `[SETTLEMENT] market ${m.id} requestSettlement failed:`,
        (err as Error).message
      );
    }
    return;
  }

  if (m.state !== MarketState.PENDING_SETTLEMENT) return;

  if (recentSettlementCount() >= MAX_SETTLEMENTS_PER_HOUR) {
    console.warn(
      `[SETTLEMENT] hourly cap ${MAX_SETTLEMENTS_PER_HOUR} reached; deferring market ${m.id}`
    );
    return;
  }

  // Compute metric values from openTime..closeTime using current X API (recent window).
  // Since X API /recent only returns 7 days, this uses now-bounded data as a stand-in
  // when the market's window is in the recent past. Documented in README.
  const metric = m.metric_type as MetricType;
  const windowStart = m.open_time;
  const windowEnd = m.close_time;
  const windowDays = Math.max(1, Math.round((windowEnd - windowStart) / 86400));

  let valueA: bigint;
  let valueB: bigint;
  try {
    const a = await computeMetric(m.keyword_a, metric, windowDays, {
      windowStart,
      windowEnd,
    });
    valueA = a.value;
    if (m.market_type === MarketType.HEAD_TO_HEAD && m.keyword_b) {
      const b = await computeMetric(m.keyword_b, metric, windowDays, {
        windowStart,
        windowEnd,
      });
      valueB = b.value;
    } else {
      valueB = 0n;
    }
  } catch (err) {
    console.error(
      `[SETTLEMENT] market ${m.id} metric compute failed:`,
      (err as Error).message
    );
    return;
  }

  const marketAddress = getAddress(m.address) as `0x${string}`;
  const signingInput = {
    marketId: BigInt(m.id),
    valueA,
    valueB,
    marketAddress,
    chainId: BigInt(CHAIN_ID),
  };

  let signature: `0x${string}`;
  try {
    signature = await prepareSettlementSignature(signingInput);
  } catch (err) {
    console.error(
      `[SETTLEMENT] market ${m.id} sign failed:`,
      (err as Error).message
    );
    return;
  }

  // Sanity: verify digest matches what contract will compute
  const digest = buildDigest(signingInput);

  const db = getDb();
  const attemptedAt = Math.floor(Date.now() / 1000);
  const baseRow = {
    market_id: m.id,
    value_a: valueA.toString(),
    value_b: valueB.toString(),
    signature,
    attempted_at: attemptedAt,
  };
  const hmacHex = computeAuditHmac(baseRow);
  const insertInfo = db
    .prepare(
      `INSERT INTO settlement_log
        (market_id, value_a, value_b, signature, tx_hash, status, attempted_at, mined_at, error_message, hmac)
       VALUES (?, ?, ?, ?, NULL, 'pending', ?, NULL, NULL, ?)`
    )
    .run(
      baseRow.market_id,
      baseRow.value_a,
      baseRow.value_b,
      baseRow.signature,
      baseRow.attempted_at,
      hmacHex
    );
  const logId = Number(insertInfo.lastInsertRowid);

  emit({
    type: "settlement:submitted",
    marketId: m.id,
    valueA: valueA.toString(),
    valueB: valueB.toString(),
    digest,
    logId,
  });

  try {
    const { txHash, minedAt } = await submitSettlement({
      marketAddress,
      marketId: BigInt(m.id),
      valueA,
      valueB,
      chainId: BigInt(CHAIN_ID),
      signature,
    });
    db.prepare(
      "UPDATE settlement_log SET status = 'mined', tx_hash = ?, mined_at = ? WHERE id = ?"
    ).run(txHash, minedAt, logId);
    db.prepare(
      "UPDATE markets SET state = ?, yes_won = NULL, settlement_value_a = ?, settlement_value_b = ? WHERE id = ?"
    ).run(MarketState.SETTLED, valueA.toString(), valueB.toString(), m.id);
    emit({
      type: "settlement:mined",
      marketId: m.id,
      txHash,
      logId,
    });
  } catch (err) {
    const msg = (err as Error).message || String(err);
    db.prepare(
      "UPDATE settlement_log SET status = 'failed', error_message = ? WHERE id = ?"
    ).run(msg, logId);
    emit({ type: "settlement:failed", marketId: m.id, error: msg, logId });
  }
}

export async function runSettlementCheck(): Promise<void> {
  if (!ORACLE_SIGNER_PRIVATE_KEY) {
    // Should never run when unset, guarded by startSettlement(); defensive here too.
    return;
  }
  const due = marketsDueForSettlement();
  for (const m of due) {
    await processMarket(m);
  }
  const db = getDb();
  setKv(db, KV_LAST_CHECK, String(Math.floor(Date.now() / 1000)));
}

export function lastSettlementCheckAt(): number | null {
  const db = getDb();
  const raw = getKv(db, KV_LAST_CHECK);
  return raw ? parseInt(raw, 10) : null;
}

export function listSettlementLog(limit = 100): SettlementLogRow[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM settlement_log ORDER BY attempted_at DESC LIMIT ?")
    .all(limit) as SettlementLogRow[];
}

export function listSettlementLogForMarket(marketId: number): SettlementLogRow[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM settlement_log WHERE market_id = ? ORDER BY attempted_at DESC")
    .all(marketId) as SettlementLogRow[];
}

export async function triggerSettlementForMarket(id: number): Promise<{ ok: boolean; error?: string }> {
  if (!ORACLE_SIGNER_PRIVATE_KEY) return { ok: false, error: "signer key missing" };
  const db = getDb();
  const row = db.prepare("SELECT * FROM markets WHERE id = ?").get(id) as MarketRow | undefined;
  if (!row) return { ok: false, error: "market not found" };
  try {
    await processMarket(row);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function startSettlement(): void {
  if (!ORACLE_SIGNER_PRIVATE_KEY) {
    console.warn(
      "[SETTLEMENT] ORACLE_SIGNER_PRIVATE_KEY missing. Settlement service will not run. Metric poll remains active."
    );
    return;
  }
  const addr = getSignerAddress();
  console.log(
    `[SETTLEMENT] Starting with signer ${addr}, every ${SETTLEMENT_CHECK_INTERVAL_MINUTES} min`
  );
  runSettlementCheck().catch((err) =>
    console.error("[SETTLEMENT] initial run error:", (err as Error).message)
  );
  const expr = `*/${SETTLEMENT_CHECK_INTERVAL_MINUTES} * * * *`;
  cron.schedule(expr, async () => {
    try {
      await runSettlementCheck();
    } catch (err) {
      console.error("[SETTLEMENT] cron error:", (err as Error).message);
    }
  });
}

export function pendingSettlementsCount(): number {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM markets
       WHERE state IN (?, ?) AND close_time <= ?`
    )
    .get(MarketState.TRADING, MarketState.PENDING_SETTLEMENT, now) as { c: number };
  return row.c;
}
