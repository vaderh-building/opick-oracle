import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import factoryAbiRaw from "./abi/factory.json";
import marketAbiRaw from "./abi/market.json";
import { BASE_RPC_URL, CHAIN_ID } from "../config";

export const factoryAbi = factoryAbiRaw as any;
export const marketAbi = marketAbiRaw as any;

function resolveChain() {
  if (CHAIN_ID === 8453) return base;
  return defineChain({
    id: CHAIN_ID,
    name: `chain-${CHAIN_ID}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [BASE_RPC_URL] } },
  });
}

export function getPublicClient() {
  return createPublicClient({
    chain: resolveChain(),
    transport: http(BASE_RPC_URL),
  });
}

export function getWalletClient(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({
    account,
    chain: resolveChain(),
    transport: http(BASE_RPC_URL),
  });
  return { client, account };
}
