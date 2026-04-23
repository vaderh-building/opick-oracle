import cron from "node-cron";
import { getAddress, type Abi } from "viem";
import { factoryAbi, marketAbi, getPublicClient } from "../oracle/contracts";
import { V6_FACTORY_ADDRESS, MARKET_SYNC_INTERVAL_MINUTES } from "../config";
import { getDb, MarketRow, getKv, setKv } from "../db/schema";
import { emit } from "./bus";

const KV_LAST_BLOCK = "factory_last_scanned_block";
const KV_LAST_SYNC = "market_sync_last_ts";

interface OnchainMarket {
  address: `0x${string}`;
  marketId: bigint;
  marketType: number;
  metricType: number;
  keywordAHash: `0x${string}`;
  keywordBHash: `0x${string}`;
  threshold: bigint;
  openTime: bigint;
  closeTime: bigint;
  settlementDeadline: bigint;
  state: number;
  yesWon: boolean;
  settlementValueA: bigint;
  settlementValueB: bigint;
}

async function readMarket(
  pub: any,
  address: `0x${string}`
): Promise<OnchainMarket> {
  const results = await pub.multicall({
    contracts: [
      { address, abi: marketAbi as Abi, functionName: "marketId" },
      { address, abi: marketAbi as Abi, functionName: "marketType" },
      { address, abi: marketAbi as Abi, functionName: "metricType" },
      { address, abi: marketAbi as Abi, functionName: "keywordA" },
      { address, abi: marketAbi as Abi, functionName: "keywordB" },
      { address, abi: marketAbi as Abi, functionName: "threshold" },
      { address, abi: marketAbi as Abi, functionName: "openTime" },
      { address, abi: marketAbi as Abi, functionName: "closeTime" },
      { address, abi: marketAbi as Abi, functionName: "settlementDeadline" },
      { address, abi: marketAbi as Abi, functionName: "state" },
      { address, abi: marketAbi as Abi, functionName: "yesWon" },
      { address, abi: marketAbi as Abi, functionName: "settlementValueA" },
      { address, abi: marketAbi as Abi, functionName: "settlementValueB" },
    ],
    allowFailure: false,
  });

  return {
    address,
    marketId: results[0] as bigint,
    marketType: Number(results[1]),
    metricType: Number(results[2]),
    keywordAHash: results[3] as `0x${string}`,
    keywordBHash: results[4] as `0x${string}`,
    threshold: results[5] as bigint,
    openTime: results[6] as bigint,
    closeTime: results[7] as bigint,
    settlementDeadline: results[8] as bigint,
    state: Number(results[9]),
    yesWon: results[10] as boolean,
    settlementValueA: results[11] as bigint,
    settlementValueB: results[12] as bigint,
  };
}

async function updateKeywordRegistry(pub: any): Promise<void> {
  const db = getDb();
  const latest = await pub.getBlockNumber();
  const fromRaw = getKv(db, KV_LAST_BLOCK);
  const from = fromRaw ? BigInt(fromRaw) : latest > 1_000_000n ? latest - 1_000_000n : 0n;

  // Chunk scans to avoid RPC limits
  const chunk = 50_000n;
  let cursor = from;
  while (cursor <= latest) {
    const end = cursor + chunk > latest ? latest : cursor + chunk;
    try {
      const logs = await pub.getContractEvents({
        address: getAddress(V6_FACTORY_ADDRESS),
        abi: factoryAbi as Abi,
        eventName: "KeywordRegistered",
        fromBlock: cursor,
        toBlock: end,
      });
      const now = Math.floor(Date.now() / 1000);
      const insert = db.prepare(
        "INSERT INTO keyword_registry (hash, keyword, first_seen) VALUES (?, ?, ?) ON CONFLICT(hash) DO NOTHING"
      );
      for (const l of logs) {
        const args = (l as any).args as { hash?: `0x${string}`; keyword?: string };
        if (args.hash && args.keyword) {
          insert.run(args.hash.toLowerCase(), args.keyword, now);
        }
      }
    } catch (err) {
      console.warn(
        `[MARKET_SYNC] keyword log scan ${cursor}..${end} failed:`,
        (err as Error).message
      );
    }
    cursor = end + 1n;
  }
  setKv(db, KV_LAST_BLOCK, latest.toString());
}

function lookupKeyword(hash: `0x${string}`): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT keyword FROM keyword_registry WHERE hash = ?")
    .get(hash.toLowerCase()) as { keyword: string } | undefined;
  return row ? row.keyword : null;
}

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

