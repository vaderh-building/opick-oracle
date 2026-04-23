import axios, { AxiosError } from "axios";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { X_BEARER_TOKEN } from "./config";

const BASE_URL = "https://api.x.com/2";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_RETRIES = 3;
const COST_FILE = path.join(process.cwd(), "data", "costs.json");

// Types
export interface DailyCount {
  start: string;
  end: string;
  count: number;
}

export interface MentionCountResult {
  total: number;
  daily: DailyCount[];
}

export interface EngagementResult {
  sampleSize: number;
  totalLikes: number;
  totalReposts: number;
  totalReplies: number;
  totalImpressions: number;
  uniqueAuthors: number;
}

export interface ScoreComponents {
  base: number;
  engagementBoost: number;
  diversityFactor: number;
  sampleSize: number;
  uniqueAuthors: number;
}

export interface ScoreResult {
  keyword: string;
  score: number;
  components: ScoreComponents;
  window: { days: number; start: string; end: string };
}

// Errors
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class CreditsDepletedError extends Error {
  constructor() {
    super("X API credits depleted, top up at console.x.com");
    this.name = "CreditsDepletedError";
  }
}

// In-memory cache
const cache = new Map<string, { data: unknown; expiresAt: number }>();

function cacheKey(endpoint: string, params: Record<string, string>): string {
  const hash = crypto.createHash("md5").update(JSON.stringify({ endpoint, params })).digest("hex");
  return `${endpoint}:${hash}`;
}

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Cost tracking
interface CostData {
  today: string; // date string YYYY-MM-DD
  todayCost: number;
  allTimeCost: number;
  countCalls: number;
  searchCalls: number;
}

function loadCosts(): CostData {
  try {
    if (fs.existsSync(COST_FILE)) {
      const raw = JSON.parse(fs.readFileSync(COST_FILE, "utf-8"));
      const today = new Date().toISOString().split("T")[0];
      if (raw.today !== today) {
        raw.todayCost = 0;
        raw.today = today;
      }
      return raw;
    }
  } catch {}
  return { today: new Date().toISOString().split("T")[0], todayCost: 0, allTimeCost: 0, countCalls: 0, searchCalls: 0 };
}

function saveCosts(costs: CostData): void {
  try {
    const dir = path.dirname(COST_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(COST_FILE, JSON.stringify(costs, null, 2));
  } catch (e) {
    console.warn("[COST] Failed to save costs:", (e as Error).message);
  }
}

let costs = loadCosts();

function recordCost(type: "count" | "search", amount: number): void {
  const today = new Date().toISOString().split("T")[0];
  if (costs.today !== today) {
    costs.todayCost = 0;
    costs.today = today;
  }
  costs.todayCost += amount;
  costs.allTimeCost += amount;
  if (type === "count") costs.countCalls++;
  else costs.searchCalls++;
  saveCosts(costs);
}

export function getTodayCost(): number { return costs.todayCost; }
export function getAllTimeCost(): number { return costs.allTimeCost; }
export function getCostBreakdown() { return { counts: costs.countCalls, searches: costs.searchCalls }; }

// HTTP helper with retry and error handling
async function xGet<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  if (!X_BEARER_TOKEN) {
    throw new AuthError("X API auth failed, check X_BEARER_TOKEN");
  }

  const key = cacheKey(endpoint, params);
  const cached = getCached<T>(key);
  if (cached) return cached;

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const url = `${BASE_URL}${endpoint}`;
      console.log(`[X API] GET ${endpoint} (attempt ${attempt + 1})`);
      const res = await axios.get<T>(url, {
        headers: { Authorization: `Bearer ${X_BEARER_TOKEN}` },
        params,
        timeout: 15000,
      });
      setCache(key, res.data);
      return res.data;
    } catch (err) {
      const axErr = err as AxiosError<{ detail?: string; title?: string }>;
      const status = axErr.response?.status;
      const detail = axErr.response?.data?.detail || axErr.response?.data?.title || "";

      if (status === 401 || status === 403) {
        throw new AuthError("X API auth failed, check X_BEARER_TOKEN");
      }
      if (status === 429 || detail.toLowerCase().includes("creditsdepleted") || detail.toLowerCase().includes("credits")) {
        if (detail.toLowerCase().includes("credits") || detail.toLowerCase().includes("depleted")) {
          throw new CreditsDepletedError();
        }
        // Rate limit: exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[X API] 429 rate limit, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        lastErr = axErr;
        continue;
      }
      throw axErr;
    }
  }
  throw lastErr || new Error("Max retries exceeded");
}

