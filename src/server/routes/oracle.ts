import { Router } from "express";
import { getSignerAddress } from "../../oracle/signer";
import { lastSyncAt } from "../../services/marketSync";
import { lastPollAt } from "../../services/metricPoll";
import { lastSettlementCheckAt, pendingSettlementsCount } from "../../services/settlement";
import {
  V6_FACTORY_ADDRESS,
  CHAIN_ID,
} from "../../config";
import { sendJson } from "../json";
import { getPublicClient } from "../../oracle/contracts";

export const oracleRouter = Router();

function mask(addr: string | null): string | null {
  if (!addr) return null;
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

oracleRouter.get("/status", async (_req, res) => {
  let blockNumber: string | null = null;
  try {
    const pub = getPublicClient();
    blockNumber = (await pub.getBlockNumber()).toString();
  } catch {}
  const addr = getSignerAddress();
  sendJson(res, {
    oracleAddress: addr,
    oracleAddressMasked: mask(addr),
    chainId: CHAIN_ID,
    factoryAddress: V6_FACTORY_ADDRESS || null,
    blockNumber,
    lastMarketSync: lastSyncAt(),
    lastMetricPoll: lastPollAt(),
    lastSettlementCheck: lastSettlementCheckAt(),
    pendingSettlements: pendingSettlementsCount(),
  });
});
