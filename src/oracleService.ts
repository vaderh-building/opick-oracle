import cron from "node-cron";
import { TRACKED_KEYWORDS, POLL_INTERVAL_MINUTES, MAX_HISTORY_POINTS } from "./config";
import { getEngagementWeightedScore, getTodayCost, ScoreResult } from "./xApiClient";

export interface HistoryPoint {
  timestamp: string;
  score: number;
  components: ScoreResult["components"];
}

// State
const latestScores = new Map<string, ScoreResult>();
const history = new Map<string, HistoryPoint[]>();
const listeners: Array<(data: unknown) => void> = [];

export function getLatestScore(keyword: string): ScoreResult | null {
  return latestScores.get(keyword) || null;
}

export function getHistory(keyword: string): HistoryPoint[] {
  return history.get(keyword) || [];
}

export function getTrackedKeywords(): string[] {
  return [...TRACKED_KEYWORDS];
}

export function onUpdate(cb: (data: unknown) => void): void {
  listeners.push(cb);
}

function emit(data: unknown): void {
  for (const cb of listeners) {
    try { cb(data); } catch {}
  }
}

async function fetchAll(): Promise<void> {
  const timestamp = new Date().toISOString();
  const scores: Record<string, ScoreResult> = {};

  for (const keyword of TRACKED_KEYWORDS) {
    try {
      console.log(`[ORACLE] Fetching score for "${keyword}"...`);
      const result = await getEngagementWeightedScore(keyword, 7);
      latestScores.set(keyword, result);
      scores[keyword] = result;

      // Append to history
      const hist = history.get(keyword) || [];
      hist.push({ timestamp, score: result.score, components: result.components });
      if (hist.length > MAX_HISTORY_POINTS) hist.shift();
      history.set(keyword, hist);

      console.log(`[ORACLE] ${keyword}: score=${Math.round(result.score).toLocaleString()}, base=${result.components.base.toLocaleString()}`);
    } catch (err) {
      console.error(`[ORACLE] Failed to fetch "${keyword}":`, (err as Error).message);
    }
  }

  emit({
    type: "attention:update",
    timestamp,
    scores,
    costToday: getTodayCost(),
  });
}

export async function startOracle(): Promise<void> {
  console.log(`[ORACLE] Starting with keywords: ${TRACKED_KEYWORDS.join(", ")}`);
  console.log(`[ORACLE] Poll interval: ${POLL_INTERVAL_MINUTES} minutes`);

  // Fetch immediately on startup
  await fetchAll();

  // Schedule recurring fetches
  const cronExpr = `*/${POLL_INTERVAL_MINUTES} * * * *`;
  cron.schedule(cronExpr, async () => {
    console.log("[ORACLE] Scheduled poll running...");
    await fetchAll();
  });

  console.log("[ORACLE] Cron scheduled, next poll in ~" + POLL_INTERVAL_MINUTES + " minutes");
}
