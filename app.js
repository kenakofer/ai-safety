/* AI Safety Evidence Dashboard: static D3 chart over data/papers.json. */

// Questions (text, key terms with the dashboard's working definitions, method lanes) live in data/questions.json.
let QUESTIONS = [];

const STANCE_LABELS = { "-2": "Strongly against", "-1": "Against", "0": "Mixed / orthogonal", "1": "For", "2": "Strongly for" };
const ANSWER_LABELS = { "-2": "clearly not", "-1": "probably not", "0": "unclear / doesn't say", "1": "probably yes", "2": "clearly yes" };
// Dot size = how directly the authors would say the work bears on the question.
const RELEVANCE = { central: 10, partial: 7, tangential: 4.5 };
const ISSUES_URL = "https://github.com/kenakofer/ai-safety/issues/new";
const REL_TYPES = ["replicates", "critiques", "extends"];
// Satellite effect on how the paper bears on the question, drawn as a chevron (see satAngle).
const EFFECTS = {
  weakens: { label: "weakens", legend: "weakens or narrows: points to the Unclear line" },
  supports: { label: "supports", legend: "supports: points away from it" },
  reframes: { label: "reframes", legend: "reframes: points at what it answers" },
};
const FLAG_LABELS = {
  definition_mismatch: "Definition differs",
  scope_gap: "Scope gap",
  method_weak_link: "Method weak link",
  framing_overreach: "Framing overreach",
};
const LIMITATION_LABELS = { scope: "scope", stated: "limitation" };
const isEssay = (p) => p.source_type === "essay" || p.source_type === "blog";

const effStance = (p) => (p.human_override && Number.isInteger(p.human_override.stance) ? p.human_override.stance : p.stance);
// The authors' answer: their own correction if they gave one, else the LLM's estimate of it (null if not estimated yet).
const authorAnswer = (p) => {
  const v = p.author_view, r = p.author_response;
  if (!v && !r) return null;
  return {
    stance: r && Number.isInteger(r.stance) ? r.stance : v?.stance ?? 0,
    relevance: r?.relevance || v?.relevance || "partial",
    confirmed: !!r,
  };
};
const parseDate = d3.utcParse("%Y-%m-%d");
const fmtDate = d3.utcFormat("%b %Y");

const state = { papers: [], byId: new Map(), discussion: {}, q: null, selected: null };
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
      p._key = `${p.id}|${p.question_id}`;
      state.byId.set(p.id, p);
    }
    state.papers = papers;
    buildTabs();
    applyRoute();
    window.addEventListener("popstate", applyRoute);
    window.addEventListener("hashchange", applyRoute); // an old-style #q=… link pasted into the address bar
    let t;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(render, 150);
    });
    // Capture so the matrix's own horizontal scroll also moves the stuck column headers.
    document.addEventListener("scroll", () => requestAnimationFrame(updateStuck), { capture: true, passive: true });
  })
  .catch((e) => {
    document.getElementById("chart").innerHTML =
      `<p class="muted">Could not load the data (${esc(e.message || e)}). If you opened index.html directly from disk, serve the folder instead: <code>python3 -m http.server</code>.</p>`;
  });

/* ---------- routes: <base>q/<slug>/?paper=<id> ---------- */

// The site root. Pages under q/<slug>/ set <base href="../../">, so this is the same from every page.
// A stale cached questions.json may lack slugs; fall back to the id rather than "undefined".
const slugOf = (q) => q.slug || q.id;
const BASE = new URL(".", document.baseURI).pathname;

// Reads the question from the path and the paper from ?paper=. Old #q=<id>&paper=<id> links still work.
function applyRoute() {
  const old = new URLSearchParams(location.hash.slice(1));
  const slug = location.pathname.startsWith(BASE) ? (location.pathname.slice(BASE.length).match(/^q\/([^/]+)/) || [])[1] : null;
  const q = QUESTIONS.find((x) => x.id === old.get("q")) || QUESTIONS.find((x) => slugOf(x) === slug) || QUESTIONS[0];
  routing = true;
  selectQuestion(q.id, old.get("q") ? old.get("paper") : new URLSearchParams(location.search).get("paper"));
  routing = false;
}
let routing = false;

