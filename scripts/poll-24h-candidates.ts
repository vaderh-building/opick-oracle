/**
 * One-shot 24h Attention Rating poll across the 50-candidate pool.
 *
 * Reuses the oracle's X API wrappers (getMentionCount + getRecentEngagement).
 * Does NOT touch the cron, DB, or tracked-subjects table — read-only poll
 * that writes a timestamped JSON file to output/.
 *
 * Run: npx tsx scripts/poll-24h-candidates.ts
 */

import fs from "fs";
import path from "path";
import { getMentionCount, getRecentEngagement } from "../src/xApiClient";
import { CANDIDATES_50, type Candidate } from "../data/candidates-50";

// Attention Rating parameters — same shape as the frontend lib so console
// output lines up with what the app will render.
const BASELINE = 50;
const SPAN = 40;
const CURVE = 1.5;
const RATING_MAX = 94.99;

const INTER_SUBJECT_DELAY_MS = 1200;
const WINDOW_DAYS = 1;
const LOW_SIGNAL_POSTS = 10;

interface SubjectResult {
  name: string;
  query: string;
  handle: string | null;
  category: string;
  posts: number | null;
  totalLikes: number | null;
  totalReposts: number | null;
  totalReplies: number | null;
  uniqueAuthors: number | null;
  sampleSize: number | null;
  engagementPerPost: number | null;
  weightedScore: number | null;
  attentionRating: number | null;
  tier: string | null;
  windowStart: string;
  windowEnd: string;
  error: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getAttentionTier(rating: number): string {
  const floor = Math.floor(rating);
  if (floor >= 95) return "Phenomenon";
  if (floor >= 85) return "Dominating";
  if (floor >= 70) return "Trending";
  if (floor >= 55) return "Active";
  if (floor >= 40) return "Present";
  return "Quiet";
}

function computeWeightedScore(
  mentions: number,
  likes: number,
  reposts: number,
  replies: number,
  uniqueAuthors: number,
  sampleSize: number
): number {
  const base = mentions;
  const engagementBoost = likes * 0.1 + reposts * 0.5 + replies * 0.3;
  const sample = Math.max(sampleSize, 1);
  const diversityFactor = Math.sqrt(uniqueAuthors / sample);
  return (base + engagementBoost) * diversityFactor;
}

function normalizeRatings(results: SubjectResult[]): void {
  const valid = results.filter(
    (r): r is SubjectResult & { weightedScore: number } =>
      r.weightedScore !== null && r.weightedScore > 0
  );
  if (valid.length === 0) return;
  const logs = valid.map((r) => Math.log10(Math.max(r.weightedScore, 1)));
  const minLog = Math.min(...logs);
  const maxLog = Math.max(...logs);

  for (const r of results) {
    if (r.weightedScore === null) continue;
    if (maxLog === minLog) {
      r.attentionRating = round2(Math.min(BASELINE + SPAN, RATING_MAX));
    } else {
      const logVal = Math.log10(Math.max(r.weightedScore, 1));
      const norm = (logVal - minLog) / (maxLog - minLog);
      const shaped = Math.pow(norm, CURVE);
      r.attentionRating = round2(
        Math.max(0, Math.min(BASELINE + shaped * SPAN, RATING_MAX))
      );
    }
    r.tier = getAttentionTier(r.attentionRating);
  }
}

async function pollOne(candidate: Candidate): Promise<SubjectResult> {
  const windowStart = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const windowEnd = new Date().toISOString();

  const base: SubjectResult = {
    name: candidate.name,
    query: candidate.query,
    handle: candidate.handle,
    category: candidate.category,
    posts: null,
    totalLikes: null,
    totalReposts: null,
    totalReplies: null,
    uniqueAuthors: null,
    sampleSize: null,
    engagementPerPost: null,
    weightedScore: null,
    attentionRating: null,
    tier: null,
    windowStart,
    windowEnd,
    error: null,
  };

  try {
    const mentions = await getMentionCount(candidate.query, WINDOW_DAYS);
    const engagement = await getRecentEngagement(candidate.query, 100);

    const posts = mentions.total;
    const weightedScore = computeWeightedScore(
      posts,
      engagement.totalLikes,
      engagement.totalReposts,
      engagement.totalReplies,
      engagement.uniqueAuthors,
      engagement.sampleSize
    );
    const sample = Math.max(engagement.sampleSize, 1);
    const engagementPerPost =
      (engagement.totalLikes + engagement.totalReposts * 5 + engagement.totalReplies * 3) /
      sample;

    return {
      ...base,
      posts,
      totalLikes: engagement.totalLikes,
      totalReposts: engagement.totalReposts,
      totalReplies: engagement.totalReplies,
      uniqueAuthors: engagement.uniqueAuthors,
      sampleSize: engagement.sampleSize,
      engagementPerPost: Math.round(engagementPerPost * 100) / 100,
      weightedScore,
    };
  } catch (err) {
    const msg = (err as Error).message || String(err);
    console.warn(`[POLL] ${candidate.name} failed: ${msg}`);
    return { ...base, error: msg };
  }
}

function padRight(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n - 1) + "…";
  return s + " ".repeat(n - s.length);
}

