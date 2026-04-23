import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { PORT, TRACKED_KEYWORDS } from "./config";
import { getTodayCost, getAllTimeCost, getCostBreakdown } from "./xApiClient";
import { startOracle, getLatestScore, getHistory, onUpdate } from "./oracleService";

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, "..", "public")));

// API routes
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    todayCost: getTodayCost(),
    allTimeCost: getAllTimeCost(),
    trackedKeywords: TRACKED_KEYWORDS,
  });
});

app.get("/api/attention/:keyword", (req, res) => {
  const keyword = decodeURIComponent(req.params.keyword);
  const score = getLatestScore(keyword);
  const hist = getHistory(keyword);
  if (!score) {
    return res.status(404).json({ error: "Keyword not tracked" });
  }
  res.json({ score, history: hist });
});

app.get("/api/attention/compare", (req, res) => {
  const a = String(req.query.a || "");
  const b = String(req.query.b || "");
  const scoreA = getLatestScore(a);
  const scoreB = getLatestScore(b);
  if (!scoreA || !scoreB) {
    return res.status(404).json({ error: "One or both keywords not tracked" });
  }
  const ratio = scoreB.score > 0 ? scoreA.score / scoreB.score : Infinity;
  res.json({
    scoreA,
    scoreB,
    ratio: Math.round(ratio * 100) / 100,
    leader: scoreA.score >= scoreB.score ? a : b,
    history: {
      a: getHistory(a),
      b: getHistory(b),
    },
  });
});

app.get("/api/costs", (_req, res) => {
  const breakdown = getCostBreakdown();
  res.json({
    today: getTodayCost(),
    allTime: getAllTimeCost(),
    breakdown,
  });
});

// Serve index.html for root
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket
const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});

onUpdate((data) => {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
});

// Start
server.listen(PORT, async () => {
  console.log(`OPick Oracle running at http://localhost:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  try {
    await startOracle();
  } catch (err) {
    console.error("[SERVER] Oracle startup error:", (err as Error).message);
  }
});
