import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import { PORT, DASHBOARD_ENABLED, V6_FACTORY_ADDRESS } from "../config";
import { getDb } from "../db/schema";
import { startMarketSync } from "../services/marketSync";
import { startMetricPoll } from "../services/metricPoll";
import { startSettlement } from "../services/settlement";
import { setupWebSocket } from "./ws";
import { buildLegacyRouter, wireLegacyWsBridge } from "../legacy/dashboardBootstrap";
import { marketsRouter } from "./routes/markets";
import { metricsRouter } from "./routes/metrics";
import { settlementsRouter } from "./routes/settlements";
import { oracleRouter } from "./routes/oracle";
import { adminRouter } from "./routes/admin";

async function main() {
  // Initialize DB up front so failing fast is visible
  getDb();

  const app = express();
  app.use(cors());
  app.use(express.json());

  if (DASHBOARD_ENABLED) {
    app.use(express.static(path.join(__dirname, "..", "..", "public")));
  }

  // Legacy routes first
  app.use(buildLegacyRouter());

  // New API
  app.use("/api/markets", marketsRouter);
  app.use("/api/metrics", metricsRouter);
  app.use("/api/settlements", settlementsRouter);
  app.use("/api/oracle", oracleRouter);
  app.use("/api/admin", adminRouter);

  if (DASHBOARD_ENABLED) {
    app.get("/", (_req, res) => {
      res.sendFile(path.join(__dirname, "..", "..", "public", "index.html"));
    });
  }

  const server = http.createServer(app);
  setupWebSocket(server);
  wireLegacyWsBridge();

  server.listen(PORT, () => {
    console.log(`OPick Oracle v2 running at http://localhost:${PORT}`);
    if (DASHBOARD_ENABLED) console.log(`Dashboard: http://localhost:${PORT}/`);
    console.log(`Oracle status: http://localhost:${PORT}/api/oracle/status`);
    if (!V6_FACTORY_ADDRESS) {
      console.warn(
        "[BOOT] V6_FACTORY_ADDRESS empty; settlement waiting for deployment"
      );
    }
  });

  startMetricPoll();
  startMarketSync();
  startSettlement();
}

main().catch((err) => {
  console.error("[BOOT] fatal:", err);
  process.exit(1);
});
