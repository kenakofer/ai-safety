/* AI Safety Evidence Dashboard: static D3 chart over data/papers.json. */

const QUESTIONS = [
  {
    id: "superposition",
    tab: "Superposition",
    text: "Is polysemanticity in LLM neurons primarily explained by superposition (the model compressing more features than it has dimensions)?",
  },
  {
    id: "cot",
    tab: "CoT monitoring",
    text: "Do frontier models' chains of thought reliably reveal the factors that actually drive their answers, enough to support CoT monitoring?",
  },
  {
    id: "alignment_faking",
    tab: "Alignment faking",
    text: "Do frontier LLMs robustly fake alignment (behave differently when they believe they're being trained vs. unmonitored) across models and setups?",
  },
];

const STANCE_LABELS = { "-2": "Strongly against", "-1": "Against", "0": "Mixed / orthogonal", "1": "For", "2": "Strongly for" };
const RADIUS = { low: 5, medium: 8, high: 11 };
const REL_TYPES = ["replicates", "critiques", "extends"];

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

const state = { papers: [], byId: new Map(), q: null, selected: null };

/* ---------- boot ---------- */

fetch("data/papers.json")
  .then((r) => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  })
  .then((papers) => {
    for (const p of papers) {
      p._date = parseDate(p.first_version_date);
      p._family = primaryFamily(p);
      state.byId.set(p.id, p);
    }
    state.papers = papers;
    buildTabs();
    const fromHash = new URLSearchParams(location.hash.slice(1));
    selectQuestion(QUESTIONS.some((q) => q.id === fromHash.get("q")) ? fromHash.get("q") : QUESTIONS[0].id, fromHash.get("paper"));
    let t;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(render, 150);
    });
  })
  .catch((e) => {
    document.getElementById("chart").innerHTML =
      `<p class="muted">Could not load data/papers.json (${e}). If you opened index.html directly from disk, serve the folder instead: <code>python3 -m http.server</code>.</p>`;
  });

function buildTabs() {
  const nav = d3.select("#tabs");
  nav.selectAll("button")
    .data(QUESTIONS)
    .join("button")
    .attr("role", "tab")
    .text((q) => q.tab)
    .on("click", (_, q) => selectQuestion(q.id));
}

function selectQuestion(qid, paperId = null) {
  state.q = qid;
  state.selected = paperId && state.byId.get(paperId)?.question_id === qid ? paperId : null;
  d3.selectAll("#tabs button").attr("aria-selected", (q) => q.id === qid);
  const q = QUESTIONS.find((x) => x.id === qid);
  document.getElementById("question-text").textContent = q.text;
  updateHash();
  render();
}

function updateHash() {
  const h = new URLSearchParams({ q: state.q });
  if (state.selected) h.set("paper", state.selected);
  history.replaceState(null, "", "#" + h.toString());
}

/* ---------- chart ---------- */

function render() {
  const papers = state.papers.filter((p) => p.question_id === state.q).sort((a, b) => a._date - b._date);
  renderStats(papers);
  renderChart(papers);
  renderLegend(papers);
  renderDetail(state.selected ? state.byId.get(state.selected) : null);
}

function renderStats(papers) {
  const mean = d3.mean(papers, effStance);
  const flagged = papers.filter((p) => p.flagged).length;
  const overridden = papers.filter((p) => p.human_override).length;
  const parts = [`${papers.length} papers`, `mean stance ${mean >= 0 ? "+" : ""}${mean.toFixed(2)}`];
  if (flagged) parts.push(`${flagged} flagged for review`);
  if (overridden) parts.push(`${overridden} human-overridden`);
  document.getElementById("question-stats").textContent = parts.join(" · ");
}