// Public API functions

export async function getMentionCount(keyword: string, days: number): Promise<MentionCountResult> {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  // X API counts/recent only goes back 7 days
  const startTime = start.toISOString();
  const endTime = now.toISOString();

  const data = await xGet<{
    data: Array<{ start: string; end: string; tweet_count: number }>;
    meta: { total_tweet_count: number };
  }>("/tweets/counts/recent", {
    query: keyword,
    granularity: "day",
    start_time: startTime,
    end_time: endTime,
  });

  const estCost = 0.001;
  recordCost("count", estCost);
  console.log(`[X API] Count for "${keyword}": ${data.meta.total_tweet_count} mentions ($${estCost.toFixed(4)})`);

  return {
    total: data.meta.total_tweet_count,
    daily: (data.data || []).map(d => ({ start: d.start, end: d.end, count: d.tweet_count })),
  };
}

export async function getRecentEngagement(keyword: string, maxResults: number = 100): Promise<EngagementResult> {
  const cap = Math.min(maxResults, 100);

  const data = await xGet<{
    data?: Array<{
      public_metrics: {
        like_count: number;
        retweet_count: number;
        reply_count: number;
        impression_count: number;
      };
      author_id: string;
    }>;
    meta?: { result_count: number };
  }>("/tweets/search/recent", {
    query: keyword,
    max_results: String(cap),
    "tweet.fields": "public_metrics,created_at,author_id",
  });

  const tweets = data.data || [];
  const resultCount = tweets.length;
  const estCost = resultCount * 0.001;
  recordCost("search", estCost);
  console.log(`[X API] Engagement for "${keyword}": ${resultCount} tweets sampled ($${estCost.toFixed(4)})`);

  const authors = new Set<string>();
  let totalLikes = 0, totalReposts = 0, totalReplies = 0, totalImpressions = 0;

  for (const t of tweets) {
    const m = t.public_metrics;
    totalLikes += m.like_count || 0;
    totalReposts += m.retweet_count || 0;
    totalReplies += m.reply_count || 0;
    totalImpressions += m.impression_count || 0;
    if (t.author_id) authors.add(t.author_id);
  }

  return {
    sampleSize: resultCount,
    totalLikes,
    totalReposts,
    totalReplies,
    totalImpressions,
    uniqueAuthors: authors.size,
  };
}

export async function getEngagementWeightedScore(keyword: string, days: number = 7): Promise<ScoreResult> {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const [mentions, engagement] = await Promise.all([
    getMentionCount(keyword, days),
    getRecentEngagement(keyword, 100),
  ]);

  const base = mentions.total;
  const engagementBoost =
    (engagement.totalLikes * 0.1) +
    (engagement.totalReposts * 0.5) +
    (engagement.totalReplies * 0.3);
  const diversityFactor = Math.sqrt(
    engagement.uniqueAuthors / Math.max(engagement.sampleSize, 1)
  );
  const score = (base + engagementBoost) * diversityFactor;

  return {
    keyword,
    score,
    components: {
      base,
      engagementBoost,
      diversityFactor,
      sampleSize: engagement.sampleSize,
      uniqueAuthors: engagement.uniqueAuthors,
    },
    window: {
      days,
      start: start.toISOString(),
      end: now.toISOString(),
    },
  };
}
