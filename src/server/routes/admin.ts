import { Router } from "express";
import { AUDIT_HMAC_KEY } from "../../config";
import { triggerSettlementForMarket } from "../../services/settlement";
import { sendJson } from "../json";

export const adminRouter = Router();

adminRouter.post("/trigger-settlement/:marketId", async (req, res) => {
  const header = req.header("x-audit-hmac-key") || req.header("authorization") || "";
  const provided = header.replace(/^Bearer\s+/i, "");
  if (!AUDIT_HMAC_KEY || provided !== AUDIT_HMAC_KEY) {
    sendJson(res, { error: "unauthorized" }, 401);
    return;
  }
  const id = parseInt(req.params.marketId, 10);
  if (!Number.isFinite(id)) {
    sendJson(res, { error: "invalid id" }, 400);
    return;
  }
  const result = await triggerSettlementForMarket(id);
  sendJson(res, result, result.ok ? 200 : 400);
});
