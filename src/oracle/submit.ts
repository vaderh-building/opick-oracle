import { parseGwei, formatGwei } from "viem";
import { getPublicClient, getWalletClient, marketAbi } from "./contracts";
import { buildDigest, signSettlement, SigningInput, getSignerAccount } from "./signer";
import { MAX_GAS_PRICE_GWEI, ORACLE_SIGNER_PRIVATE_KEY } from "../config";

export interface SubmitSettlementResult {
  signature: `0x${string}`;
  txHash: `0x${string}`;
  minedAt: number;
}

export async function prepareSettlementSignature(input: SigningInput): Promise<`0x${string}`> {
  return signSettlement(input);
}

/**
 * Simulates then submits submitSettlement. Aborts if gas price exceeds
 * MAX_GAS_PRICE_GWEI. Returns tx hash and mined timestamp on success; throws otherwise.
 */
export async function submitSettlement(params: {
  marketAddress: `0x${string}`;
  marketId: bigint;
  valueA: bigint;
  valueB: bigint;
  chainId: bigint;
  signature: `0x${string}`;
}): Promise<SubmitSettlementResult> {
  if (!ORACLE_SIGNER_PRIVATE_KEY) throw new Error("ORACLE_SIGNER_PRIVATE_KEY missing");

  const pk = (ORACLE_SIGNER_PRIVATE_KEY.startsWith("0x")
    ? ORACLE_SIGNER_PRIVATE_KEY
    : `0x${ORACLE_SIGNER_PRIVATE_KEY}`) as `0x${string}`;

  const pub = getPublicClient();
  const { client: wallet, account } = getWalletClient(pk);

  const gasPrice = await pub.getGasPrice();
  const maxAllowed = parseGwei(String(MAX_GAS_PRICE_GWEI));
  if (gasPrice > maxAllowed) {
    throw new Error(
      `gas price ${formatGwei(gasPrice)} gwei exceeds cap ${MAX_GAS_PRICE_GWEI} gwei`
    );
  }

  await pub.simulateContract({
    address: params.marketAddress,
    abi: marketAbi,
    functionName: "submitSettlement",
    args: [params.valueA, params.valueB, params.signature],
    account: account.address,
  });

  const estGas = await pub.estimateContractGas({
    address: params.marketAddress,
    abi: marketAbi,
    functionName: "submitSettlement",
    args: [params.valueA, params.valueB, params.signature],
    account: account.address,
  });
  const gasLimit = (estGas * 120n) / 100n;

  const txHash = await wallet.writeContract({
    address: params.marketAddress,
    abi: marketAbi,
    functionName: "submitSettlement",
    args: [params.valueA, params.valueB, params.signature],
    gas: gasLimit,
    gasPrice,
  });

  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`submitSettlement reverted in tx ${txHash}`);
  }
  return { signature: params.signature, txHash, minedAt: Math.floor(Date.now() / 1000) };
}

export async function requestSettlementOnchain(params: {
  marketAddress: `0x${string}`;
}): Promise<`0x${string}`> {
  if (!ORACLE_SIGNER_PRIVATE_KEY) throw new Error("ORACLE_SIGNER_PRIVATE_KEY missing");
  const pk = (ORACLE_SIGNER_PRIVATE_KEY.startsWith("0x")
    ? ORACLE_SIGNER_PRIVATE_KEY
    : `0x${ORACLE_SIGNER_PRIVATE_KEY}`) as `0x${string}`;

  const pub = getPublicClient();
  const { client: wallet, account } = getWalletClient(pk);

  const gasPrice = await pub.getGasPrice();
  const maxAllowed = parseGwei(String(MAX_GAS_PRICE_GWEI));
  if (gasPrice > maxAllowed) {
    throw new Error(
      `gas price ${formatGwei(gasPrice)} gwei exceeds cap ${MAX_GAS_PRICE_GWEI} gwei`
    );
  }

  await pub.simulateContract({
    address: params.marketAddress,
    abi: marketAbi,
    functionName: "requestSettlement",
    args: [],
    account: account.address,
  });

  const estGas = await pub.estimateContractGas({
    address: params.marketAddress,
    abi: marketAbi,
    functionName: "requestSettlement",
    args: [],
    account: account.address,
  });
  const gasLimit = (estGas * 120n) / 100n;

  const txHash = await wallet.writeContract({
    address: params.marketAddress,
    abi: marketAbi,
    functionName: "requestSettlement",
    args: [],
    gas: gasLimit,
    gasPrice,
  });

  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`requestSettlement reverted in tx ${txHash}`);
  }
  return txHash;
}

// Re-export helpful parts
export { buildDigest, getSignerAccount };
