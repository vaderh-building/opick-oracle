import { MetricType } from "../db/schema";

export interface MentionWindow {
  totalMentions: number;
  daily: Array<{ start: string; count: number }>;
}

export interface EngagementSample {
  sampleSize: number;
  totalLikes: number;
  totalReposts: number;
  totalReplies: number;
  uniqueAuthors: number;
}

export interface FormulaInput {
  mention: MentionWindow;
  engagement: EngagementSample;
  windowDays: number;
}

export interface FormulaOutput {
  value: bigint;
  components: Record<string, string | number>;
}

function bigintSqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("sqrt of negative");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

export function mentionCount(input: FormulaInput): FormulaOutput {
  const value = BigInt(input.mention.totalMentions);
  return {
    value,
    components: { totalMentions: input.mention.totalMentions },
  };
}

export function engagementWeighted(input: FormulaInput): FormulaOutput {
  const { engagement, mention } = input;
  const base = BigInt(mention.totalMentions);
  // engagementBoost = round(likes * 0.1 + reposts * 0.5 + replies * 0.3)
  // Compute with integer math at 10x, then divide with rounding.
  const boostTimes10 =
    BigInt(engagement.totalLikes) * 1n +
    BigInt(engagement.totalReposts) * 5n +
    BigInt(engagement.totalReplies) * 3n;
  const engagementBoost = (boostTimes10 + 5n) / 10n;

  const sample = Math.max(engagement.sampleSize, 1);
  // diversityFactor = sqrt(uniqueAuthors / sampleSize)
  // Represent at 1e6 scale: floor(sqrt(uniqueAuthors * 1e12 / sampleSize))
  const scaled = (BigInt(engagement.uniqueAuthors) * 1_000_000_000_000n) / BigInt(sample);
  const diversityScaled = bigintSqrt(scaled); // scaled by 1e6

  // value = (base + engagementBoost) * diversityScaled / 1_000_000
  // Spec: diversityFactor_scaled = floor(sqrt(uniqueAuthors * 1e6 / sampleSize))
  //       value = (base + engagementBoost) * diversityFactor_scaled / 1000
  // To keep integer semantics matching the written spec, use the 1e6 scale and divide by 1e6.
  const value = ((base + engagementBoost) * diversityScaled) / 1_000_000n;

  return {
    value,
    components: {
      base: base.toString(),
      engagementBoost: engagementBoost.toString(),
      diversityFactor: diversityScaled.toString(),
      sampleSize: engagement.sampleSize,
      uniqueAuthors: engagement.uniqueAuthors,
    },
  };
}

export function engagementDensity(input: FormulaInput): FormulaOutput {
  const { engagement } = input;
  const sample = Math.max(engagement.sampleSize, 1);
  // raw = (likes + reposts*5 + replies*3) * 1000
  const raw =
    (BigInt(engagement.totalLikes) +
      BigInt(engagement.totalReposts) * 5n +
      BigInt(engagement.totalReplies) * 3n) *
    1000n;
  const value = raw / BigInt(sample);

  return {
    value,
    components: {
      totalLikes: engagement.totalLikes,
      totalReposts: engagement.totalReposts,
      totalReplies: engagement.totalReplies,
      sampleSize: engagement.sampleSize,
      densityScaled: value.toString(),
    },
  };
}

export function velocity(input: FormulaInput): FormulaOutput {
  const { mention, windowDays } = input;
  const days = windowDays;
  const half = Math.floor(days / 2);

  // Daily counts are ordered oldest to newest. Sum first half (older) and second half (newer).
  // If day count differs from windowDays (X API may return fewer), bucket by position.
  const daily = mention.daily.slice();
  // Sort ascending by start time for determinism
  daily.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  let firstHalf = 0;
  let secondHalf = 0;
  const totalBuckets = daily.length;
  const splitIdx = Math.floor(totalBuckets / 2);
  for (let i = 0; i < totalBuckets; i++) {
    if (i < splitIdx) firstHalf += daily[i].count;
    else secondHalf += daily[i].count;
  }

  const denom = BigInt(Math.max(firstHalf, 1));
  const value = (BigInt(secondHalf) * 1000n) / denom;

  return {
    value,
    components: {
      firstHalf,
      secondHalf,
      ratioScaled: value.toString(),
      windowDays: days,
      half,
    },
  };
}

export function applyFormula(metric: MetricType, input: FormulaInput): FormulaOutput {
  switch (metric) {
    case MetricType.MENTION_COUNT:
      return mentionCount(input);
    case MetricType.ENGAGEMENT_WEIGHTED:
      return engagementWeighted(input);
    case MetricType.ENGAGEMENT_DENSITY:
      return engagementDensity(input);
    case MetricType.VELOCITY:
      return velocity(input);
    default:
      throw new Error(`Unknown metric type: ${metric}`);
  }
}
