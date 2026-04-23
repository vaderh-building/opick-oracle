// OPick Oracle Dashboard

const POLL_MINUTES = 15;
let lastUpdateTime = null;
let chart = null;

function fmt(n) {
  if (n == null || isNaN(n)) return "...";
  return Math.round(Number(n)).toLocaleString();
}

function fmtBig(v) {
  if (v == null) return "...";
  try { return BigInt(v).toString(); } catch { return String(v); }
}

function fmtTime(sec) {
  if (!sec) return "never";
  var d = new Date(sec * 1000);
  return d.toLocaleTimeString();
}

function fmtDate(sec) {
  if (!sec) return "...";
  var d = new Date(sec * 1000);
  return d.toLocaleString();
}

function initChart() {
  const ctx = document.getElementById("chart").getContext("2d");
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "Elon Musk", data: [], borderColor: "#1a6b3c", borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3 },
        { label: "Sam Altman", data: [], borderColor: "#8b2500", borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          titleFont: { family: "DM Sans" },
          bodyFont: { family: "JetBrains Mono" },
          callbacks: { label: function(ctx) { return ctx.dataset.label + ": " + fmt(ctx.parsed.y); } },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(26, 107, 60, 0.08)" },
          ticks: { font: { family: "DM Sans", size: 10 }, color: "#9c9b96" },
        },
        y: {
          grid: { color: "rgba(26, 107, 60, 0.08)" },
          ticks: { font: { family: "JetBrains Mono", size: 10 }, color: "#9c9b96", callback: function(v) { return fmt(v); } },
        },
      },
    },
  });
}

function updateHero(scores) {
  const musk = scores["Elon Musk"];
  const altman = scores["Sam Altman"];
  if (musk) {
    document.getElementById("musk-score").textContent = fmt(musk.score);
    document.getElementById("musk-score").className = "hero-score green";
    document.getElementById("musk-meta").innerHTML = "7-day mentions: <span>" + fmt(musk.components.base) + "</span>";
  }
  if (altman) {
    const isLeader = altman.score > (musk ? musk.score : 0);
    document.getElementById("altman-score").textContent = fmt(altman.score);
    document.getElementById("altman-score").className = "hero-score " + (isLeader ? "green" : "red");
    document.getElementById("altman-meta").innerHTML = "7-day mentions: <span>" + fmt(altman.components.base) + "</span>";
  }
  if (musk && altman) {
    const total = musk.score + altman.score;
    const muskPct = total > 0 ? (musk.score / total) * 100 : 50;
    document.getElementById("ratio-green").style.width = muskPct + "%";
    document.getElementById("ratio-red").style.width = (100 - muskPct) + "%";
    const ratio = altman.score > 0 ? (musk.score / altman.score).toFixed(1) : "N/A";
    document.getElementById("ratio-label").textContent = "Musk leads by " + ratio + "x";
  }
}

function updateChart(histA, histB) {
  if (!chart) return;
  const labels = (histA || []).map(function(p) {
    const d = new Date(p.timestamp);
    return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
  });
  chart.data.labels = labels;
  chart.data.datasets[0].data = (histA || []).map(function(p) { return p.score; });
  chart.data.datasets[1].data = (histB || []).map(function(p) { return p.score; });
  chart.update("none");
}

function updateStatus(costToday) {
  if (costToday != null) document.getElementById("cost").textContent = "$" + Number(costToday).toFixed(3);
  const now = new Date();
  document.getElementById("last-update").textContent =
    now.getHours().toString().padStart(2, "0") + ":" +
    now.getMinutes().toString().padStart(2, "0") + ":" +
    now.getSeconds().toString().padStart(2, "0");
  lastUpdateTime = now;
}

function tickCountdown() {
  if (!lastUpdateTime) return;
  const elapsed = (Date.now() - lastUpdateTime.getTime()) / 1000;
  const remaining = Math.max(0, POLL_MINUTES * 60 - elapsed);
  const m = Math.floor(remaining / 60);
  const s = Math.floor(remaining % 60);
  document.getElementById("countdown").textContent = m + "m " + s + "s";
}

function renderMarkets(markets) {
  var body = document.getElementById("markets-body");
  if (!markets || markets.length === 0) {
    body.innerHTML = '<tr><td colspan="8" class="empty">No markets tracked yet.</td></tr>';
    renderUpcoming([]);
    return;
  }
  body.innerHTML = markets.map(function(m) {
    var kw = m.keyword_a + (m.keyword_b ? " vs " + m.keyword_b : "");
    return (
      '<tr>' +
        '<td class="mono">#' + m.id + '</td>' +
        '<td>' + m.market_type_name + '</td>' +
        '<td>' + m.metric_type_name + '</td>' +
        '<td>' + escapeHtml(kw) + '</td>' +
        '<td><span class="badge badge-state-' + m.state + '">' + m.state_name + '</span></td>' +
        '<td class="mono">' + fmtDate(m.close_time) + '</td>' +
        '<td class="num mono">' + fmtBig(m.settlement_value_a) + '</td>' +
        '<td class="num mono">' + fmtBig(m.settlement_value_b) + '</td>' +
      '</tr>'
    );
  }).join("");
  renderUpcoming(markets.filter(function(m) {
    var now = Math.floor(Date.now() / 1000);
    return m.state !== 2 && m.state !== 3 && m.close_time <= now + 86400;
  }));
}