function renderChart(papers) {
  const host = document.getElementById("chart");
  const width = Math.max(300, host.clientWidth);
  const narrow = width < 560;
  const margin = { top: 16, right: narrow ? 12 : 20, bottom: 30, left: narrow ? 56 : 112 };
  const height = narrow ? 380 : 440;
  const iw = width - margin.left - margin.right;
  const ih = height - margin.top - margin.bottom;
  const rScale = narrow ? 0.8 : 1;

  const [d0, d1] = d3.extent(papers, (p) => p._date);
  const pad = Math.max(30, (d1 - d0) / 864e5 * 0.04) * 864e5;
  const x = d3.scaleUtc().domain([new Date(+d0 - pad), new Date(+d1 + pad)]).range([0, iw]);
  const y = d3.scaleLinear().domain([-2.5, 2.5]).range([ih, 0]);

  // Place dots, nudging vertically within their stance band to avoid overlaps.
  const placed = [];
  const maxShift = (y(0) - y(0.5)) * 0.85;
  for (const p of papers) {
    const r = RADIUS[p.evidence_strength] * rScale;
    const cx = x(p._date);
    const base = y(effStance(p));
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

  // Grid + axes
  g.append("g").selectAll("line").data([-2, -1, 1, 2]).join("line")
    .attr("class", "gridline").attr("x1", 0).attr("x2", iw).attr("y1", y).attr("y2", y);
  g.append("line").attr("class", "zero-line").attr("x1", 0).attr("x2", iw).attr("y1", y(0)).attr("y2", y(0));

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`)
    .call(d3.axisBottom(x).ticks(narrow ? 4 : 8).tickSizeOuter(0));

  const yAxis = g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y).tickValues([-2, -1, 0, 1, 2]).tickFormat((v) => (narrow ? "" : (v > 0 ? "+" : "") + v)).tickSizeOuter(0));
  yAxis.select(".domain").remove();

  const bands = [{ v: 1.5, t: "For" }, { v: 0, t: "Mixed" }, { v: -1.5, t: "Against" }];
  g.append("g").selectAll("text").data(bands).join("text")
    .attr("class", "band-label")
    .attr("x", narrow ? -8 : -40).attr("y", (d) => y(d.v)).attr("dy", "0.35em")
    .attr("text-anchor", "end").text((d) => d.t);

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

  // Dots
  const tip = document.getElementById("tooltip");
  const dots = g.append("g").selectAll("g").data(placed, (d) => d.p.id).join("g");

  dots.filter((d) => d.p.flagged).append("circle")
    .attr("class", "dot-flag").attr("cx", (d) => d.cx).attr("cy", (d) => d.cy).attr("r", (d) => d.r + 3.5);
  dots.filter((d) => d.p.human_override).append("circle")
    .attr("class", "dot-override").attr("cx", (d) => d.cx).attr("cy", (d) => d.cy).attr("r", (d) => d.r + 3.5);

  dots.append("circle")
    .attr("class", (d) => "dot" + (d.p.id === state.selected ? " selected" : ""))
    .attr("cx", (d) => d.cx).attr("cy", (d) => d.cy).attr("r", (d) => d.r)
    .attr("fill", (d) => d.p._family.color)
    .attr("fill-opacity", (d) => 0.25 + 0.75 * d.p.judge_confidence)
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", (d) => `${d.p.title}, ${STANCE_LABELS[effStance(d.p)]}`)
    .on("click", (_, d) => selectPaper(d.p.id))
    .on("keydown", (ev, d) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        selectPaper(d.p.id);
      }
    })
    .on("mouseenter focus", (ev, d) => {
      highlightEdges(g, d.p.id);
      tip.hidden = false;
      tip.innerHTML = `<strong>${esc(d.p.title)}</strong><br>${esc(d.p.first_version_date)} · ${STANCE_LABELS[effStance(d.p)]} · ${d.p._family.name}`;
      const sx = width > 0 ? host.clientWidth / width : 1;
      const left = Math.min((margin.left + d.cx) * sx + 12, host.clientWidth - 270);
      tip.style.left = Math.max(0, left) + "px";
      tip.style.top = (margin.top + d.cy) * sx + 12 + "px";
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

  const dot = (r, fill, extra = "") =>
    `<svg width="${2 * r + 2}" height="${2 * r + 2}"><circle cx="${r + 1}" cy="${r + 1}" r="${r}" fill="${fill}" ${extra}/></svg>`;
  const line = (t) =>
    `<svg width="34" height="10"><path d="M2,5 L32,5" class="edge ${t}" style="opacity:1"/></svg>`;

  el.innerHTML = `
    <div class="group"><span class="group-title">Model family</span>
      ${famOrder.map((f) => `<span class="item">${dot(5, f.color)}${esc(f.name)}</span>`).join("")}
    </div>
    <div class="group"><span class="group-title">Evidence</span>
      ${["low", "medium", "high"].map((s) => `<span class="item">${dot(RADIUS[s] * 0.8, "#9ca3af")}${s}</span>`).join("")}
    </div>
    <div class="group"><span class="group-title">Confidence</span>
      ${[0.2, 0.6, 1].map((c) => `<span class="item">${dot(6, "#475569", `fill-opacity="${0.25 + 0.75 * c}"`)}${c}</span>`).join("")}
    </div>
    <div class="group"><span class="group-title">Relations</span>
      ${REL_TYPES.map((t) => `<span class="item">${line(t)}${t}</span>`).join("")}
    </div>
    <div class="group"><span class="group-title">Marks</span>
      <span class="item">${dot(7, "none", 'stroke="#b45309" stroke-dasharray="2 2" stroke-width="1.5"')}flagged</span>
      <span class="item">${dot(7, "none", 'stroke="#6d28d9" stroke-width="2"')}human override</span>
    </div>`;
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

  el.innerHTML = `
    <h2><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a></h2>
    <p class="meta">${esc(p.authors.join(", "))} · first version ${esc(p.first_version_date)} · <code>${esc(p.id)}</code></p>
    <div class="badges">${badges.join("")}</div>
    <dl>
      ${row("Claim", esc(p.claim))}
      ${row("Stance rationale", esc(p.stance_rationale))}
      ${row("Scoring passes", p.stance_passes ? `A (claim) ${sign(p.stance_passes[0])} · B (evidence) ${sign(p.stance_passes[1])} → stance ${sign(p.stance)}` : "")}
      ${p.blind_pass ? row("Blind pass", `${sign(p.blind_pass.stance)} · ${esc(p.blind_pass.evidence_strength)} · conf ${p.blind_pass.judge_confidence.toFixed(2)}${p.blind_pass.stance !== p.stance ? " <strong>(differs)</strong>" : ""}<br><span class="muted">${esc(p.blind_pass.rationale)}</span>`) : ""}
      ${p.human_override ? row("Override note", esc(p.human_override.note || "")) : ""}
      ${row("Evidence strength", esc(p.evidence_strength))}
      ${row("Judge confidence", p.judge_confidence.toFixed(2))}
      ${row("Setup", esc(p.setup))}
      ${row("Key result", esc(p.key_result))}
      ${row("Models tested", p.models_tested.length ? `<div class="chips">${p.models_tested.map((m) => `<span class="chip">${esc(m)}</span>`).join("")}</div>` : "—")}
      ${row("Model families", esc(fams.join(", ")) + (fams.length > 1 ? ` (colour: ${esc(p._family.name)})` : ""))}
      ${row("Caveats", list(p.caveats.map((c) => `<li>${esc(c)}</li>`)))}
      ${row("Code available", p.code_available ? "Yes" : "No / not found")}
      ${row("Relations", list(rels))}
      ${row("Cited by (in dataset)", list(incoming))}
      ${row("Link", `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url)}</a>`)}
    </dl>`;
  el.querySelectorAll(".rel-link").forEach((b) =>
    b.addEventListener("click", () => {
      const t = state.byId.get(b.dataset.id);
      if (t.question_id !== state.q) selectQuestion(t.question_id, t.id);
      else selectPaper(t.id);
    }));
}

const sign = (v) => (v > 0 ? "+" : "") + v;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
