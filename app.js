/* AI Safety Evidence Dashboard: static D3 chart over data/papers.json. */

// Questions (text, key terms with the dashboard's working definitions, method lanes) live in data/questions.json.
let QUESTIONS = [];

const STANCE_LABELS = { "-2": "Strongly against", "-1": "Against", "0": "Mixed / orthogonal", "1": "For", "2": "Strongly for" };
const RADIUS = { low: 5, medium: 8, high: 11 };
const REL_TYPES = ["replicates", "critiques", "extends"];
// Satellite effect on how the paper bears on the question. "scope" is a hollow ring so identity is not colour-alone.
const EFFECTS = {
  supports: { label: "supports", color: "#2a78d6" },
  undermines: { label: "undermines", color: "#eb6834" },
  reframes: { label: "reframes", color: "#1baf7a" },
  scope: { label: "limits scope", color: null },
};
const FLAG_LABELS = {
  definition_mismatch: "Definition differs",
  scope_gap: "Scope gap",
  method_weak_link: "Method weak link",
  framing_overreach: "Framing overreach",
};
const UNCLASSIFIED = "not yet classified";
const isEssay = (p) => p.source_type === "essay" || p.source_type === "blog";

// Model family is derived from models_tested. Order matters: first match wins per model.
const FAMILIES = [
  { name: "Toy / theory", re: /toy|^$/i, color: "#a8a29e" },
  { name: "Small research LMs", re: /pythia|gpt-?2\b|gpt-2|bert|one-layer|810m/i, color: "#78716c" },
  { name: "Claude", re: /claude|anthropic/i, color: "#d97706" },
  { name: "OpenAI", re: /gpt|\bo[134]\b|o-series/i, color: "#059669" },
  { name: "Llama", re: /llama|hermes/i, color: "#2563eb" },
  { name: "Qwen", re: /qwen|qwq/i, color: "#7c3aed" },
  { name: "DeepSeek", re: /deepseek/i, color: "#0891b2" },
  { name: "Google", re: /gemini|gemma/i, color: "#db2777" },
  { name: "Mistral", re: /mistral|mixtral/i, color: "#ea580c" },
  { name: "OLMo", re: /olmo/i, color: "#65a30d" },
  { name: "Grok", re: /grok/i, color: "#334155" },
  { name: "Vision models", re: /inception|convnext|resnet|alexnet|\bvit\b|dinov2|\bclip\b/i, color: "#0d9488" },
  { name: "Other", re: /./, color: "#94a3b8" },
];

const familyOf = (model) => FAMILIES.find((f) => f.re.test(model.trim()));

function paperFamilies(p) {
  const models = p.models_tested.length ? p.models_tested : [""];
  const counts = new Map();
  for (const m of models) {
    const f = familyOf(m);
    counts.set(f, (counts.get(f) || 0) + 1);
  }
  return counts;
}

// Colour = the family with the most tested models; ties go to the first-listed model's family.
function primaryFamily(p) {
  const counts = paperFamilies(p);
  let best = null;
  for (const [f, n] of counts) if (!best || n > counts.get(best)) best = f;
  return best;
}

const effStance = (p) => (p.human_override && Number.isInteger(p.human_override.stance) ? p.human_override.stance : p.stance);
const parseDate = d3.utcParse("%Y-%m-%d");
const fmtDate = d3.utcFormat("%b %Y");

const state = { papers: [], byId: new Map(), discussion: {}, q: null, selected: null, view: "lanes" };
const satellitesOf = (p) => state.discussion[`${p.id}|${p.question_id}`] || [];

/* ---------- boot ---------- */

const getJSON = (url, optional = false) =>
  fetch(url).then((r) => {
    if (r.ok) return r.json();
    if (optional) return {};
    throw new Error(`${url}: ${r.status}`);
  });