// Switching question adds a history entry; selecting a paper, or normalising the URL on load
// (e.g. the bare site root redirects to the first question), replaces the current one.
function updateURL() {
  const q = QUESTIONS.find((x) => x.id === state.q);
  const url = `${BASE}q/${slugOf(q)}/${state.selected ? `?paper=${encodeURIComponent(state.selected).replace(/%3A/g, ":")}` : ""}`;
  if (url === location.pathname + location.search + location.hash) return;
  const sameQ = location.pathname === `${BASE}q/${slugOf(q)}/`;
  history[routing || sameQ ? "replaceState" : "pushState"](null, "", url);
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

const recordFor = (id, qid = state.q) => state.papers.find((p) => p.id === id && p.question_id === qid);

function selectQuestion(qid, paperId = null) {
  state.q = qid;
  state.selected = paperId && recordFor(paperId, qid) ? paperId : null;
  d3.selectAll("#tabs button").attr("aria-selected", (q) => q.id === qid);
  const q = QUESTIONS.find((x) => x.id === qid);
  document.getElementById("question-text").textContent = q.text;
  document.title = `${q.tab} · AI Safety Evidence Dashboard`; // as in q/<slug>/index.html
  updateURL();
  render();
}

/* ---------- chart ---------- */

function render() {
  const papers = state.papers.filter((p) => p.question_id === state.q).sort((a, b) => a._date - b._date);
  renderChart(papers);
  renderLegend(papers);
  renderMatrix(papers);
  renderDetail(state.selected ? recordFor(state.selected) : null);
  updateStuck();
}

/* ---------- stuck header ---------- */

// Once the question scrolls away, a thin fixed bar repeats it, plus one context row:
// the selected paper's title while its details are on screen, or the matrix's column names.
function updateStuck() {
  const bar = document.getElementById("stuck");
  const q = QUESTIONS.find((x) => x.id === state.q);
  const qRow = bar.querySelector(".stuck-q"), paperRow = bar.querySelector(".stuck-paper"), mRow = bar.querySelector(".stuck-matrix");
  qRow.textContent = q.text;
  qRow.title = q.text;
  const on = document.getElementById("question-text").getBoundingClientRect().bottom < 0;
  const top = qRow.offsetHeight;

  const head = document.querySelector("#detail h2"), detail = document.getElementById("detail");
  const showPaper = on && head && head.getBoundingClientRect().bottom < top && detail.getBoundingClientRect().bottom > top + 40;
  if (showPaper && paperRow.dataset.html !== head.innerHTML) {
    paperRow.innerHTML = paperRow.dataset.html = head.innerHTML;
    paperRow.querySelector("a")?.setAttribute("tabindex", "-1");
  }
  paperRow.hidden = !showPaper;

  const table = document.querySelector("#matrix table");
  const thead = table?.tHead;
  const showM = on && thead && thead.getBoundingClientRect().bottom < top && table.getBoundingClientRect().bottom > top + 60;
  if (showM) {
    const scroll = table.parentElement, r = scroll.getBoundingClientRect(), cols = mRow.firstElementChild;
    mRow.style.marginLeft = `${r.left + scroll.clientLeft}px`;
    mRow.style.width = `${scroll.clientWidth}px`;
    cols.innerHTML = [...thead.rows[0].cells].map((th) => {
      const name = th.firstChild?.textContent ?? "", def = th.querySelector(".def")?.textContent ?? "";
      return `<span style="width:${th.getBoundingClientRect().width}px"${def ? ` title="${esc(def)}"` : ""}>${esc(name)}</span>`;
    }).join("");
    cols.style.transform = `translateX(${-scroll.scrollLeft}px)`;
  }
  mRow.hidden = !showM;
  bar.classList.toggle("on", on);
  document.documentElement.style.setProperty("--stuck-h", `${on ? bar.offsetHeight : 0}px`);
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
  // Papers without an estimate yet sit on the zero line as hollow dots.
  const radius = (p) => RELEVANCE[authorAnswer(p)?.relevance || "partial"] * rScale;
  const baseY = (p) => y(authorAnswer(p)?.stance ?? 0);
  const maxShift = (y(0) - y(0.5)) * 0.85;

  // Satellites: outside critiques. Ones that weaken or support sit in the direction they pull the paper's
  // answer (above toward Yes, below toward No); the rest sit level with it. A reply continues outward from
  // the critique it answers; chains never branch, only the paper does.
  // Weakens / supports rise or sink by their pull; reframes stay level with what they answer.
  const rise = (s) => (s.effect === "weakens" || s.effect === "supports" ? s.pull || 0 : 0);
  const satR = (s) => (2.5 + Math.min(2, Math.log10((s.score || 0) + 1))) * rScale;
  const satLayout = (p, r) => {
    const d = { cx: 0, cy: 0, r };
    const sats = satellitesOf(p);
    const byUrl = new Map(sats.map((s) => [s.url, s]));
    const kids = d3.group(sats.filter((s) => byUrl.has(s.reply_to)), (s) => s.reply_to);
    const roots = sats.filter((s) => !byUrl.has(s.reply_to)).sort((a, b) => (b.score || 0) - (a.score || 0));
    const out = [];
    const lift = 30 * rScale, gap = 14 * rScale;
    for (const [pull, list] of d3.group(roots, rise)) {
      list.forEach((s, i) => {
        let prev, side;
        if (pull) {
          // A row above (toward Yes) or below (toward No) the paper.
          const off = (i - (list.length - 1) / 2) * gap;
          prev = { x: d.cx + off, y: d.cy - pull * lift };
          side = off < -1e-6 ? -1 : 1;
        } else {
          // Neutral critiques sit level with the paper, alternating right and left.
          side = i % 2 ? -1 : 1;
          prev = { x: d.cx + side * (d.r + gap * (1 + Math.floor(i / 2))), y: d.cy };
        }
        out.push({ s, ...prev, px: d.cx, py: d.cy, r: satR(s) });
        // Replies (and replies to replies) follow in date order, stepping outward from the critique they answer.
        const chain = [];
        const visit = (t) => [...(kids.get(t.url) || [])].sort((u, v) => d3.ascending(u.date, v.date))
          .forEach((c) => { chain.push(c); visit(c); });
        visit(s);
        for (const c of chain) {
          const next = { x: prev.x + side * gap, y: prev.y - rise(c) * lift * 0.6 };
          out.push({ s: c, ...next, px: prev.x, py: prev.y, r: satR(c) });
          prev = next;
        }
      });
    }
    return out;
  };

  // Place papers, nudging each one vertically (a little off its true value) until neither it nor its
  // critiques overlap anything placed already. Papers with the most critiques go first and stay put.
  const footprint = (d) => [{ x: d.cx, y: d.cy, r: d.r * 1.2 }, ...d.sats.map((o) => ({ x: d.cx + o.x, y: d.cy + o.y, r: o.r * 1.3 }))];
  const clash = (a, b) => d3.sum(a, (u) => d3.sum(b, (v) => Math.max(0, u.r + v.r + 4 - Math.hypot(u.x - v.x, u.y - v.y))));
  const placed = [];
  const order = [...papers].sort((p, q) => satellitesOf(q).length - satellitesOf(p).length || p._date - q._date);
  for (const p of order) {
    const r = radius(p);
    const d = { p, cx: x(p._date), cy: baseY(p), r, sats: satLayout(p, r) };
    const base = d.cy;
    let best = { cost: Infinity, cy: base };
    for (let k = 0; k <= 2 * Math.floor(maxShift / 3); k++) {
      d.cy = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 3;
      const fp = footprint(d);
      const cost = d3.sum(placed, (o) => clash(fp, footprint(o)));
      if (cost < best.cost) best = { cost, cy: d.cy };
      if (!cost) break;
    }
    d.cy = best.cy;
    placed.push(d);
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

  g.append("g").selectAll("line").data([-2, -1, 1, 2]).join("line")
    .attr("class", "gridline").attr("x1", 0).attr("x2", iw).attr("y1", y).attr("y2", y);
  g.append("line").attr("class", "zero-line").attr("x1", 0).attr("x2", iw).attr("y1", y(0)).attr("y2", y(0));

  const yAxis = g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y).tickValues([-2, -1, 0, 1, 2]).tickFormat((v) => (narrow ? "" : (v > 0 ? "+" : "") + v)).tickSizeOuter(0));
  yAxis.select(".domain").remove();

  const bands = [{ v: 1.5, t: "Yes" }, { v: 0, t: "Unclear" }, { v: -1.5, t: "No" }];
  g.append("g").selectAll("text").data(bands).join("text")
    .attr("class", "band-label")
    .attr("x", narrow ? -8 : -40).attr("y", (d) => y(d.v)).attr("dy", "0.35em")
    .attr("text-anchor", "end").text((d) => d.t);
  g.append("text").attr("class", "axis-title").attr("x", -margin.left).attr("y", -4)
    .text("Researchers' answers over time");

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

  const satData = placed.flatMap((d) => d.sats.map((o) =>
    ({ ...o, d, x: d.cx + o.x, y: d.cy + o.y, px: d.cx + o.px, py: d.cy + o.py })));
  const sg = g.append("g").attr("class", "satellites");
  sg.selectAll("line").data(satData).join("line").attr("class", "tether")
    .attr("x1", (o) => o.px).attr("y1", (o) => o.py).attr("x2", (o) => o.x).attr("y2", (o) => o.y);
  const sat = sg.selectAll("g").data(satData).join("g").attr("class", "sat")
    .attr("tabindex", 0).attr("role", "link")
    .attr("aria-label", (o) => `${o.s.author} on ${o.s.platform}: ${EFFECTS[o.s.effect].label}`)
    .on("click", (_, o) => window.open(o.s.url, "_blank", "noopener"))
    .on("keydown", (ev, o) => {
      if (ev.key === "Enter") window.open(o.s.url, "_blank", "noopener");
    })
    .on("mouseenter focus", (_, o) => showTip(
      `<strong>${esc(o.s.author)}</strong>${o.s.paper_author ? " (paper author)" : ""}${o.s.via ? ` via ${esc(o.s.via)}` : ""} · ${esc(o.s.platform)} · ${esc(EFFECTS[o.s.effect].label)}` +
      (o.s.pull ? ` · pulls toward ${o.s.pull > 0 ? "Yes" : "No"}` : "") +
      (o.s.reply_to ? ` · replying to ${esc(satellitesOf(o.d.p).find((t) => t.url === o.s.reply_to)?.author || "a critique")}` : "") + "<br>" +
      `“${esc(trunc(o.s.quote, 200))}”${llm(o.s.summary)}`, o.x, o.y))
    .on("mouseleave blur", () => (tip.hidden = true));
  sat.append("circle").attr("class", "sat-hit").attr("cx", (o) => o.x).attr("cy", (o) => o.y).attr("r", 7);
  sat.append("path").attr("class", (o) => `sat-mark ${o.s.effect}`)
    .attr("d", (o) => chevron(o.x, o.y, o.r * 1.3, satAngle(o)));

  // Dots: squares for papers/preprints, circles for essays/blogs (not peer reviewed)
  const dots = g.append("g").selectAll("g").data(placed, (d) => d.p.id).join("g");

  const shape = (pad) => function (d) {
    const el = d3.select(this), r = d.r + pad;
    return isEssay(d.p)
      ? el.append("circle").attr("cx", d.cx).attr("cy", d.cy).attr("r", r)
      : el.append("rect").attr("x", d.cx - r).attr("y", d.cy - r).attr("width", 2 * r).attr("height", 2 * r).attr("rx", 2);
  };
  dots.filter((d) => authorAnswer(d.p)?.confirmed).each(function (d) {
    shape(3.5).call(this, d).attr("class", "dot-confirmed");
  });
  const mark = dots.append("g").each(function (d) { shape(0).call(this, d); }).selectChildren();
  mark
    .attr("class", (d) => "dot" + (d.p.id === state.selected ? " selected" : "") + (authorAnswer(d.p) ? "" : " pending"))
    .attr("fill", "var(--dot)")
    .attr("fill-opacity", (d) => (authorAnswer(d.p) ? 0.9 : 0.15))
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", (d) => `${d.p.title}, ${answerText(d.p)}, ${satellitesOf(d.p).length} outside critiques`)
    .on("click", (_, d) => selectPaper(d.p.id))
    .on("keydown", (ev, d) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        selectPaper(d.p.id);
      }
    })
    .on("mouseenter focus", (_, d) => {
      highlightEdges(g, d.p.id);
      const a = d.p.authors;
      const who = a.length > 3 ? `${a.slice(0, 3).join(", ")} et al.` : a.join(", ");
      // Records without an author_claim yet fall back to the quote behind the answer estimate.
      const q = d.p.author_claim?.quote ?? d.p.author_view?.quote;
      showTip(`<strong>${esc(d.p.title)}</strong><br><span class="tip-muted">${esc(d.p.first_version_date)} · ${esc(who)}</span>` +
        (q ? `<br>“${esc(trunc(q, 220))}”` : ""), d.cx, d.cy);
    })
    .on("mouseleave blur", () => {
      tip.hidden = true;
      highlightEdges(g, state.selected);
    });

  highlightEdges(g, state.selected);
}