function upsertMarket(m: OnchainMarket): void {
  const db = getDb();
  const keywordA = lookupKeyword(m.keywordAHash) || m.keywordAHash;
  const keywordB = m.keywordBHash === ZERO_HASH ? null : lookupKeyword(m.keywordBHash) || m.keywordBHash;
  const now = Math.floor(Date.now() / 1000);

  db.prepare(
    `INSERT INTO markets (
      id, address, market_type, metric_type, keyword_a, keyword_b, threshold,
      open_time, close_time, settlement_deadline, state, yes_won,
      settlement_value_a, settlement_value_b, last_synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      address = excluded.address,
      market_type = excluded.market_type,
      metric_type = excluded.metric_type,
      keyword_a = excluded.keyword_a,
      keyword_b = excluded.keyword_b,
      threshold = excluded.threshold,
      open_time = excluded.open_time,
      close_time = excluded.close_time,
      settlement_deadline = excluded.settlement_deadline,
      state = excluded.state,
      yes_won = excluded.yes_won,
      settlement_value_a = excluded.settlement_value_a,
      settlement_value_b = excluded.settlement_value_b,
      last_synced = excluded.last_synced`
  ).run(
    Number(m.marketId),
    m.address.toLowerCase(),
    m.marketType,
    m.metricType,
    keywordA,
    keywordB,
    m.threshold.toString(),
    Number(m.openTime),
    Number(m.closeTime),
    Number(m.settlementDeadline),
    m.state,
    m.state === 2 /* SETTLED */ ? (m.yesWon ? 1 : 0) : null,
    m.settlementValueA.toString(),
    m.settlementValueB.toString(),
    now
  );
}

export async function syncMarketsOnce(): Promise<{ synced: number; errors: number }> {
  if (!V6_FACTORY_ADDRESS) {
    return { synced: 0, errors: 0 };
  }
  const pub = getPublicClient();

  try {
    await updateKeywordRegistry(pub);
  } catch (err) {
    console.warn("[MARKET_SYNC] keyword registry update failed:", (err as Error).message);
  }

  let addresses: readonly `0x${string}`[];
  try {
    addresses = (await pub.readContract({
      address: getAddress(V6_FACTORY_ADDRESS),
      abi: factoryAbi as Abi,
      functionName: "getAllMarkets",
    })) as readonly `0x${string}`[];
  } catch (err) {
    console.error("[MARKET_SYNC] getAllMarkets failed:", (err as Error).message);
    return { synced: 0, errors: 1 };
  }

  let synced = 0;
  let errors = 0;
  for (const addr of addresses) {
    try {
      const m = await readMarket(pub, addr);
      upsertMarket(m);
      synced++;
    } catch (err) {
      errors++;
      console.warn(`[MARKET_SYNC] failed ${addr}:`, (err as Error).message);
    }
  }

  const db = getDb();
  setKv(db, KV_LAST_SYNC, String(Math.floor(Date.now() / 1000)));

  emit({ type: "markets:updated", count: synced, errors });
  return { synced, errors };
}

export function lastSyncAt(): number | null {
  const db = getDb();
  const raw = getKv(db, KV_LAST_SYNC);
  return raw ? parseInt(raw, 10) : null;
}

export function listMarkets(): MarketRow[] {
  const db = getDb();
  return db.prepare("SELECT * FROM markets ORDER BY id ASC").all() as MarketRow[];
}

export function getMarket(id: number): MarketRow | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM markets WHERE id = ?").get(id) as MarketRow | undefined;
  return row ?? null;
}

export function startMarketSync(): void {
  if (!V6_FACTORY_ADDRESS) {
    console.warn(
      "[MARKET_SYNC] V6_FACTORY_ADDRESS empty. Waiting for deployment, sync disabled."
    );
    return;
  }
  console.log(
    `[MARKET_SYNC] Starting for factory ${V6_FACTORY_ADDRESS}, every ${MARKET_SYNC_INTERVAL_MINUTES} min`
  );
  // Initial run in background so server can start listening immediately
  syncMarketsOnce().catch((err) =>
    console.error("[MARKET_SYNC] initial sync error:", (err as Error).message)
  );

  const expr = `*/${MARKET_SYNC_INTERVAL_MINUTES} * * * *`;
  cron.schedule(expr, async () => {
    try {
      const { synced, errors } = await syncMarketsOnce();
      console.log(`[MARKET_SYNC] synced=${synced} errors=${errors}`);
    } catch (err) {
      console.error("[MARKET_SYNC] cron error:", (err as Error).message);
    }
  });
}