Promise.all([getJSON("data/questions.json"), getJSON("data/papers.json"), getJSON("data/discussion.json", true)])
  .then(([questions, papers, discussion]) => {
    QUESTIONS = questions;
    state.discussion = discussion;
    for (const p of papers) {
      p._date = parseDate(p.first_version_date);
      p._family = primaryFamily(p);
      p._key = `${p.id}|${p.question_id}`;
      state.byId.set(p.id, p);
    }
    state.papers = papers;
    buildTabs();
    buildViewToggle();
    applyHash();
    // updateHash uses replaceState, which doesn't fire hashchange, so this only sees links and back/forward.
    window.addEventListener("hashchange", applyHash);
    let t;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(render, 150);
    });
  })
  .catch((e) => {
    document.getElementById("chart").innerHTML =
      `<p class="muted">Could not load the data (${esc(e.message || e)}). If you opened index.html directly from disk, serve the folder instead: <code>python3 -m http.server</code>.</p>`;
  });

function applyHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  state.view = h.get("view") === "stance" ? "stance" : "lanes";
  selectQuestion(QUESTIONS.some((q) => q.id === h.get("q")) ? h.get("q") : QUESTIONS[0].id, h.get("paper"));
}

function buildTabs() {
  const nav = d3.select("#tabs");
  nav.selectAll("button")
    .data(QUESTIONS)
    .join("button")
    .attr("role", "tab")
    .text((q) => q.tab)
    .on("click", (_, q) => selectQuestion(q.id));
}

function buildViewToggle() {
  d3.select("#view-toggle").selectAll("button")
    .data([{ id: "lanes", t: "By method" }, { id: "stance", t: "LLM judgment" }])
    .join("button")
    .attr("type", "button")
    .text((d) => d.t)
    .on("click", (_, d) => {
      state.view = d.id;
      updateHash();
      render();
    });
}

const recordFor = (id, qid = state.q) => state.papers.find((p) => p.id === id && p.question_id === qid);

function selectQuestion(qid, paperId = null) {
  state.q = qid;
  state.selected = paperId && recordFor(paperId, qid) ? paperId : null;
  d3.selectAll("#tabs button").attr("aria-selected", (q) => q.id === qid);
  const q = QUESTIONS.find((x) => x.id === qid);
  document.getElementById("question-text").textContent = q.text;
  updateHash();
  render();
}

function updateHash() {
  const h = new URLSearchParams({ q: state.q });
  if (state.view === "stance") h.set("view", "stance");
  if (state.selected) h.set("paper", state.selected);
  history.replaceState(null, "", "#" + h.toString());
}

/* ---------- chart ---------- */

function render() {
  const papers = state.papers.filter((p) => p.question_id === state.q).sort((a, b) => a._date - b._date);
  renderStats(papers);
  renderChart(papers);
  renderLegend(papers);
  renderMatrix(papers);
  renderDetail(state.selected ? recordFor(state.selected) : null);
}

function renderStats(papers) {
  const parts = [`${papers.length} papers`];
  if (state.view === "stance") {
    const mean = d3.mean(papers, effStance);
    const flagged = papers.filter((p) => p.flagged).length;
    const overridden = papers.filter((p) => p.human_override).length;
    parts.push(`mean stance ${mean >= 0 ? "+" : ""}${mean.toFixed(2)}`);
    if (flagged) parts.push(`${flagged} flagged for review`);
    if (overridden) parts.push(`${overridden} human-overridden`);
  } else {
    const sats = papers.flatMap(satellitesOf);
    const mismatches = papers.flatMap((p) => p.adversarial?.flags || []).filter((f) => f.kind === "definition_mismatch").length;
    const essays = papers.filter(isEssay).length;
    parts.push(`${sats.length} outside critiques kept`);
    if (mismatches) parts.push(`${mismatches} definition mismatches`);
    if (essays) parts.push(`${essays} not peer-reviewed`);
  }
  document.getElementById("question-stats").textContent = parts.join(" · ");
  d3.selectAll("#view-toggle button").attr("aria-pressed", (d) => d.id === state.view);
  document.getElementById("judgment-banner").hidden = state.view !== "stance";
}

