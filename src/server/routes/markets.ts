import { Router } from "express";
import { getDb, MetricSnapshotRow, MARKET_STATE_NAMES, MARKET_TYPE_NAMES, METRIC_TYPE_NAMES } from "../../db/schema";
import { listMarkets, getMarket } from "../../services/marketSync";
import { listSettlementLogForMarket } from "../../services/settlement";
import { sendJson } from "../json";

export const marketsRouter = Router();

function decorate(row: any) {
  return {
    ...row,
    state_name: MARKET_STATE_NAMES[row.state] ?? String(row.state),
    market_type_name: MARKET_TYPE_NAMES[row.market_type] ?? String(row.market_type),
    metric_type_name: METRIC_TYPE_NAMES[row.metric_type] ?? String(row.metric_type),
  };
}

marketsRouter.get("/", (_req, res) => {
  sendJson(res, { markets: listMarkets().map(decorate) });
});

marketsRouter.get("/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    sendJson(res, { error: "invalid id" }, 400);
    return;
  }
  const market = getMarket(id);
  if (!market) {
    sendJson(res, { error: "market not found" }, 404);
    return;
  }

  const db = getDb();
  const metricType = market.metric_type;
  const latest = db
    .prepare(
      `SELECT ms.*
       FROM metric_snapshots ms
       INNER JOIN (
         SELECT keyword, metric_type, MAX(computed_at) AS t
         FROM metric_snapshots
         WHERE metric_type = ? AND keyword IN (?, COALESCE(?, ''))
         GROUP BY keyword, metric_type
       ) latest
       ON ms.keyword = latest.keyword
          AND ms.metric_type = latest.metric_type
          AND ms.computed_at = latest.t`
    )
    .all(metricType, market.keyword_a, market.keyword_b) as MetricSnapshotRow[];

  const settlementHistory = listSettlementLogForMarket(id);
  sendJson(res, {
    market: decorate(market),
    metrics: latest,
    settlementHistory,
  });
});

marketsRouter.get("/:id/history", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    sendJson(res, { error: "invalid id" }, 400);
    return;
  }
  const market = getMarket(id);
  if (!market) {
    sendJson(res, { error: "market not found" }, 404);
    return;
  }
  const db = getDb();
  const history = db
    .prepare(
      `SELECT * FROM metric_snapshots
       WHERE metric_type = ?
         AND keyword IN (?, COALESCE(?, ''))
       ORDER BY computed_at ASC
       LIMIT 1000`
    )
    .all(market.metric_type, market.keyword_a, market.keyword_b) as MetricSnapshotRow[];
  sendJson(res, { marketId: id, history });
});
