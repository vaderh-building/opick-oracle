import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { on } from "../services/bus";

export function setupWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });

  on((data) => {
    const msg = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  });
}
