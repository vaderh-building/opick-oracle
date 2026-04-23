import { MetricType } from "../db/schema";
import { getMentionCount, getRecentEngagement, getTodayCost } from "../xApiClient";
import { applyFormula, FormulaInput } from "./formulas";

export interface MetricResult {
  keyword: string;
  metricType: MetricType;
  value: bigint;
  windowStart: number;
  windowEnd: number;
  components: Record<string, string | number>;
  sourceCost: number;
}

// Cache keyed by (keyword, metric, floor(now/15min)) to prevent double work.
const cache = new Map<string, { result: MetricResult; expiresAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function cacheKey(keyword: string, metric: MetricType, now: number): string {
  const bucket = Math.floor(now / CACHE_TTL_MS);
  return `${keyword}|${metric}|${bucket}`;
}

export function clearMetricCache(): void {
  cache.clear();
}

export async function computeMetric(
  keyword: string,
  metric: MetricType,
  windowDays: number,
  opts?: { now?: number; windowStart?: number; windowEnd?: number }
): Promise<MetricResult> {
  const now = opts?.now ?? Date.now();
  const key = cacheKey(keyword, metric, now);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.result;
  }

  const costBefore = getTodayCost();

  const [mention, engagement] = await Promise.all([
    getMentionCount(keyword, windowDays),
    getRecentEngagement(keyword, 100),
  ]);

  const input: FormulaInput = {
    mention: {
      totalMentions: mention.total,
      daily: mention.daily.map((d) => ({ start: d.start, count: d.count })),
    },
    engagement: {
      sampleSize: engagement.sampleSize,
      totalLikes: engagement.totalLikes,
      totalReposts: engagement.totalReposts,
      totalReplies: engagement.totalReplies,
      uniqueAuthors: engagement.uniqueAuthors,
    },
    windowDays,
  };

  const { value, components } = applyFormula(metric, input);
  const sourceCost = Math.max(0, getTodayCost() - costBefore);

  const windowEnd = opts?.windowEnd ?? Math.floor(now / 1000);
  const windowStart = opts?.windowStart ?? windowEnd - windowDays * 86400;

  const result: MetricResult = {
    keyword,
    metricType: metric,
    value,
    windowStart,
    windowEnd,
    components,
    sourceCost,
  };

  cache.set(key, { result, expiresAt: now + CACHE_TTL_MS });
  return result;
}

// Pure variant used by tests and deterministic settlement computation.
export function computeMetricFromInput(
  keyword: string,
  metric: MetricType,
  input: FormulaInput,
  windowStart: number,
  windowEnd: number
): MetricResult {
  const { value, components } = applyFormula(metric, input);
  return {
    keyword,
    metricType: metric,
    value,
    windowStart,
    windowEnd,
    components,
    sourceCost: 0,
  };
}
