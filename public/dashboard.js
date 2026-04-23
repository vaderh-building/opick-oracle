// OPick Oracle Dashboard

const POLL_MINUTES = 15;
let lastUpdateTime = null;
let chart = null;

function fmt(n) {
  if (n == null || isNaN(n)) return "...";
  return Math.round(n).toLocaleString();
}

function initChart() {
  const ctx = document.getElementById("chart").getContext("2d");
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Elon Musk",
          data: [],
          borderColor: "#1a6b3c",
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
        {
          label: "Sam Altman",
          data: [],
          borderColor: "#8b2500",
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
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
          callbacks: {
            label: function(ctx) {
              return ctx.dataset.label + ": " + fmt(ctx.parsed.y);
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(26, 107, 60, 0.08)" },
          ticks: { font: { family: "DM Sans", size: 10 }, color: "#9c9b96" },
        },
        y: {
          grid: { color: "rgba(26, 107, 60, 0.08)" },
          ticks: {
            font: { family: "JetBrains Mono", size: 10 },
            color: "#9c9b96",
            callback: function(v) { return fmt(v); },
          },
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
    document.getElementById("musk-meta").innerHTML =
      "7-day mentions: <span>" + fmt(musk.components.base) + "</span>";
  }

  if (altman) {
    const isLeader = altman.score > (musk ? musk.score : 0);
    document.getElementById("altman-score").textContent = fmt(altman.score);
    document.getElementById("altman-score").className = "hero-score " + (isLeader ? "green" : "red");
    document.getElementById("altman-meta").innerHTML =
      "7-day mentions: <span>" + fmt(altman.components.base) + "</span>";
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
    return d.getHours().toString().padStart(2, "0") + ":" +
           d.getMinutes().toString().padStart(2, "0");
  });
  chart.data.labels = labels;
  chart.data.datasets[0].data = (histA || []).map(function(p) { return p.score; });
  chart.data.datasets[1].data = (histB || []).map(function(p) { return p.score; });
  chart.update("none");
}

function updateStatus(costToday) {
  if (costToday != null) {
    document.getElementById("cost").textContent = "$" + costToday.toFixed(3);
  }
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

// Fetch initial data via HTTP
async function fetchInitial() {
  try {
    const res = await fetch("/api/attention/compare?a=Elon%20Musk&b=Sam%20Altman");
    if (res.ok) {
      const data = await res.json();
      updateHero({ "Elon Musk": data.scoreA, "Sam Altman": data.scoreB });
      updateChart(data.history.a, data.history.b);
      updateStatus(null);
    }
  } catch (e) {
    console.log("Initial fetch failed, waiting for WebSocket:", e);
  }
  // Also get cost
  try {
    const res = await fetch("/api/costs");
    if (res.ok) {
      const data = await res.json();
      document.getElementById("cost").textContent = "$" + data.today.toFixed(3);
    }
  } catch {}
}

// WebSocket for live updates
function connectWS() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(proto + "//" + location.host + "/ws");
  ws.onmessage = function(event) {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "attention:update") {
        updateHero(msg.scores);
        updateStatus(msg.costToday);
        // Refetch history for chart
        fetchInitial();
      }
    } catch {}
  };
  ws.onclose = function() {
    setTimeout(connectWS, 3000);
  };
}

// Boot
initChart();
fetchInitial();
connectWS();
setInterval(tickCountdown, 1000);
