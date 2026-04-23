/**
 * Verify every row of settlement_log matches its HMAC under AUDIT_HMAC_KEY.
 * Exit 0 on full match, 1 if any row fails.
 */

import { getDb, SettlementLogRow } from "../src/db/schema";
import { AUDIT_HMAC_KEY } from "../src/config";
import { verifyAuditHmac } from "../src/services/settlement";

function main() {
  if (!AUDIT_HMAC_KEY) {
    console.error("AUDIT_HMAC_KEY not set in environment");
    process.exit(2);
  }
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM settlement_log ORDER BY id ASC")
    .all() as SettlementLogRow[];

  console.log(`Verifying ${rows.length} settlement_log rows...`);
  let bad = 0;
  for (const r of rows) {
    const ok = verifyAuditHmac(r);
    if (!ok) {
      console.error(`  [FAIL] id=${r.id} market=${r.market_id} attempted_at=${r.attempted_at}`);
      bad++;
    }
  }
  if (bad === 0) {
    console.log("All rows verified.");
    process.exit(0);
  }
  console.error(`${bad} row(s) failed HMAC verification.`);
  process.exit(1);
}

main();