function renderChart(papers) {
  const host = document.getElementById("chart");
  const width = Math.max(300, host.clientWidth);
  const narrow = width < 560;
  const stanceView = state.view === "stance";
  const q = QUESTIONS.find((x) => x.id === state.q);

  // Lanes group papers by what they actually studied (operationalization.lane), so the y-axis carries no judgment.
  const laneOf = (p) => (q.lanes.includes(p.operationalization?.lane) ? p.operationalization.lane : UNCLASSIFIED);
  const lanes = q.lanes.filter((l) => papers.some((p) => laneOf(p) === l));
  if (papers.some((p) => laneOf(p) === UNCLASSIFIED)) lanes.push(UNCLASSIFIED);

  const margin = { top: 16, right: narrow ? 12 : 20, bottom: 30, left: stanceView ? (narrow ? 56 : 112) : 8 };
  const height = stanceView ? (narrow ? 380 : 440) : Math.max(300, lanes.length * (narrow ? 92 : 104) + 46);
  const iw = width - margin.left - margin.right;
  const ih = height - margin.top - margin.bottom;
  const rScale = narrow ? 0.8 : 1;

  const [d0, d1] = d3.extent(papers, (p) => p._date);
  const pad = Math.max(30, (d1 - d0) / 864e5 * 0.04) * 864e5;
  const x = d3.scaleUtc().domain([new Date(+d0 - pad), new Date(+d1 + pad)]).range([0, iw]);
  const y = d3.scaleLinear().domain([-2.5, 2.5]).range([ih, 0]);
  const lane = d3.scaleBand().domain(lanes).range([0, ih]).paddingInner(0.06);
  // In the lanes view, size and opacity would also be model judgments, so dots are uniform.
  const radius = (p) => (stanceView ? RADIUS[p.evidence_strength] : RADIUS.medium) * rScale;
  const baseY = (p) => (stanceView ? y(effStance(p)) : lane(laneOf(p)) + lane.bandwidth() / 2 + 7);
  const maxShift = stanceView ? (y(0) - y(0.5)) * 0.85 : Math.max(0, lane.bandwidth() / 2 - 24);

  // Place dots, nudging vertically within their band to avoid overlaps.
  const placed = [];
  for (const p of papers) {
    const r = radius(p);
    const cx = x(p._date);
    const base = baseY(p);
    let cy = base;
    for (let k = 0; k < 12; k++) {
      const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (r * 0.9);
      if (Math.abs(off) > maxShift) break;
      const cand = base + off;
      if (!placed.some((o) => Math.hypot(o.cx - cx, o.cy - cand) < o.r + r + 1)) {
        cy = cand;
        break;
      }
    }
    placed.push({ p, cx, cy, r });
  }
  const pos = new Map(placed.map((d) => [d.p.id, d]));

  const svg = d3.select(host).selectAll("svg").data([null]).join("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img");
  svg.selectAll("*").remove();

  const defs = svg.append("defs");
  for (const t of REL_TYPES) {
    defs.append("marker")
      .attr("id", `arrow-${t}`)
      .attr("viewBox", "0 0 10 10").attr("refX", 9).attr("refY", 5)
      .attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto-start-reverse")
      .append("path").attr("d", "M0,0 L10,5 L0,10 z").attr("class", `arrow ${t}`);
  }

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`)
    .call(d3.axisBottom(x).ticks(narrow ? 4 : 8).tickSizeOuter(0));

  if (stanceView) {
    g.append("g").selectAll("line").data([-2, -1, 1, 2]).join("line")
      .attr("class", "gridline").attr("x1", 0).attr("x2", iw).attr("y1", y).attr("y2", y);
    g.append("line").attr("class", "zero-line").attr("x1", 0).attr("x2", iw).attr("y1", y(0)).attr("y2", y(0));

    const yAxis = g.append("g").attr("class", "axis")
      .call(d3.axisLeft(y).tickValues([-2, -1, 0, 1, 2]).tickFormat((v) => (narrow ? "" : (v > 0 ? "+" : "") + v)).tickSizeOuter(0));
    yAxis.select(".domain").remove();

    const bands = [{ v: 1.5, t: "For" }, { v: 0, t: "Mixed" }, { v: -1.5, t: "Against" }];
    g.append("g").selectAll("text").data(bands).join("text")
      .attr("class", "band-label")
      .attr("x", narrow ? -8 : -40).attr("y", (d) => y(d.v)).attr("dy", "0.35em")
      .attr("text-anchor", "end").text((d) => d.t);
  } else {
    const lg = g.append("g").selectAll("g").data(lanes).join("g");
    lg.append("rect").attr("class", (_, i) => "lane-bg" + (i % 2 ? " alt" : ""))
      .attr("x", 0).attr("width", iw).attr("y", (l) => lane(l)).attr("height", lane.bandwidth()).attr("rx", 6);
    lg.append("text").attr("class", (l) => "lane-label" + (l === UNCLASSIFIED ? " muted-lane" : ""))
      .attr("x", 8).attr("y", (l) => lane(l) + 15).text((l) => l);
  }

  // Relation edges (only those whose target is in this question).
  const edges = [];
  for (const p of papers) {
    for (const r of p.relations || []) {
      if (pos.has(r.target_id)) edges.push({ source: p.id, target: r.target_id, type: r.type });
    }
  }
  // Separate parallel edges between the same pair.
  const pairCount = d3.rollup(edges, (v) => v.length, (e) => e.source + "|" + e.target);
  const pairSeen = new Map();
  g.append("g").selectAll("path").data(edges).join("path")
    .attr("class", (e) => `edge ${e.type}`)
    .attr("marker-end", (e) => `url(#arrow-${e.type})`)
    .attr("d", (e) => {
      const key = e.source + "|" + e.target;
      const i = pairSeen.get(key) || 0;
      pairSeen.set(key, i + 1);
      return edgePath(pos.get(e.source), pos.get(e.target), i - (pairCount.get(key) - 1) / 2);
    });

  const tip = document.getElementById("tooltip");
  const showTip = (html, cx, cy) => {
    tip.hidden = false;
    tip.innerHTML = html;
    const sx = width > 0 ? host.clientWidth / width : 1;
    const left = Math.min((margin.left + cx) * sx + 12, host.clientWidth - 290);
    tip.style.left = Math.max(0, left) + "px";
    tip.style.top = (margin.top + cy) * sx + 12 + "px";
  };

  // Satellites: outside critiques orbiting their paper, highest-scored first, starting at 12 o'clock.
  const satData = placed.flatMap((d) => {
    const shown = [...satellitesOf(d.p)].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10);
    const ring = d.r + 8;
    return shown.map((s, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(shown.length, 6);
      return { s, d, x: d.cx + ring * Math.cos(a), y: d.cy + ring * Math.sin(a), r: (2.5 + Math.min(2, Math.log10((s.score || 0) + 1))) * rScale };
    });
  });
  const sg = g.append("g").attr("class", "satellites");
  sg.selectAll("line").data(satData).join("line").attr("class", "tether")
    .attr("x1", (o) => o.d.cx).attr("y1", (o) => o.d.cy).attr("x2", (o) => o.x).attr("y2", (o) => o.y);
  const sat = sg.selectAll("g").data(satData).join("g").attr("class", "sat")
    .attr("tabindex", 0).attr("role", "link")
    .attr("aria-label", (o) => `${o.s.author} on ${o.s.platform}: ${EFFECTS[o.s.effect].label}`)
    .on("click", (_, o) => window.open(o.s.url, "_blank", "noopener"))
    .on("keydown", (ev, o) => {
      if (ev.key === "Enter") window.open(o.s.url, "_blank", "noopener");
    })
    .on("mouseenter focus", (_, o) => showTip(
      `<strong>${esc(o.s.author)}</strong> · ${esc(o.s.platform)} · ${esc(EFFECTS[o.s.effect].label)}<br>` +
      `“${esc(trunc(o.s.quote, 200))}”<br><span class="tip-muted">${esc(o.s.summary)}</span>`, o.x, o.y))
    .on("mouseleave blur", () => (tip.hidden = true));
  sat.append("circle").attr("class", "sat-hit").attr("cx", (o) => o.x).attr("cy", (o) => o.y).attr("r", 7);
  sat.append("circle").attr("class", (o) => `sat-dot ${o.s.effect}`)
    .attr("cx", (o) => o.x).attr("cy", (o) => o.y).attr("r", (o) => o.r)
    .attr("fill", (o) => EFFECTS[o.s.effect].color || "var(--bg)");

  // Dots (squares for essays/blogs, which were not peer reviewed)
  const dots = g.append("g").selectAll("g").data(placed, (d) => d.p.id).join("g");

  if (stanceView) {
    dots.filter((d) => d.p.flagged).append("circle")
      .attr("class", "dot-flag").attr("cx", (d) => d.cx).attr("cy", (d) => d.cy).attr("r", (d) => d.r + 3.5);
    dots.filter((d) => d.p.human_override).append("circle")
      .attr("class", "dot-override").attr("cx", (d) => d.cx).attr("cy", (d) => d.cy).attr("r", (d) => d.r + 3.5);
  }

  const shape = (sel) => sel.each(function (d) {
    const el = d3.select(this);
    if (isEssay(d.p)) {
      el.append("rect").attr("x", d.cx - d.r).attr("y", d.cy - d.r).attr("width", 2 * d.r).attr("height", 2 * d.r).attr("rx", 2);
    } else {
      el.append("circle").attr("cx", d.cx).attr("cy", d.cy).attr("r", d.r);
    }
  });
  const mark = dots.append("g").call(shape).selectAll("circle, rect");
  mark
    .attr("class", (d) => "dot" + (d.p.id === state.selected ? " selected" : ""))
    .attr("fill", (d) => d.p._family.color)
    .attr("fill-opacity", (d) => (stanceView ? 0.25 + 0.75 * d.p.judge_confidence : 0.9))
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", (d) => stanceView
      ? `${d.p.title}, ${STANCE_LABELS[effStance(d.p)]}`
      : `${d.p.title}, ${laneOf(d.p)}, ${satellitesOf(d.p).length} outside critiques`)
    .on("click", (_, d) => selectPaper(d.p.id))
    .on("keydown", (ev, d) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        selectPaper(d.p.id);
      }
    })
    .on("mouseenter focus", (_, d) => {
      highlightEdges(g, d.p.id);
      const n = satellitesOf(d.p).length;
      const extra = stanceView ? STANCE_LABELS[effStance(d.p)] : `${n} outside critique${n === 1 ? "" : "s"}`;
      showTip(`<strong>${esc(d.p.title)}</strong><br>${esc(d.p.first_version_date)} · ${extra} · ${d.p._family.name}${isEssay(d.p) ? " · not peer-reviewed" : ""}`, d.cx, d.cy);
    })
    .on("mouseleave blur", () => {
      tip.hidden = true;
      highlightEdges(g, state.selected);
    });

  highlightEdges(g, state.selected);
}

