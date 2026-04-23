# OPick Oracle

Powers OPick attention markets by providing bot-resistant, engagement-weighted mention scores from X (Twitter). Fetches real-time mention counts and engagement metrics for configurable keywords, computes a composite attention score, and serves it via HTTP API plus a live dashboard with WebSocket updates.

## Setup

```
git clone https://github.com/vaderh-building/opick-oracle.git
cd opick-oracle
cp .env.example .env
# Paste your X_BEARER_TOKEN from console.x.com into .env
npm install
npm run validate    # test API connectivity and data quality
npm run dev         # start dev server on port 8081
```

## Architecture

```
X API (api.x.com)
    |
    v
xApiClient.ts  (counts/recent, search/recent)
    |           (caching, rate limit retry, cost tracking)
    v
oracleService.ts  (cron polling, history buffer)
    |
    v
server.ts  (Express HTTP + WebSocket)
    |
    +-- GET /api/health
    +-- GET /api/attention/:keyword
    +-- GET /api/attention/compare?a=&b=
    +-- GET /api/costs
    +-- WebSocket /ws  (live attention:update events)
    |
    v
public/index.html  (Chart.js dashboard)
```

## API Endpoints

| Route | Description |
|-------|-------------|
| GET /api/health | Status, uptime, costs, tracked keywords |
| GET /api/attention/:keyword | Latest score + 24h history |
| GET /api/attention/compare?a=X&b=Y | Side by side comparison with ratio |
| GET /api/costs | Today and all time cost breakdown |
| WebSocket /ws | Live updates on each poll cycle |

## Score Formula

```
base = totalMentions (7 day window)
engagementBoost = (likes * 0.1) + (reposts * 0.5) + (replies * 0.3)
diversityFactor = sqrt(uniqueAuthors / sampleSize)
score = (base + engagementBoost) * diversityFactor
```

The diversity factor penalizes keywords where mentions come from a small number of accounts (bot resistance).

## Cost Estimates

At 15 minute polling for 2 keywords:
- 4 API calls per cycle (2 count, 2 search)
- ~96 cycles per day
- Estimated daily cost: ~$0.20
- Estimated monthly cost: ~$6

X pay per use pricing applies. Cap is 2M reads per month before Enterprise tier is needed. Cost counters persist to ./data/costs.json across restarts.

## Observed Data (validation anchors)

- Elon Musk: ~120k daily mentions, ~845k weekly
- Sam Altman: ~9k daily mentions, ~59k weekly
- Typical ratio: 10x to 15x (Musk/Altman)

## Known Limitations

- Only handles 2 keywords currently (configurable in src/config.ts)
- No persistence beyond cost counter (history is in memory only)
- Single region deployment only
- X search/recent endpoint returns max 100 tweets per query
- Counts endpoint limited to 7 day lookback window
