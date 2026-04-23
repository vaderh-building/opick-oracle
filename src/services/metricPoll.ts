import cron from "node-cron";
import {
  MetricType,
  MarketState,
  getDb,
  MetricSnapshotRow,
  getKv,
  setKv,
} from "../db/schema";
import { computeMetric, MetricResult } from "../metrics/compute";
import {
  METRIC_POLL_INTERVAL_MINUTES,
  TRACKED_KEYWORDS,
} from "../config";
import { emit } from "./bus";

const KV_LAST_POLL = "metric_poll_last_ts";
const ALL_METRICS: MetricType[] = [
  MetricType.MENTION_COUNT,
  MetricType.ENGAGEMENT_WEIGHTED,
  MetricType.ENGAGEMENT_DENSITY,
  MetricType.VELOCITY,
];

function distinctTradingKeywords(): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT DISTINCT keyword_a AS k FROM markets WHERE state = ? UNION " +
        "SELECT DISTINCT keyword_b AS k FROM markets WHERE state = ? AND keyword_b IS NOT NULL"
    )
    .all(MarketState.TRADING, MarketState.TRADING) as Array<{ k: string | null }>;
  const set = new Set<string>();
  for (const r of rows) {
    if (r.k && !r.k.startsWith("0x")) set.add(r.k);
  }
  for (const k of TRACKED_KEYWORDS) set.add(k);
  return Array.from(set);
}

function persistSnapshot(result: MetricResult): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO metric_snapshots
      (keyword, metric_type, value, window_start, window_end, computed_at, raw_components)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(keyword, metric_type, computed_at) DO NOTHING`
  ).run(
    result.keyword,
    result.metricType,
    result.value.toString(),
    result.windowStart,
    result.windowEnd,
    Math.floor(Date.now() / 1000),
    JSON.stringify(result.components)
  );
}

export async function pollMetricsOnce(): Promise<{ computed: number; errors: number }> {
  const keywords = distinctTradingKeywords();
  let computed = 0;
  let errors = 0;
  const emitted: Array<{ keyword: string; metric: number; value: string }> = [];

  for (const keyword of keywords) {
    for (const metric of ALL_METRICS) {
      try {
        const r = await computeMetric(keyword, metric, 7);
        persistSnapshot(r);
        computed++;
        emitted.push({ keyword, metric, value: r.value.toString() });
      } catch (err) {
        errors++;
        console.warn(
          `[METRIC_POLL] ${keyword}/${metric} failed:`,
          (err as Error).message
        );
      }
    }
  }

  const db = getDb();
  setKv(db, KV_LAST_POLL, String(Math.floor(Date.now() / 1000)));
  emit({ type: "metrics:updated", metrics: emitted });
  return { computed, errors };
}

export function lastPollAt(): number | null {
  const db = getDb();
  const raw = getKv(db, KV_LAST_POLL);
  return raw ? parseInt(raw, 10) : null;
}

export function getHistoryForKeyword(
  keyword: string,
  metric: MetricType,
  limit = 100
): MetricSnapshotRow[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM metric_snapshots WHERE keyword = ? AND metric_type = ? ORDER BY computed_at DESC LIMIT ?"
    )
    .all(keyword, metric, limit) as MetricSnapshotRow[];
}

export function getLatestByKeyword(keyword: string): MetricSnapshotRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ms.*
       FROM metric_snapshots ms
       INNER JOIN (
         SELECT keyword, metric_type, MAX(computed_at) AS max_t
         FROM metric_snapshots
         WHERE keyword = ?
         GROUP BY keyword, metric_type
       ) latest
       ON ms.keyword = latest.keyword
          AND ms.metric_type = latest.metric_type
          AND ms.computed_at = latest.max_t`
    )
    .all(keyword) as MetricSnapshotRow[];
}

export function startMetricPoll(): void {
  console.log(
    `[METRIC_POLL] Starting, every ${METRIC_POLL_INTERVAL_MINUTES} min`
  );
  pollMetricsOnce().catch((err) =>
    console.error("[METRIC_POLL] initial poll error:", (err as Error).message)
  );
  const expr = `*/${METRIC_POLL_INTERVAL_MINUTES} * * * *`;
  cron.schedule(expr, async () => {
    try {
      const { computed, errors } = await pollMetricsOnce();
      console.log(`[METRIC_POLL] computed=${computed} errors=${errors}`);
    } catch (err) {
      console.error("[METRIC_POLL] cron error:", (err as Error).message);
    }
  });
}