// Chevron direction: weakens points back toward the Unclear (0) line, supports points away from it,
// reframes and scope point at what the critique answers (the paper, or the critique it replies to).
// On a paper at 0, weakens points at the paper and supports away from it.
function satAngle(o) {
  const toParent = Math.atan2(o.py - o.y, o.px - o.x);
  const stance = authorAnswer(o.d.p)?.stance ?? 0;
  if (o.s.effect === "weakens") return stance ? Math.sign(stance) * Math.PI / 2 : toParent;
  if (o.s.effect === "supports") return stance ? -Math.sign(stance) * Math.PI / 2 : toParent + Math.PI;
  return toParent;
}

// A filled chevron (notched dart) pointing along angle a.
function chevron(x, y, s, a) {
  const [ux, uy, nx, ny] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)];
  const at = (f, g) => `${x + ux * s * f + nx * s * g},${y + uy * s * f + ny * s * g}`;
  return `M${at(0.6, 0)}L${at(-0.6, 0.85)}L${at(-0.15, 0)}L${at(-0.6, -0.85)}Z`;
}

function answerText(p) {
  const a = authorAnswer(p);
  if (!a) return "not yet estimated";
  return `${ANSWER_LABELS[a.stance]} (${sign(a.stance)}), ${a.relevance}${a.confirmed ? ", confirmed by an author" : ""}`;
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
  const dot = (r, fill, extra = "") =>
    `<svg width="${2 * r + 2}" height="${2 * r + 2}"><circle cx="${r + 1}" cy="${r + 1}" r="${r}" fill="${fill}" ${extra}/></svg>`;
  const square = (r, fill, extra = "") =>
    `<svg width="${2 * r + 2}" height="${2 * r + 2}"><rect x="1" y="1" width="${2 * r}" height="${2 * r}" rx="2" fill="${fill}" ${extra}/></svg>`;
  const line = (t) =>
    `<svg width="34" height="10"><path d="M2,5 L32,5" class="edge ${t}" style="opacity:1"/></svg>`;
  // Each icon shows the chevron against what it points relative to: the Unclear line, or the paper.
  const satIcon = {
    weakens: `<line x1="1" y1="12" x2="15" y2="12" class="zero-line"/><path d="${chevron(8, 6, 5, Math.PI / 2)}" class="sat-mark"/>`,
    supports: `<line x1="1" y1="12" x2="15" y2="12" class="zero-line"/><path d="${chevron(8, 6, 5, -Math.PI / 2)}" class="sat-mark"/>`,
    reframes: `<rect x="1" y="4" width="6" height="6" rx="1" fill="var(--dot)"/><path d="${chevron(13, 7, 5, Math.PI)}" class="sat-mark"/>`,
  };
  const satItem = ([k, e]) => `<span class="item"><svg width="17" height="14">${satIcon[k]}</svg>${e.legend}</span>`;

  el.innerHTML = `
    <div class="group"><span class="group-title">Source</span>
      <span class="item">${square(5, "var(--dot)")}paper / preprint</span>
      <span class="item">${dot(5, "var(--dot)")}essay / blog (not peer-reviewed)</span>
    </div>
    <div class="group"><span class="group-title">Relevance (authors')</span>
      ${Object.entries(RELEVANCE).map(([k, r]) => `<span class="item">${square(r * 0.8, "var(--dot)")}${k}</span>`).join("")}
    </div>
    <div class="group"><span class="group-title">Answer</span>
      <span class="item">${square(5, "var(--dot)", 'stroke="var(--fg)" stroke-width="2"')}confirmed by an author</span>
    </div>
    <div class="group"><span class="group-title">Outside critiques</span>
      ${Object.entries(EFFECTS).map(satItem).join("")}
      <span class="item muted">weakening / supporting critiques sit above or below the paper, toward the answer they push for; lines join replies</span>
    </div>
    <div class="group"><span class="group-title">Text</span>
      <span class="item"><span class="llm llm-sample"></span>written by a language model; quotes are the authors' or commenters' own words</span>
    </div>
    <div class="group"><span class="group-title">Relations</span>
      ${REL_TYPES.map((t) => `<span class="item">${line(t)}${t}</span>`).join("")}
    </div>`;
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
  const flagNote = (f) => `<span class="mismatch-note"><span class="flag">⚑ Differs</span>${f.text ? llm(f.text) : `<q>${esc(f.quote)}</q> <span class="loc">${esc(f.location)}</span>`}</span>`;
  el.innerHTML = `
    <h2>How each paper defines the terms</h2>
    <p class="muted">Quotes are the papers' own words (machine-checked against the source text). ⚑ marks a cell where a blinded reader found the paper's sense differs from the question's.</p>
    <div class="matrix-scroll"><table>
      <thead><tr><th>Paper</th>${terms.map((t) => `<th>${esc(t)}<span class="def">Question's sense: ${esc(q.terms[t])}</span></th>`).join("")}<th>What was measured</th></tr></thead>
      <tbody>${rows.map((p) => `
        <tr${p.id === state.selected ? ' class="selected"' : ""}>
          <th scope="row"><button class="rel-link" data-id="${esc(p.id)}">${esc(trunc(p.title, 70))}</button><span class="loc">${esc(p.first_version_date.slice(0, 4))}${isEssay(p) ? " · essay" : ""}</span></th>
          ${terms.map((t) => cell(p, t)).join("")}
          <td>${llm(p.operationalization.measured)} <span class="loc">${esc(p.operationalization.unit)} · ${esc(p.operationalization.models_scope)}</span></td>
        </tr>`).join("")}
      </tbody>
    </table></div>`;
  el.querySelectorAll(".rel-link").forEach((b) => b.addEventListener("click", () => selectPaper(b.dataset.id)));
}

/* ---------- detail panel ---------- */

function selectPaper(id) {
  state.selected = state.selected === id ? null : id;
  updateURL();
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

  const rels = (p.relations || []).map((r) => {
    const t = state.byId.get(r.target_id);
    return `<li>${esc(r.type)} → ${t ? `<button class="rel-link" data-id="${esc(t.id)}">${esc(t.title)}</button>` : esc(r.target_id)}</li>`;
  });
  const incoming = state.papers.filter((o) => (o.relations || []).some((r) => r.target_id === p.id))
    .flatMap((o) => o.relations.filter((r) => r.target_id === p.id).map((r) =>
      `<li><button class="rel-link" data-id="${esc(o.id)}">${esc(o.title)}</button> ${esc(r.type)} this</li>`));

  const row = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : "");
  const list = (xs, cls) => (xs.length ? `<ul${cls ? ` class="${cls}"` : ""}>${xs.join("")}</ul>` : "—");

  const quote = (v) => `<q>${esc(v.quote)}</q> <span class="loc">${esc(v.location)}</span>`;
  const op = p.operationalization;
  const flags = (p.adversarial?.flags || []).map((f) =>
    `<li><span class="flag-kind ${esc(f.kind)}">${esc(FLAG_LABELS[f.kind] || f.kind)}${f.term ? `: ${esc(f.term)}` : ""}</span> ${quote(f)}${llm(f.text)}</li>`);
  const lims = [...(p.limitations || [])].sort((a, b) => (a.kind === "scope" ? 0 : 1) - (b.kind === "scope" ? 0 : 1)).map((l) =>
    `<li><span class="flag-kind">${esc(LIMITATION_LABELS[l.kind] || l.kind)}</span> ${quote(l)}</li>`);
  // Each critique in a box, its replies (reply_to) nested as boxes inside it; highest karma first.
  const allSats = satellitesOf(p), urls = new Set(allSats.map((o) => o.url));
  const byKarma = (a, b) => (b.score || 0) - (a.score || 0);
  const satBox = (o) => {
    const replies = allSats.filter((r) => r.reply_to === o.url).sort(byKarma);
    return `<li class="sat-box"><span class="sat-effect ${esc(o.effect)}">${esc(EFFECTS[o.effect].label)}</span>
      <a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.author)}</a>${o.paper_author ? ` <span class="loc">(paper author)</span>` : ""}
      <span class="loc">${o.via ? `via ${esc(o.via)} · ` : ""}${esc(o.platform)} · ${esc(o.date)}${o.score != null ? ` · ${o.score} karma` : ""}</span><br>
      <q>${esc(o.quote)}</q>${llm(o.summary)}${replies.length ? `<ul class="sat-boxes">${replies.map(satBox).join("")}</ul>` : ""}</li>`;
  };
  const sats = allSats.filter((o) => !urls.has(o.reply_to)).sort(byKarma).map(satBox);

  el.innerHTML = `
    <h2><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a></h2>
    <p class="meta">${esc(p.authors.join(", "))} · first version ${esc(p.first_version_date)} · <code>${esc(p.id)}</code>${isEssay(p) ? ` · <strong>${esc(p.source_type)}, not peer-reviewed</strong>` : ""}</p>
    ${answerBlock(p)}
    <dl>
      ${row("Result", `${p.author_claim ? `<p class="claim">${quote(p.author_claim)}</p>` : ""}${llm(p.key_result)}${p.author_claim === null
        ? `<span class="muted">The authors never state an implication for this question; any link to it is the dashboard's inference.</span>` : ""}`)}
      ${row("Method", op ? `${llm(op.measured)} <span class="loc">${esc(op.unit)} · ${esc(op.models_scope)} · ${esc(op.lane)}</span>` : llm(p.setup))}
      ${op ? row("Definitions", list(Object.entries(op.terms || {}).map(([t, v]) => `<li><span class="flag-kind">${esc(t)}</span> ${v ? quote(v) : `<span class="muted">used, not defined</span>`}</li>`), "tag-list")) : ""}
      ${lims.length ? row("Scope and limitations", list(lims, "tag-list")) : ""}
      ${row(`Outside critiques (${allSats.length})`, sats.length ? `<ul class="sat-boxes">${sats.join("")}</ul>` : `<span class="muted">None kept yet.</span>`)}
      ${row("Models tested", p.models_tested.length ? `<div class="chips">${p.models_tested.map((m) => `<span class="chip">${esc(m)}</span>`).join("")}</div>` : "—")}
      ${row("Caveats", p.caveats.length ? `<div class="llm">${list(p.caveats.map((c) => `<li>${esc(c)}</li>`))}</div>` : "—")}
      ${row("Code available", p.code_available ? "Yes" : "No / not found")}
      ${row("Relations", list(rels))}
      ${row("Cited by (in dataset)", list(incoming))}
    </dl>
    <details class="judgment">
      <summary>LLM judgment: weak points and stance score</summary>
      <p class="muted">A model's own reading of the paper, as opposed to what its authors say or would say. Kept for reference; it is a judgment call.</p>
      ${flags.length ? `<dl>${row(`Possible weak points${p.adversarial.blinded ? ` <span class="loc dt-note">read blind: no title, authors or abstract</span>` : ""}`, list(flags, "tag-list"))}</dl>` : ""}
      <div class="badges">${badges.join("")}</div>
      <dl>
        ${row("Claim (paraphrase)", llm(p.claim))}
        ${row("Stance rationale", llm(p.stance_rationale))}
        ${row("Scoring passes", p.stance_passes ? `A (claim) ${sign(p.stance_passes[0])} · B (evidence) ${sign(p.stance_passes[1])} → stance ${sign(p.stance)}` : "")}
        ${p.blind_pass ? row("Blind pass", `${sign(p.blind_pass.stance)} · ${esc(p.blind_pass.evidence_strength)} · conf ${p.blind_pass.judge_confidence.toFixed(2)}${p.blind_pass.stance !== p.stance ? " <strong>(differs)</strong>" : ""}<br><span class="muted">${llm(p.blind_pass.rationale)}</span>`) : ""}
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

// The authors' answer: an author's own correction if there is one, else the LLM estimate with its supporting quote.
function answerBlock(p) {
  const v = p.author_view, r = p.author_response, a = authorAnswer(p);
  const fix = `${ISSUES_URL}?${new URLSearchParams({ title: `Author correction: ${p.id} (${p.question_id})` })}`;
  const invite = `<a href="${esc(fix)}" target="_blank" rel="noopener">${r ? "Another author?" : "Are you an author?"} Correct this</a>`;
  if (!a) return `<div class="answer pending"><p class="muted">The authors' answer has not been estimated yet. ${invite}</p></div>`;
  const head = `<span class="badge answer-badge">${sign(a.stance)} · ${esc(ANSWER_LABELS[a.stance])}</span>
    <span class="badge rel-badge">${esc(a.relevance)} relevance</span>${a.confirmed ? `
    <span class="badge confirmed">✓ ${esc(r.by)}, ${esc(r.date)}</span>` : ""}`;
  const est = v ? `${a.confirmed ? `<p class="muted">Earlier estimate: ${sign(v.stance)}, ${esc(v.relevance)}.</p>` : ""}
    <p><q>${esc(v.quote)}</q> <span class="loc">${esc(v.location)}</span></p>${llm(v.rationale)}
    ${v.framing_note ? `<p class="framing"><strong>Framing:</strong> ${llm(v.framing_note)}</p>` : ""}` : "";
  const resp = r ? `<p class="author-note"><strong>${esc(r.by)}:</strong> ${esc(r.note)}${r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener">source</a>` : ""}</p>` : "";
  return `<div class="answer">
    <div class="badges">${head}</div>${resp}${est}
    <p class="loc">${invite}</p></div>`;
}

const sign = (v) => (v > 0 ? "+" : "") + v;
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// Prose written by a language model (summaries, rationales, flags) gets an accent rule and the model's name; quotes do not.
const llm = (s) => (s ? `<span class="llm">${esc(s)}</span>` : "");

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