function padLeft(s: string, n: number): string {
  if (s.length >= n) return s;
  return " ".repeat(n - s.length) + s;
}

function printTopTable(results: SubjectResult[]): void {
  const ranked = results
    .filter((r) => r.attentionRating !== null)
    .sort((a, b) => (b.attentionRating ?? 0) - (a.attentionRating ?? 0));

  console.log("\nTop 20 by Attention Rating (24h window)");
  console.log(
    padRight("rank", 5) +
      padRight("name", 26) +
      padLeft("rating", 8) +
      "  " +
      padRight("tier", 12) +
      padLeft("posts", 10) +
      padLeft("eng/post", 10)
  );
  console.log("-".repeat(71));
  for (let i = 0; i < Math.min(20, ranked.length); i++) {
    const r = ranked[i];
    console.log(
      padRight(String(i + 1).padStart(2, "0"), 5) +
        padRight(r.name, 26) +
        padLeft((r.attentionRating ?? 0).toFixed(2), 8) +
        "  " +
        padRight(r.tier ?? "-", 12) +
        padLeft((r.posts ?? 0).toLocaleString("en-US"), 10) +
        padLeft((r.engagementPerPost ?? 0).toLocaleString("en-US"), 10)
    );
  }
}

function printLowSignal(results: SubjectResult[]): void {
  const low = results.filter(
    (r) => r.error !== null || (r.posts !== null && r.posts < LOW_SIGNAL_POSTS)
  );
  if (low.length === 0) return;
  console.log("\nLow signal / failed subjects");
  console.log("-".repeat(71));
  for (const r of low) {
    if (r.error) {
      console.log(`  ${padRight(r.name, 26)} error: ${r.error}`);
    } else {
      console.log(
        `  ${padRight(r.name, 26)} posts=${r.posts} sampleSize=${r.sampleSize}`
      );
    }
  }
}

async function main(): Promise<void> {
  console.log(
    `[POLL] Starting 24h one-shot poll across ${CANDIDATES_50.length} candidates...`
  );
  const start = Date.now();
  const results: SubjectResult[] = [];

  for (let i = 0; i < CANDIDATES_50.length; i++) {
    const c = CANDIDATES_50[i];
    console.log(`[${i + 1}/${CANDIDATES_50.length}] ${c.name}`);
    const r = await pollOne(c);
    results.push(r);
    if (i < CANDIDATES_50.length - 1) {
      await new Promise((res) => setTimeout(res, INTER_SUBJECT_DELAY_MS));
    }
  }

  normalizeRatings(results);
  results.sort((a, b) => {
    const ar = a.attentionRating;
    const br = b.attentionRating;
    if (ar === null && br === null) return 0;
    if (ar === null) return 1;
    if (br === null) return -1;
    return br - ar;
  });

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[POLL] Completed in ${elapsedSec}s.`);

  const outputDir = path.join(process.cwd(), "output");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(outputDir, `candidate-ranking-${stamp}.json`);
  const payload = {
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    candidateCount: CANDIDATES_50.length,
    ratingParams: { BASELINE, SPAN, CURVE, max: RATING_MAX },
    results,
  };
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  console.log(`[POLL] Wrote ${outputPath}`);

  printTopTable(results);
  printLowSignal(results);
}

main().catch((err) => {
  console.error("[POLL] Fatal:", (err as Error).message || err);
  process.exit(1);
});
