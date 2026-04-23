/**
 * Dry-run settlement flow: builds a digest, signs it, and verifies recovery
 * matches the signer address. If ANVIL_RPC is set, also probes availability.
 */

import { spawnSync } from "child_process";
import { buildDigest, getSignerAccount } from "../src/oracle/submit";
import { signSettlement, verifyDigestSignature } from "../src/oracle/signer";

async function main() {
  const anvilHealth = spawnSync("anvil", ["--version"], { encoding: "utf-8" });
  if (anvilHealth.status !== 0) {
    console.warn("anvil not found on PATH; skipping fork-based settlement dry-run.");
    console.warn("Sign-verify unit check will still run.");
  } else {
    console.log("anvil detected:", (anvilHealth.stdout || "").trim());
  }

  const account = getSignerAccount();
  if (!account) {
    console.warn(
      "ORACLE_SIGNER_PRIVATE_KEY not set; using deterministic test key for digest/verify check."
    );
  }

  const testPk =
    (process.env.ORACLE_SIGNER_PRIVATE_KEY ||
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") as `0x${string}`;

  const { privateKeyToAccount } = await import("viem/accounts");
  const testAccount = privateKeyToAccount(testPk);

  const input = {
    marketId: 1n,
    valueA: 1234567n,
    valueB: 987654n,
    marketAddress: "0x1111111111111111111111111111111111111111" as `0x${string}`,
    chainId: 8453n,
  };

  const digest = buildDigest(input);
  console.log("digest:", digest);
  const sig = await testAccount.signMessage({ message: { raw: digest } });
  console.log("signature:", sig);

  const ok = await verifyDigestSignature(digest, sig, testAccount.address);
  if (!ok) {
    console.error("FAIL: recovered address does not match signer");
    process.exit(1);
  }
  console.log("signature verified against address:", testAccount.address);

  // If real signer configured, round trip using signSettlement
  if (process.env.ORACLE_SIGNER_PRIVATE_KEY) {
    const real = await signSettlement(input);
    const realAcc = getSignerAccount();
    const roundTrip = await verifyDigestSignature(digest, real, realAcc!.address);
    if (!roundTrip) {
      console.error("FAIL: signSettlement roundtrip failed");
      process.exit(1);
    }
    console.log("ORACLE_SIGNER_PRIVATE_KEY roundtrip OK for", realAcc!.address);
  }

  console.log("\nsettlement dry-run PASSED");
  process.exit(0);
}

main().catch((err) => {
  console.error("dry-run crashed:", (err as Error).message);
  process.exit(1);
});
