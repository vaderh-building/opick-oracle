import { Router } from "express";
import { getDb, METRIC_TYPE_NAMES, MetricType } from "../../db/schema";
import { sendJson } from "../json";

export const metricsRouter = Router();

metricsRouter.get("/:keyword/:metricType", (req, res) => {
  const keyword = decodeURIComponent(req.params.keyword);
  let metric: number;
  const raw = req.params.metricType;
  if (/^\d+$/.test(raw)) metric = parseInt(raw, 10);
  else {
    const found = Object.entries(METRIC_TYPE_NAMES).find(([, v]) => v === raw.toUpperCase());
    if (!found) {
      sendJson(res, { error: "unknown metricType" }, 400);
      return;
    }
    metric = Number(found[0]);
  }
  if (!(metric in MetricType)) {
    sendJson(res, { error: "unknown metricType" }, 400);
    return;
  }

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM metric_snapshots
       WHERE keyword = ? AND metric_type = ?
       ORDER BY computed_at ASC
       LIMIT 500`
    )
    .all(keyword, metric);
  sendJson(res, { keyword, metricType: metric, metricTypeName: METRIC_TYPE_NAMES[metric], history: rows });
});
