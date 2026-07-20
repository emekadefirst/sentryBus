/**
 * Self-contained dashboard HTML — zero external deps.
 * Inline JS handles: topology graph (SVG nodes+edges), live SSE logs, adapter toggle.
 */
export function dashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>SentryBus Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0F172A;--surface:#1E293B;--border:#334155;--text:#F8FAFC;--muted:#94A3B8;--cyan:#38BDF8;--indigo:#6366F1;--green:#22C55E;--red:#EF4444;--yellow:#EAB308}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;min-height:100vh;padding:24px}
a{color:var(--cyan);text-decoration:none}
.header{display:flex;align-items:center;gap:16px;margin-bottom:32px}
.header svg{width:48px;height:48px;flex-shrink:0}
.header h1{font-size:24px;font-weight:800;letter-spacing:-0.5px}
.header h1 span{background:linear-gradient(135deg,#38BDF8,#6366F1);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.panels{display:grid;grid-template-columns:1fr 1fr;gap:24px}
@media(max-width:900px){.panels{grid-template-columns:1fr}}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;overflow:hidden}
.panel h2{font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:16px}
#topology-canvas{width:100%;min-height:300px;overflow:auto}
#topology-canvas svg{width:100%;height:100%}
.node{cursor:pointer}
.node rect{rx:8;transition:stroke 0.2s}
.node:hover rect{stroke-width:2.5}
.log-list{max-height:400px;overflow-y:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.8}
.log-entry{padding:4px 8px;border-radius:4px;margin-bottom:2px;display:flex;gap:10px;align-items:baseline}
.log-entry:nth-child(odd){background:rgba(255,255,255,0.02)}
.log-time{color:var(--muted);flex-shrink:0;min-width:80px}
.log-level{font-weight:700;flex-shrink:0;min-width:44px;text-transform:uppercase}
.log-level.info{color:var(--cyan)}
.log-level.warn{color:var(--yellow)}
.log-level.error{color:var(--red)}
.log-msg{color:var(--text);word-break:break-word}
.log-fields{color:var(--muted)}
.toggle-btn{background:none;border:1px solid var(--border);color:var(--muted);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;transition:all 0.2s}
.toggle-btn:hover{border-color:var(--cyan);color:var(--cyan)}
.toggle-btn.enabled{border-color:var(--green);color:var(--green)}
.toggle-btn.disabled{border-color:var(--red);color:var(--red)}
.status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
.status-dot.closed{background:var(--green)}
.status-dot.open{background:var(--red)}
.status-dot.half-open{background:var(--yellow)}
.adapter-card{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
.adapter-info{display:flex;flex-direction:column;gap:4px}
.adapter-name{font-weight:700;font-size:14px}
.adapter-meta{font-size:11px;color:var(--muted)}
.full-width{grid-column:1/-1}
</style>
</head>
<body>
<div class="header">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
    <rect width="120" height="120" rx="28" fill="#0F172A"/>
    <g transform="translate(10,10)">
      <path d="M50 12L84 24C84 62 68 86 50 96C32 86 16 62 16 24Z" fill="#1E293B" stroke="url(#lg)" stroke-width="4" stroke-linejoin="round"/>
      <path d="M50 24L50 42" stroke="#38BDF8" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="50" cy="24" r="4" fill="#38BDF8"/>
      <path d="M50 42L34 54L34 72" fill="none" stroke="#6366F1" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="34" cy="72" r="4" fill="#818CF8"/>
      <path d="M50 42L66 54L66 72" fill="none" stroke="#38BDF8" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="66" cy="72" r="4" fill="#38BDF8"/>
      <circle cx="50" cy="78" r="3.5" fill="#22C55E"/>
    </g>
    <defs><linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38BDF8"/><stop offset="100%" stop-color="#6366F1"/></linearGradient></defs>
  </svg>
  <h1>Sentry<span>Bus</span></h1>
</div>

<div class="panels">
  <div class="panel">
    <h2>Topology</h2>
    <div id="topology-canvas"></div>
  </div>
  <div class="panel">
    <h2>Adapters</h2>
    <div id="adapter-list"></div>
  </div>
  <div class="panel full-width">
    <h2>Live Logs</h2>
    <div class="log-list" id="log-list"></div>
  </div>
</div>

<script>
const API = '/_bus/api';

// ─── Topology Graph (SVG) ───────────────────────────────────────────
async function loadTopology() {
  const res = await fetch(API + '/topology');
  const {nodes, edges} = await res.json();
  renderGraph(nodes, edges);
  renderAdapterList(nodes);
}

function renderGraph(nodes, edges) {
  const topics = [...new Set(edges.map(e => e.from))];
  const allNodes = [
    {id: '__bus__', label: 'SentryBus', type: 'bus'},
    ...topics.map(t => ({id: 'topic:'+t, label: t, type: 'topic'})),
    ...nodes.map(n => ({id: 'adapter:'+n.name, label: n.name, type: 'adapter', data: n}))
  ];

  // Layout: bus at top, topics middle, adapters bottom
  const W = 700, padX = 60, busY = 40, topicY = 140, adapterY = 250;
  const nodeW = 120, nodeH = 36;

  function xPos(i, count) { return padX + (W - 2*padX) * (count === 1 ? 0.5 : i/(count-1)) - nodeW/2; }

  let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' 320">';
  svg += '<defs><linearGradient id="gg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38BDF8"/><stop offset="100%" stop-color="#6366F1"/></linearGradient></defs>';

  // Bus node
  const busX = W/2 - nodeW/2;
  svg += '<g class="node"><rect x="'+busX+'" y="'+busY+'" width="'+nodeW+'" height="'+nodeH+'" fill="url(#gg)" rx="8"/>';
  svg += '<text x="'+(busX+nodeW/2)+'" y="'+(busY+22)+'" text-anchor="middle" fill="#fff" font-size="12" font-weight="700">SentryBus</text></g>';

  // Topic nodes
  const topicPositions = {};
  topics.forEach((t, i) => {
    const x = xPos(i, topics.length);
    topicPositions[t] = {x: x+nodeW/2, y: topicY+nodeH/2};
    svg += '<g class="node"><rect x="'+x+'" y="'+topicY+'" width="'+nodeW+'" height="'+nodeH+'" fill="#0F172A" stroke="#38BDF8" stroke-width="1.5" rx="8"/>';
    svg += '<text x="'+(x+nodeW/2)+'" y="'+(topicY+22)+'" text-anchor="middle" fill="#38BDF8" font-size="11" font-family="monospace">'+t+'</text></g>';
    // Edge: bus → topic
    svg += '<line x1="'+(W/2)+'" y1="'+(busY+nodeH)+'" x2="'+(x+nodeW/2)+'" y2="'+topicY+'" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 3"/>';
  });

  // Adapter nodes
  const adapterPositions = {};
  nodes.forEach((n, i) => {
    const x = xPos(i, nodes.length);
    adapterPositions[n.name] = {x: x+nodeW/2, y: adapterY};
    const stroke = n.circuitBreaker.state === 'open' ? '#EF4444' : n.circuitBreaker.state === 'half-open' ? '#EAB308' : '#6366F1';
    const opacity = n.enabled ? '1' : '0.4';
    svg += '<g class="node" opacity="'+opacity+'"><rect x="'+x+'" y="'+adapterY+'" width="'+nodeW+'" height="'+nodeH+'" fill="#0F172A" stroke="'+stroke+'" stroke-width="1.5" rx="8"/>';
    svg += '<text x="'+(x+nodeW/2)+'" y="'+(adapterY+22)+'" text-anchor="middle" fill="#F8FAFC" font-size="11" font-family="monospace">'+n.name+'</text></g>';
  });

  // Edges: topic → adapter
  edges.forEach(e => {
    const from = topicPositions[e.from];
    const to = adapterPositions[e.to];
    if (from && to) {
      svg += '<line x1="'+from.x+'" y1="'+(from.y+nodeH/2)+'" x2="'+to.x+'" y2="'+to.y+'" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 3"/>';
    }
  });

  svg += '</svg>';
  document.getElementById('topology-canvas').innerHTML = svg;
}

function renderAdapterList(nodes) {
  const el = document.getElementById('adapter-list');
  el.innerHTML = nodes.map(n => {
    const cbState = n.circuitBreaker.state;
    const enabledClass = n.enabled ? 'enabled' : 'disabled';
    return '<div class="adapter-card" data-name="'+n.name+'">' +
      '<div class="adapter-info">' +
        '<div class="adapter-name"><span class="status-dot '+cbState+'"></span>'+n.name+'</div>' +
        '<div class="adapter-meta">'+n.protocol+' · '+n.baseUrl+' · topics: '+n.topics.join(', ')+'</div>' +
      '</div>' +
      '<button class="toggle-btn '+enabledClass+'" onclick="toggle(\''+n.name+'\')">'+( n.enabled ? 'Enabled' : 'Disabled')+'</button>' +
    '</div>';
  }).join('');
}

async function toggle(name) {
  const res = await fetch(API+'/adapters/'+encodeURIComponent(name)+'/toggle', {method:'POST'});
  if (res.ok) loadTopology();
}

// ─── Live Logs (SSE) ────────────────────────────────────────────────
async function loadLogs() {
  const res = await fetch(API+'/logs');
  const logs = await res.json();
  const el = document.getElementById('log-list');
  logs.forEach(entry => appendLog(entry, el));
  el.scrollTop = el.scrollHeight;

  // SSE stream
  const evtSource = new EventSource(API+'/logs/stream');
  evtSource.onmessage = (e) => {
    const entry = JSON.parse(e.data);
    appendLog(entry, el);
    el.scrollTop = el.scrollHeight;
  };
}

function appendLog(entry, el) {
  const time = entry.time ? entry.time.split('T')[1]?.slice(0,8) : '';
  const {level, msg, ...fields} = entry;
  const fieldStr = Object.keys(fields).length > 1 ? ' '+JSON.stringify(fields) : '';
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = '<span class="log-time">'+time+'</span>' +
    '<span class="log-level '+level+'">'+level+'</span>' +
    '<span class="log-msg">'+msg+'</span>' +
    '<span class="log-fields">'+fieldStr+'</span>';
  el.appendChild(div);
  // Keep max 200 visible
  while (el.children.length > 200) el.removeChild(el.firstChild);
}

// ─── Init ───────────────────────────────────────────────────────────
loadTopology();
loadLogs();
// Refresh topology every 10s to catch breaker state changes
setInterval(loadTopology, 10000);
</script>
</body>
</html>`;
}
