/**
 * Deterministic metric computation test. Uses fixed inputs and checks
 * formula outputs without hitting the X API.
 */

import { MetricType } from "../src/db/schema";
import {
  applyFormula,
  FormulaInput,
  mentionCount,
  engagementWeighted,
  engagementDensity,
  velocity,
} from "../src/metrics/formulas";

interface Case {
  name: string;
  metric: MetricType;
  input: FormulaInput;
  expectedValue: bigint;
  expectedComponentsSubset?: Record<string, string | number>;
}

function buildInput(overrides: Partial<FormulaInput> = {}): FormulaInput {
  const base: FormulaInput = {
    mention: {
      totalMentions: 0,
      daily: [],
    },
    engagement: {
      sampleSize: 0,
      totalLikes: 0,
      totalReposts: 0,
      totalReplies: 0,
      uniqueAuthors: 0,
    },
    windowDays: 7,
  };
  return {
    ...base,
    ...overrides,
    mention: { ...base.mention, ...(overrides.mention || {}) },
    engagement: { ...base.engagement, ...(overrides.engagement || {}) },
  };
}

const cases: Case[] = [
  {
    name: "mention count simple",
    metric: MetricType.MENTION_COUNT,
    input: buildInput({ mention: { totalMentions: 12345, daily: [] } }),
    expectedValue: 12345n,
    expectedComponentsSubset: { totalMentions: 12345 },
  },
  {
    name: "engagement weighted with full sample",
    metric: MetricType.ENGAGEMENT_WEIGHTED,
    input: buildInput({
      mention: { totalMentions: 1000, daily: [] },
      engagement: {
        sampleSize: 100,
        totalLikes: 100,
        totalReposts: 20,
        totalReplies: 30,
        uniqueAuthors: 64,
      },
    }),
    // engagementBoost = round(100*0.1 + 20*0.5 + 30*0.3) = 10 + 10 + 9 = 29
    // diversityScaled = floor(sqrt(64 * 1e12 / 100)) = floor(sqrt(6.4e11)) = 800000
    // value = (1000 + 29) * 800000 / 1_000_000 = 1029 * 0.8 = 823.2 -> 823
    expectedValue: 823n,
    expectedComponentsSubset: {
      engagementBoost: "29",
      diversityFactor: "800000",
      sampleSize: 100,
      uniqueAuthors: 64,
    },
  },
  {
    name: "engagement density",
    metric: MetricType.ENGAGEMENT_DENSITY,
    input: buildInput({
      engagement: {
        sampleSize: 50,
        totalLikes: 250,
        totalReposts: 10,
        totalReplies: 20,
        uniqueAuthors: 30,
      },
    }),
    // raw = (250 + 10*5 + 20*3) * 1000 = (250+50+60)*1000 = 360000
    // value = floor(360000 / 50) = 7200
    expectedValue: 7200n,
  },
  {
    name: "engagement density with zero sample",
    metric: MetricType.ENGAGEMENT_DENSITY,
    input: buildInput({
      engagement: {
        sampleSize: 0,
        totalLikes: 10,
        totalReposts: 0,
        totalReplies: 0,
        uniqueAuthors: 0,
      },
    }),
    // max(sampleSize, 1) = 1; raw = 10 * 1000 = 10000
    expectedValue: 10000n,
  },
  {
    name: "velocity balanced",
    metric: MetricType.VELOCITY,
    input: buildInput({
      windowDays: 6,
      mention: {
        totalMentions: 600,
        daily: [
          { start: "2026-04-16", count: 100 },
          { start: "2026-04-17", count: 100 },
          { start: "2026-04-18", count: 100 },
          { start: "2026-04-19", count: 100 },
          { start: "2026-04-20", count: 100 },
          { start: "2026-04-21", count: 100 },
        ],
      },
    }),
    // firstHalf = 300, secondHalf = 300, ratio = 300*1000/300 = 1000
    expectedValue: 1000n,
  },
  {
    name: "velocity accelerating",
    metric: MetricType.VELOCITY,
    input: buildInput({
      windowDays: 6,
      mention: {
        totalMentions: 0,
        daily: [
          { start: "2026-04-16", count: 10 },
          { start: "2026-04-17", count: 20 },
          { start: "2026-04-18", count: 30 },
          { start: "2026-04-19", count: 40 },
          { start: "2026-04-20", count: 80 },
          { start: "2026-04-21", count: 160 },
        ],
      },
    }),
    // firstHalf = 60, secondHalf = 280, ratio = 280000/60 = 4666
    expectedValue: 4666n,
  },
  {
    name: "velocity cold start (first half zero)",
    metric: MetricType.VELOCITY,
    input: buildInput({
      windowDays: 4,
      mention: {
        totalMentions: 0,
        daily: [
          { start: "2026-04-18", count: 0 },
          { start: "2026-04-19", count: 0 },
          { start: "2026-04-20", count: 50 },
          { start: "2026-04-21", count: 50 },
        ],
      },
    }),
    // firstHalf=0 -> denom=1; value = 100*1000/1 = 100000
    expectedValue: 100000n,
  },
];

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}

function run(): void {
  console.log("Running metric formula tests...\n");
  let passed = 0;
  let failed = 0;
  for (const c of cases) {
    try {
      // Direct dispatch: applyFormula must route to the same function.
      const viaApply = applyFormula(c.metric, c.input);
      const direct =
        c.metric === MetricType.MENTION_COUNT ? mentionCount(c.input)
        : c.metric === MetricType.ENGAGEMENT_WEIGHTED ? engagementWeighted(c.input)
        : c.metric === MetricType.ENGAGEMENT_DENSITY ? engagementDensity(c.input)
        : velocity(c.input);

      assert(
        viaApply.value === direct.value,
        `dispatch mismatch in ${c.name}: apply=${viaApply.value} direct=${direct.value}`
      );

      assert(
        viaApply.value === c.expectedValue,
        `${c.name}: expected ${c.expectedValue}, got ${viaApply.value}`
      );

      if (c.expectedComponentsSubset) {
        for (const [k, v] of Object.entries(c.expectedComponentsSubset)) {
          const actual = viaApply.components[k];
          assert(
            String(actual) === String(v),
            `${c.name}: component ${k} expected ${v}, got ${actual}`
          );
        }
      }

      console.log(`  [PASS] ${c.name}`);
      passed++;
    } catch (err) {
      console.log(`  [FAIL] ${c.name}: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

run();
