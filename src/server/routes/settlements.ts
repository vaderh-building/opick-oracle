import { Router } from "express";
import { listSettlementLog } from "../../services/settlement";
import { sendJson } from "../json";

export const settlementsRouter = Router();

settlementsRouter.get("/", (req, res) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || "100"), 10) || 100, 1), 500);
  sendJson(res, { settlements: listSettlementLog(limit) });
});
