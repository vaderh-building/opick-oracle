function fmtDate(sec) {
  if (!sec) return "...";
  return new Date(sec * 1000).toLocaleString();
}
function fmtBig(v) {
  if (v == null) return "...";
  try { return BigInt(v).toString(); } catch { return String(v); }
}
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
  });
}

async function load() {
  var body = document.getElementById("all-markets-body");
  try {
    var r = await fetch("/api/markets");
    var data = await r.json();
    if (!data.markets || !data.markets.length) {
      body.innerHTML = '<tr><td colspan="10" class="empty">No markets yet.</td></tr>';
      return;
    }
    body.innerHTML = data.markets.map(function(m) {
      var kw = m.keyword_a + (m.keyword_b ? " vs " + m.keyword_b : "");
      return (
        '<tr>' +
          '<td class="mono">#' + m.id + '</td>' +
          '<td>' + m.market_type_name + '</td>' +
          '<td>' + m.metric_type_name + '</td>' +
          '<td>' + escapeHtml(kw) + '</td>' +
          '<td><span class="badge badge-state-' + m.state + '">' + m.state_name + '</span></td>' +
          '<td class="mono">' + fmtDate(m.open_time) + '</td>' +
          '<td class="mono">' + fmtDate(m.close_time) + '</td>' +
          '<td class="num mono">' + fmtBig(m.settlement_value_a) + '</td>' +
          '<td class="num mono">' + fmtBig(m.settlement_value_b) + '</td>' +
          '<td class="mono"><a target="_blank" rel="noreferrer" href="https://basescan.org/address/' + m.address + '">' + m.address.slice(0,10) + '...</a></td>' +
        '</tr>'
      );
    }).join("");
  } catch (e) {
    body.innerHTML = '<tr><td colspan="10" class="empty">Failed to load.</td></tr>';
  }
}

function connectWS() {
  var proto = location.protocol === "https:" ? "wss:" : "ws:";
  var ws = new WebSocket(proto + "//" + location.host + "/ws");
  ws.onmessage = function(evt) {
    try {
      var msg = JSON.parse(evt.data);
      if (msg.type === "markets:updated" || msg.type === "settlement:mined") load();
    } catch {}
  };
  ws.onclose = function() { setTimeout(connectWS, 3000); };
}

load();
connectWS();
setInterval(load, 30000);
