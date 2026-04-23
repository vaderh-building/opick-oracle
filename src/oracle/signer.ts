import { privateKeyToAccount } from "viem/accounts";
import { encodeAbiParameters, keccak256, hashMessage, recoverAddress } from "viem";
import { ORACLE_SIGNER_PRIVATE_KEY } from "../config";

export interface SigningInput {
  marketId: bigint;
  valueA: bigint;
  valueB: bigint;
  marketAddress: `0x${string}`;
  chainId: bigint;
}

export function getSignerAccount() {
  if (!ORACLE_SIGNER_PRIVATE_KEY) return null;
  const pk = ORACLE_SIGNER_PRIVATE_KEY.startsWith("0x")
    ? (ORACLE_SIGNER_PRIVATE_KEY as `0x${string}`)
    : (`0x${ORACLE_SIGNER_PRIVATE_KEY}` as `0x${string}`);
  return privateKeyToAccount(pk);
}

export function getSignerAddress(): `0x${string}` | null {
  const a = getSignerAccount();
  return a ? a.address : null;
}

export function buildDigest(input: SigningInput): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
      ],
      [input.marketId, input.valueA, input.valueB, input.marketAddress, input.chainId]
    )
  );
}

export async function signSettlement(input: SigningInput): Promise<`0x${string}`> {
  const account = getSignerAccount();
  if (!account) throw new Error("ORACLE_SIGNER_PRIVATE_KEY missing");

  const digest = buildDigest(input);
  // EIP-191 prefixed (eth_sign compatible). viem signMessage with raw bytes
  // produces `\x19Ethereum Signed Message:\n32` || digest, matching
  // MessageHashUtils.toEthSignedMessageHash in the contract.
  const signature = await account.signMessage({
    message: { raw: digest },
  });
  return signature;
}

export async function verifyDigestSignature(
  digest: `0x${string}`,
  signature: `0x${string}`,
  expected: `0x${string}`
): Promise<boolean> {
  const ethHash = hashMessage({ raw: digest });
  const recovered = await recoverAddress({ hash: ethHash, signature });
  return recovered.toLowerCase() === expected.toLowerCase();
}