function renderUpcoming(markets) {
  var body = document.getElementById("upcoming-body");
  if (!markets.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty">No settlements due in the next 24h.</td></tr>';
    return;
  }
  var now = Math.floor(Date.now() / 1000);
  body.innerHTML = markets.map(function(m) {
    var kw = m.keyword_a + (m.keyword_b ? " vs " + m.keyword_b : "");
    var delta = m.close_time - now;
    var countdown;
    if (delta <= 0) countdown = "overdue";
    else {
      var h = Math.floor(delta / 3600);
      var mn = Math.floor((delta % 3600) / 60);
      countdown = h + "h " + mn + "m";
    }
    return (
      '<tr>' +
        '<td class="mono">#' + m.id + '</td>' +
        '<td>' + escapeHtml(kw) + '</td>' +
        '<td><span class="badge badge-state-' + m.state + '">' + m.state_name + '</span></td>' +
        '<td class="mono">' + fmtDate(m.close_time) + '</td>' +
        '<td class="mono">' + countdown + '</td>' +
      '</tr>'
    );
  }).join("");
}

function renderSettlements(rows) {
  var body = document.getElementById("settlements-body");
  if (!rows || rows.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="empty">No settlements yet.</td></tr>';
    return;
  }
  body.innerHTML = rows.slice(0, 10).map(function(r) {
    var statusClass = "badge-status-" + r.status;
    var tx = r.tx_hash
      ? '<a class="mono" target="_blank" rel="noreferrer" href="https://basescan.org/tx/' + r.tx_hash + '">' + r.tx_hash.slice(0, 10) + '...</a>'
      : '<span class="mono muted">pending</span>';
    return (
      '<tr>' +
        '<td class="mono">#' + r.market_id + '</td>' +
        '<td><span class="badge ' + statusClass + '">' + r.status + '</span></td>' +
        '<td class="num mono">' + fmtBig(r.value_a) + '</td>' +
        '<td class="num mono">' + fmtBig(r.value_b) + '</td>' +
        '<td class="mono">' + fmtDate(r.attempted_at) + '</td>' +
        '<td>' + tx + '</td>' +
      '</tr>'
    );
  }).join("");
}

function renderOracle(status) {
  if (!status) return;
  document.getElementById("health-oracle").textContent = status.oracleAddressMasked || "unset";
  document.getElementById("health-block").textContent = status.blockNumber || "...";
  document.getElementById("health-market").textContent = fmtTime(status.lastMarketSync);
  document.getElementById("health-metric").textContent = fmtTime(status.lastMetricPoll);
  document.getElementById("health-settle").textContent = fmtTime(status.lastSettlementCheck);
  document.getElementById("health-pending").textContent = status.pendingSettlements != null ? status.pendingSettlements : "0";
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
  });
}

async function fetchInitial() {
  try {
    const res = await fetch("/api/attention/compare?a=Elon%20Musk&b=Sam%20Altman");
    if (res.ok) {
      const data = await res.json();
      updateHero({ "Elon Musk": data.scoreA, "Sam Altman": data.scoreB });
      updateChart(data.history.a, data.history.b);
    }
  } catch (e) {}
  try {
    const res = await fetch("/api/costs");
    if (res.ok) { const data = await res.json(); updateStatus(data.today); }
  } catch {}
  await Promise.all([ fetchMarkets(), fetchSettlements(), fetchOracle() ]);
}

async function fetchMarkets() {
  try {
    const r = await fetch("/api/markets");
    if (!r.ok) return;
    const data = await r.json();
    renderMarkets(data.markets || []);
  } catch {}
}

async function fetchSettlements() {
  try {
    const r = await fetch("/api/settlements?limit=25");
    if (!r.ok) return;
    const data = await r.json();
    renderSettlements(data.settlements || []);
  } catch {}
}

async function fetchOracle() {
  try {
    const r = await fetch("/api/oracle/status");
    if (!r.ok) return;
    const data = await r.json();
    renderOracle(data);
  } catch {}
}

function connectWS() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(proto + "//" + location.host + "/ws");
  ws.onmessage = function(event) {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "attention:update") {
        updateHero(msg.scores || {});
        updateStatus(msg.costToday);
        fetchInitial();
      } else if (msg.type === "markets:updated") {
        fetchMarkets(); fetchOracle();
      } else if (msg.type === "metrics:updated") {
        fetchMarkets();
      } else if (msg.type === "settlement:submitted" || msg.type === "settlement:mined" || msg.type === "settlement:failed") {
        fetchSettlements(); fetchMarkets(); fetchOracle();
      }
    } catch {}
  };
  ws.onclose = function() { setTimeout(connectWS, 3000); };
}

initChart();
fetchInitial();
connectWS();
setInterval(tickCountdown, 1000);
setInterval(fetchOracle, 30000);