function edgePath(a, b, lane) {
  // Quadratic curve bowing perpendicular to the chord; trimmed to the circle edges.
  const dx = b.cx - a.cx, dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(80, 0.25 * len) * (1 + 0.6 * lane);
  const mx = (a.cx + b.cx) / 2 - (dy / len) * bow;
  const my = (a.cy + b.cy) / 2 + (dx / len) * bow;
  const trim = (p, q, r) => {
    const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: p.x + ((q.x - p.x) / l) * r, y: p.y + ((q.y - p.y) / l) * r };
  };
  const s = trim({ x: a.cx, y: a.cy }, { x: mx, y: my }, a.r + 1);
  const t = trim({ x: b.cx, y: b.cy }, { x: mx, y: my }, b.r + 3);
  return `M${s.x},${s.y} Q${mx},${my} ${t.x},${t.y}`;
}

function highlightEdges(g, id) {
  g.selectAll(".edge")
    .classed("hi", (e) => id && (e.source === id || e.target === id))
    .classed("dim", (e) => id && e.source !== id && e.target !== id);
}

/* ---------- legend ---------- */

function renderLegend(papers) {
  const el = document.getElementById("legend");
  const fams = new Map();
  for (const p of papers) fams.set(p._family.name, p._family);
  const famOrder = FAMILIES.filter((f) => fams.has(f.name));
  const stanceView = state.view === "stance";

  const dot = (r, fill, extra = "") =>
    `<svg width="${2 * r + 2}" height="${2 * r + 2}"><circle cx="${r + 1}" cy="${r + 1}" r="${r}" fill="${fill}" ${extra}/></svg>`;
  const square = (r, fill) =>
    `<svg width="${2 * r + 2}" height="${2 * r + 2}"><rect x="1" y="1" width="${2 * r}" height="${2 * r}" rx="2" fill="${fill}"/></svg>`;
  const line = (t) =>
    `<svg width="34" height="10"><path d="M2,5 L32,5" class="edge ${t}" style="opacity:1"/></svg>`;
  const satItem = ([k, e]) =>
    `<span class="item"><svg width="10" height="10"><circle cx="5" cy="5" r="3.5" class="sat-dot ${k}" fill="${e.color || "var(--bg)"}"/></svg>${e.label}</span>`;

  el.innerHTML = `
    <div class="group"><span class="group-title">Model family</span>
      ${famOrder.map((f) => `<span class="item">${dot(5, f.color)}${esc(f.name)}</span>`).join("")}
    </div>
    <div class="group"><span class="group-title">Source</span>
      <span class="item">${dot(5, "#9ca3af")}paper / preprint</span>
      <span class="item">${square(5, "#9ca3af")}essay / blog (not peer-reviewed)</span>
    </div>
    ${stanceView ? `
    <div class="group"><span class="group-title">Evidence</span>
      ${["low", "medium", "high"].map((s) => `<span class="item">${dot(RADIUS[s] * 0.8, "#9ca3af")}${s}</span>`).join("")}
    </div>
    <div class="group"><span class="group-title">Confidence</span>
      ${[0.2, 0.6, 1].map((c) => `<span class="item">${dot(6, "#475569", `fill-opacity="${0.25 + 0.75 * c}"`)}${c}</span>`).join("")}
    </div>` : `
    <div class="group"><span class="group-title">Outside critiques</span>
      ${Object.entries(EFFECTS).map(satItem).join("")}
    </div>`}
    <div class="group"><span class="group-title">Relations</span>
      ${REL_TYPES.map((t) => `<span class="item">${line(t)}${t}</span>`).join("")}
    </div>
    ${stanceView ? `
    <div class="group"><span class="group-title">Marks</span>
      <span class="item">${dot(7, "none", 'stroke="#b45309" stroke-dasharray="2 2" stroke-width="1.5"')}flagged</span>
      <span class="item">${dot(7, "none", 'stroke="#6d28d9" stroke-width="2"')}human override</span>
    </div>` : ""}`;
}

