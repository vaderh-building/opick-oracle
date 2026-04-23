import dotenv from "dotenv";
dotenv.config();

import {
  getMentionCount,
  getRecentEngagement,
  getEngagementWeightedScore,
  getTodayCost,
  getAllTimeCost,
  MentionCountResult,
} from "../src/xApiClient";

function fmt(n: number): string {
  return Math.round(n).toLocaleString();
}

async function main(): Promise<void> {
  console.log("\n========================================");
  console.log("OPick Oracle Validation");
  console.log("========================================");
  console.log("Testing X API connectivity and data quality.\n");

  const costBefore = getAllTimeCost();
  let muskMentions: MentionCountResult;
  let altmanMentions: MentionCountResult;

  // Step 1: Musk mentions
  console.log("[1/4] Fetching Musk 7-day mention count...");
  try {
    muskMentions = await getMentionCount("Elon Musk", 7);
    console.log(`  Total: ${fmt(muskMentions.total)} mentions`);
    console.log("  Daily breakdown:");
    for (const d of muskMentions.daily) {
      const dateStr = d.start.split("T")[0];
      console.log(`    ${dateStr}: ${fmt(d.count)}`);
    }
    console.log("  Cost: $0.001\n");
  } catch (err) {
    console.error("  FAILED:", (err as Error).message);
    process.exit(1);
  }

  // Step 2: Altman mentions
  console.log("[2/4] Fetching Altman 7-day mention count...");
  try {
    altmanMentions = await getMentionCount("Sam Altman", 7);
    console.log(`  Total: ${fmt(altmanMentions.total)} mentions`);
    console.log("  Daily breakdown:");
    for (const d of altmanMentions.daily) {
      const dateStr = d.start.split("T")[0];
      console.log(`    ${dateStr}: ${fmt(d.count)}`);
    }
    console.log("  Cost: $0.001\n");
  } catch (err) {
    console.error("  FAILED:", (err as Error).message);
    process.exit(1);
  }

  // Step 3: Engagement samples
  console.log("[3/4] Fetching engagement samples...");
  let muskEng, altmanEng;
  try {
    muskEng = await getRecentEngagement("Elon Musk", 100);
    altmanEng = await getRecentEngagement("Sam Altman", 100);
    console.log(`  Musk sample: ${muskEng.sampleSize} tweets, ${muskEng.uniqueAuthors} unique authors, ${fmt(muskEng.totalImpressions)} total impressions`);
    console.log(`  Altman sample: ${altmanEng.sampleSize} tweets, ${altmanEng.uniqueAuthors} unique authors, ${fmt(altmanEng.totalImpressions)} total impressions`);
    console.log();
  } catch (err) {
    console.error("  FAILED:", (err as Error).message);
    process.exit(1);
  }

  // Step 4: Engagement-weighted scores
  console.log("[4/4] Computing engagement-weighted scores...");
  let muskScore, altmanScore;
  try {
    muskScore = await getEngagementWeightedScore("Elon Musk", 7);
    altmanScore = await getEngagementWeightedScore("Sam Altman", 7);
    const ratio = altmanScore.score > 0 ? muskScore.score / altmanScore.score : Infinity;
    console.log(`  Musk score: ${fmt(muskScore.score)}`);
    console.log(`  Altman score: ${fmt(altmanScore.score)}`);
    console.log(`  Ratio (Musk/Altman): ${ratio.toFixed(1)}x`);
    console.log(`  Leader: ${muskScore.score >= altmanScore.score ? "Musk" : "Altman"}`);
    console.log();
  } catch (err) {
    console.error("  FAILED:", (err as Error).message);
    process.exit(1);
  }

  const totalCost = getAllTimeCost() - costBefore;
  console.log(`Total validation cost: $${totalCost.toFixed(3)}`);
  console.log(`Today's running cost: $${getTodayCost().toFixed(3)}\n`);

  // Sanity checks
  console.log("Sanity checks:");
  let allPass = true;

  function check(name: string, pass: boolean, reason: string) {
    if (pass) {
      console.log(`  [PASS] ${name}`);
    } else {
      console.log(`  [FAIL] ${name}: ${reason}`);
      allPass = false;
    }
  }

  check(
    "Musk mentions > 100k (expected for Musk weekly)",
    muskMentions!.total > 100000,
    `got ${fmt(muskMentions!.total)}`
  );
  check(
    "Altman mentions > 1k (expected for Altman)",
    altmanMentions!.total > 1000,
    `got ${fmt(altmanMentions!.total)}`
  );
  const ratio = altmanScore!.score > 0 ? muskScore!.score / altmanScore!.score : 0;
  check(
    "Ratio is in reasonable range (1x to 100x)",
    ratio >= 1 && ratio <= 100,
    `got ${ratio.toFixed(1)}x`
  );
  check(
    "Both unique author counts > 10 (bot resistance baseline)",
    muskEng!.uniqueAuthors > 10 && altmanEng!.uniqueAuthors > 10,
    `Musk: ${muskEng!.uniqueAuthors}, Altman: ${altmanEng!.uniqueAuthors}`
  );

  console.log();
  if (allPass) {
    console.log("Validation PASSED.");
    process.exit(0);
  } else {
    console.log("Validation FAILED.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Validation crashed:", err.message);
  process.exit(1);
});
