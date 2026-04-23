import { Router } from "express";
import { getDb, MetricType, MetricSnapshotRow } from "../db/schema";
import { TRACKED_KEYWORDS } from "../config";
import { getTodayCost, getAllTimeCost, getCostBreakdown } from "../xApiClient";
import { sendJson } from "../server/json";

// ScoreResult shape expected by existing dashboard.js
export interface LegacyScore {
  keyword: string;
  score: number;
  components: {
    base: number;
    engagementBoost: number;
    diversityFactor: number;
    sampleSize: number;
    uniqueAuthors: number;
  };
  window: { days: number; start: string; end: string };
}

function toLegacyScore(row: MetricSnapshotRow): LegacyScore {
  const comp = JSON.parse(row.raw_components || "{}");
  const toNum = (x: unknown, fallback = 0) => {
    if (typeof x === "number") return x;
    if (typeof x === "string") {
      const n = Number(x);
      return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
  };
  // diversityFactor in snapshot is 1e6 scaled; convert back to fraction for UI
  const diversityScaled = toNum(comp.diversityFactor, 0);
  const diversity = diversityScaled / 1_000_000;
  return {
    keyword: row.keyword,
    score: Number(row.value),
    components: {
      base: toNum(comp.base, 0),
      engagementBoost: toNum(comp.engagementBoost, 0),
      diversityFactor: diversity,
      sampleSize: toNum(comp.sampleSize, 0),
      uniqueAuthors: toNum(comp.uniqueAuthors, 0),
    },
    window: {
      days: 7,
      start: new Date(row.window_start * 1000).toISOString(),
      end: new Date(row.window_end * 1000).toISOString(),
    },
  };
}

function latestForKeyword(keyword: string): LegacyScore | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM metric_snapshots
       WHERE keyword = ? AND metric_type = ?
       ORDER BY computed_at DESC LIMIT 1`
    )
    .get(keyword, MetricType.ENGAGEMENT_WEIGHTED) as MetricSnapshotRow | undefined;
  return row ? toLegacyScore(row) : null;
}

function historyForKeyword(keyword: string): Array<{
  timestamp: string;
  score: number;
  components: LegacyScore["components"];
}> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM metric_snapshots
       WHERE keyword = ? AND metric_type = ?
       ORDER BY computed_at ASC
       LIMIT 96`
    )
    .all(keyword, MetricType.ENGAGEMENT_WEIGHTED) as MetricSnapshotRow[];
  return rows.map((r) => {
    const s = toLegacyScore(r);
    return {
      timestamp: new Date(r.computed_at * 1000).toISOString(),
      score: s.score,
      components: s.components,
    };
  });
}

export function buildLegacyRouter(): Router {
  const router = Router();

  router.get("/api/health", (_req, res) => {
    sendJson(res, {
      status: "ok",
      uptime: process.uptime(),
      todayCost: getTodayCost(),
      allTimeCost: getAllTimeCost(),
      trackedKeywords: TRACKED_KEYWORDS,
    });
  });

  router.get("/api/attention/compare", (req, res) => {
    const a = String(req.query.a || "");
    const b = String(req.query.b || "");
    const scoreA = latestForKeyword(a);
    const scoreB = latestForKeyword(b);
    if (!scoreA || !scoreB) {
      sendJson(res, { error: "One or both keywords not tracked" }, 404);
      return;
    }
    const ratio = scoreB.score > 0 ? scoreA.score / scoreB.score : Infinity;
    sendJson(res, {
      scoreA,
      scoreB,
      ratio: Math.round(ratio * 100) / 100,
      leader: scoreA.score >= scoreB.score ? a : b,
      history: {
        a: historyForKeyword(a),
        b: historyForKeyword(b),
      },
    });
  });

  router.get("/api/attention/:keyword", (req, res) => {
    const keyword = decodeURIComponent(req.params.keyword);
    const score = latestForKeyword(keyword);
    const hist = historyForKeyword(keyword);
    if (!score) {
      sendJson(res, { error: "Keyword not tracked" }, 404);
      return;
    }
    sendJson(res, { score, history: hist });
  });

  router.get("/api/costs", (_req, res) => {
    sendJson(res, {
      today: getTodayCost(),
      allTime: getAllTimeCost(),
      breakdown: getCostBreakdown(),
    });
  });

  return router;
}

// Emit legacy attention:update events for backward-compatible dashboard WS payload.
import { emit, on } from "../services/bus";
export function wireLegacyWsBridge(): void {
  on((data) => {
    const d = data as { type?: string };
    if (d && d.type === "metrics:updated") {
      const scores: Record<string, LegacyScore> = {};
      for (const k of TRACKED_KEYWORDS) {
        const s = latestForKeyword(k);
        if (s) scores[k] = s;
      }
      emit({
        type: "attention:update",
        timestamp: new Date().toISOString(),
        scores,
        costToday: getTodayCost(),
      });
    }
  });
}