/* ---------- definitions matrix ---------- */

// Rows = papers, columns = the question's key terms. Each cell is the paper's own quoted usage;
// cells an adversarial reader flagged as differing from the question's working definition are highlighted.
function renderMatrix(papers) {
  const el = document.getElementById("matrix");
  const q = QUESTIONS.find((x) => x.id === state.q);
  const terms = Object.keys(q.terms);
  const rows = papers.filter((p) => p.operationalization);
  if (!rows.length) {
    el.innerHTML = `<h2>How each paper defines the terms</h2><p class="muted">No papers in this question have been through the definitions pass yet.</p>`;
    return;
  }
  const cell = (p, term) => {
    const v = p.operationalization.terms?.[term];
    const flag = (p.adversarial?.flags || []).find((f) => f.kind === "definition_mismatch" && f.term === term);
    const cls = flag ? ' class="mismatch"' : "";
    if (v === undefined) return `<td${cls}><span class="muted">not used</span></td>`;
    if (v === null) return `<td${cls}><span class="muted">used, not defined</span>${flag ? flagNote(flag) : ""}</td>`;
    return `<td${cls}><q>${esc(v.quote)}</q> <span class="loc">${esc(v.location)}</span>${flag ? flagNote(flag) : ""}</td>`;
  };
  const flagNote = (f) => `<span class="mismatch-note">⚑ ${esc(f.text)}</span>`;
  el.innerHTML = `
    <h2>How each paper defines the terms</h2>
    <p class="muted">Quotes are the papers' own words (machine-checked against the source text). ⚑ marks a cell where a blinded reader found the paper's sense differs from the question's.</p>
    <div class="matrix-scroll"><table>
      <thead><tr><th>Paper</th>${terms.map((t) => `<th>${esc(t)}<span class="def">Question's sense: ${esc(q.terms[t])}</span></th>`).join("")}<th>What was measured</th></tr></thead>
      <tbody>${rows.map((p) => `
        <tr${p.id === state.selected ? ' class="selected"' : ""}>
          <th scope="row"><button class="rel-link" data-id="${esc(p.id)}">${esc(trunc(p.title, 70))}</button><span class="loc">${esc(p.first_version_date.slice(0, 4))}${isEssay(p) ? " · essay" : ""}</span></th>
          ${terms.map((t) => cell(p, t)).join("")}
          <td>${esc(p.operationalization.measured)} <span class="loc">${esc(p.operationalization.unit)} · ${esc(p.operationalization.models_scope)}</span></td>
        </tr>`).join("")}
      </tbody>
    </table></div>`;
  el.querySelectorAll(".rel-link").forEach((b) => b.addEventListener("click", () => selectPaper(b.dataset.id)));
}

/* ---------- detail panel ---------- */

function selectPaper(id) {
  state.selected = state.selected === id ? null : id;
  updateHash();
  render();
  if (state.selected) document.getElementById("detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderDetail(p) {
  const el = document.getElementById("detail");
  if (!p) {
    el.innerHTML = `<p class="muted">Tap or click a dot to see the paper's details.</p>`;
    return;
  }
  const s = effStance(p);
  const badges = [`<span class="badge stance">${s > 0 ? "+" : ""}${s} · ${STANCE_LABELS[s]}</span>`];
  if (p.flagged) {
    badges.push(`<span class="badge flag">⚑ Flagged for review: scoring passes disagree (${(p.stance_passes || []).map(sign).join(" vs ")})</span>`);
  }
  if (p.human_override) {
    badges.push(`<span class="badge override">✎ Human override${p.human_override.stance !== undefined ? `: stance ${sign(p.human_override.stance)} (model said ${sign(p.stance)})` : ""}</span>`);
  }

  const fams = [...paperFamilies(p).keys()].map((f) => f.name);
  const rels = (p.relations || []).map((r) => {
    const t = state.byId.get(r.target_id);
    return `<li>${esc(r.type)} → ${t ? `<button class="rel-link" data-id="${esc(t.id)}">${esc(t.title)}</button>` : esc(r.target_id)}</li>`;
  });
  const incoming = state.papers.filter((o) => (o.relations || []).some((r) => r.target_id === p.id))
    .flatMap((o) => o.relations.filter((r) => r.target_id === p.id).map((r) =>
      `<li><button class="rel-link" data-id="${esc(o.id)}">${esc(o.title)}</button> ${esc(r.type)} this</li>`));

  const row = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : "");
  const list = (xs) => (xs.length ? `<ul>${xs.join("")}</ul>` : "—");

  const quote = (v) => `<q>${esc(v.quote)}</q> <span class="loc">${esc(v.location)}</span>`;
  const op = p.operationalization;
  const flags = (p.adversarial?.flags || []).map((f) =>
    `<li><span class="flag-kind ${esc(f.kind)}">${esc(FLAG_LABELS[f.kind] || f.kind)}${f.term ? `: ${esc(f.term)}` : ""}</span> ${esc(f.text)}<br>${quote(f)}</li>`);
  const sats = [...satellitesOf(p)].sort((a, b) => (b.score || 0) - (a.score || 0)).map((o) =>
    `<li><span class="sat-effect ${esc(o.effect)}">${esc(EFFECTS[o.effect].label)}</span>
      <a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.author)}</a>
      <span class="loc">${esc(o.platform)} · ${esc(o.date)}${o.score != null ? ` · ${o.score} karma` : ""}</span><br>
      <q>${esc(o.quote)}</q><br><span class="muted">${esc(o.summary)}</span></li>`);

  el.innerHTML = `
    <h2><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a></h2>
    <p class="meta">${esc(p.authors.join(", "))} · first version ${esc(p.first_version_date)} · <code>${esc(p.id)}</code>${isEssay(p) ? ` · <strong>${esc(p.source_type)}, not peer-reviewed</strong>` : ""}</p>
    <dl>
      ${row("Authors' claim", p.author_claim ? quote(p.author_claim)
        : p.author_claim === null ? `<span class="muted">The authors never state an implication for this question; any link to it is the dashboard's inference.</span>` : "")}
      ${op ? row("What was measured", `${esc(op.measured)} <span class="loc">${esc(op.unit)} · ${esc(op.models_scope)} · ${esc(op.lane)}</span>`) : ""}
      ${op ? row("Definitions", list(Object.entries(op.terms || {}).map(([t, v]) => `<li><strong>${esc(t)}</strong>: ${v ? quote(v) : `<span class="muted">used, not defined</span>`}</li>`))) : ""}
      ${p.adversarial ? row(`Adversarial reading${p.adversarial.blinded ? " <span class=\"loc\">(blinded)</span>" : ""}`, list(flags)) : ""}
      ${row(`Outside critiques (${sats.length})`, sats.length ? `<ul class="sat-list">${sats.join("")}</ul>` : `<span class="muted">None kept yet.</span>`)}
      ${row("Setup", esc(p.setup))}
      ${row("Key result", esc(p.key_result))}
      ${row("Models tested", p.models_tested.length ? `<div class="chips">${p.models_tested.map((m) => `<span class="chip">${esc(m)}</span>`).join("")}</div>` : "—")}
      ${row("Model families", esc(fams.join(", ")) + (fams.length > 1 ? ` (colour: ${esc(p._family.name)})` : ""))}
      ${row("Caveats", list(p.caveats.map((c) => `<li>${esc(c)}</li>`)))}
      ${row("Code available", p.code_available ? "Yes" : "No / not found")}
      ${row("Relations", list(rels))}
      ${row("Cited by (in dataset)", list(incoming))}
      ${row("Link", `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url)}</a>`)}
    </dl>
    <details class="judgment"${state.view === "stance" ? " open" : ""}>
      <summary>LLM judgment (stance score)</summary>
      <p class="muted">A model's reading of which way this paper points on the question. Kept for reference; it is a judgment call, not the authors' claim.</p>
      <div class="badges">${badges.join("")}</div>
      <dl>
        ${row("Claim (paraphrase)", esc(p.claim))}
        ${row("Stance rationale", esc(p.stance_rationale))}
        ${row("Scoring passes", p.stance_passes ? `A (claim) ${sign(p.stance_passes[0])} · B (evidence) ${sign(p.stance_passes[1])} → stance ${sign(p.stance)}` : "")}
        ${p.blind_pass ? row("Blind pass", `${sign(p.blind_pass.stance)} · ${esc(p.blind_pass.evidence_strength)} · conf ${p.blind_pass.judge_confidence.toFixed(2)}${p.blind_pass.stance !== p.stance ? " <strong>(differs)</strong>" : ""}<br><span class="muted">${esc(p.blind_pass.rationale)}</span>`) : ""}
        ${p.human_override ? row("Override note", esc(p.human_override.note || "")) : ""}
        ${row("Evidence strength", esc(p.evidence_strength))}
        ${row("Judge confidence", p.judge_confidence.toFixed(2))}
      </dl>
    </details>`;
  el.querySelectorAll(".rel-link").forEach((b) =>
    b.addEventListener("click", () => {
      const t = recordFor(b.dataset.id) || state.byId.get(b.dataset.id);
      if (t.question_id !== state.q) selectQuestion(t.question_id, t.id);
      else selectPaper(t.id);
    }));
}

const sign = (v) => (v > 0 ? "+" : "") + v;
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
