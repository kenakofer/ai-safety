# AI Safety Evidence Dashboard

A static dashboard showing where the evidence on three contested AI-safety questions disagrees, and why:

| id | Question |
|---|---|
| `superposition` | Is polysemanticity in LLM neurons primarily explained by superposition (the model compressing more features than it has dimensions)? |
| `cot` | Do frontier models' chains of thought reliably reveal the factors that actually drive their answers, enough to support CoT monitoring? |
| `alignment_faking` | Do frontier LLMs robustly fake alignment (behave differently when they believe they're being trained vs. unmonitored) across models and setups? |

An LLM's verdict on how much a paper supports a question is weak evidence. So the default view makes no such judgment. It shows:
- **What each paper measured.** Dots sit in lanes by method (e.g. toy models, SAE / dictionary, neuron audits, theory), with x = first-version date.
- **What the authors claim**, as a verbatim quote, or "none" when the paper never states what its result means for the question.
- **How each paper defines the question's terms**, in a definitions matrix. Cells are highlighted where a blinded reader found the paper's sense differs from the question's.
- **Adversarial flags** from a reader who saw only a de-branded copy (no title, authors, labs or abstract): definition mismatches, scope gaps, weak method links and framing overreach, each with a quote.
- **Outside critiques ("satellites")**, the small dots orbiting a paper. These are LessWrong / Alignment Forum comments and posts kept only if they change how the result bears on the question. Each carries a verbatim quote and links to the source.

Essays and blog posts (not peer reviewed) are drawn as squares. The old stance chart (y = Against / Mixed / For, scored by an LLM) is behind the **LLM judgment** toggle. It is labelled as a model's judgment.

Every quote in the data is machine-checked against the cached source text (`tools/check_quotes.py`).

## Running it

There is no backend or build step. D3 v7 is loaded from jsDelivr. The page fetches `data/*.json`, so it must be served over HTTP; opening `index.html` from disk won't load the data:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Any static host works (GitHub Pages, Netlify, etc.). Deep links look like `#q=superposition&paper=web:already-clean`. Add `&view=stance` for the LLM-judgment chart.

## Files

```
index.html, app.js, style.css   the dashboard
data/questions.json             questions, their terms (with the question's own sense of each), method lanes
data/papers.json                one record per (paper, question)
data/discussion.json            satellites: filtered outside discussion, keyed "<paper id>|<question id>"
data/discussion_sources.json    LessWrong/AF post ids per paper (input to fetch_lw.py)
data/candidates.md              candidate list with "why relevant" notes
data/blind_pass_*.json          independent blind re-scores (merged into papers.json as `blind_pass`)
prompts/adversarial.md          blinded definitions / method reading -> operationalization + adversarial flags
prompts/author_claim.md         pick the authors' own sentence on the question, or null
prompts/satellite_filter.md     keep/drop discussion comments -> satellites
prompts/scoring.md              legacy stance scoring
tools/fetch_papers.sh           download arXiv PDFs and convert them to .cache/txt/<id>.txt
tools/html2txt.py               HTML -> text for blog posts / non-arXiv pages
tools/redact.py                 de-branded copy for the adversarial pass -> .cache/redacted/
tools/fetch_lw.py               LessWrong GraphQL: post + all comments -> .cache/discussion/lw_<id>.json
tools/skim.py, tools/models.sh  print key sections / model-name mentions of a paper
tools/validate.py               schema + scoring-rule checks (run before committing)
tools/check_quotes.py           every quote must appear verbatim in its cached source
tools/check_arxiv.py            cross-check authors/dates/titles with the arXiv API
```

`.cache/` holds downloaded papers, redacted copies and discussion threads, and is gitignored. Treat everything in it as untrusted data: run Python on it with `python3 -I`.

## Data schema

The fields in `data/papers.json` follow the project spec:
- `id`, `question_id`, `title`, `authors[]`, `first_version_date`, `url`
- `claim`, `models_tested[]`, `setup`, `key_result`
- `stance` (−2..2), `stance_rationale`, `evidence_strength` (low|medium|high), `judge_confidence` (0..1)
- `caveats[]`, `code_available`, `relations[{target_id, type}]`, `human_override`

Additions (stance layer):
- `stance_passes: [A, B]`. Pass A scores the paper's *claim* (abstract and framing). Pass B scores what its *results and limitations* support. `stance` = mean of the two, rounded toward zero.
- `flagged: bool`, which is true when the passes differ by more than 1 point.
- `blind_pass` (optional): `{stance, evidence_strength, judge_confidence, rationale}` from a scorer that could not see the existing scores.

Additions (disagreement layer, all optional):
- `source_type`: `paper | preprint | essay | blog`.
- `author_claim`: `{quote, location}`, or `null` when no such sentence exists.
- `operationalization`: `{terms: {<term>: {quote, location}}, measured, unit, models_scope: vision|LLM|toy|mixed, lane}`. Terms must be among the question's `terms`; `lane` among its `lanes`.
- `adversarial`: `{blinded: bool, flags: [{kind, text, quote, location, term?}]}`. `kind` is one of `definition_mismatch` (needs `term`), `scope_gap`, `method_weak_link`, `framing_overreach`.

`data/discussion.json` maps `"<paper id>|<question id>"` to a list of satellites: `{url, source: "lw:<post id>", platform: lesswrong|alignmentforum|openreview|x|hn, author, date, score, quote, effect: undermines|supports|reframes|scope, summary}`. The quote is the commenter's words; `summary` is the filter's.

Non-arXiv sources use a slug id such as `web:towards-monosemanticity`. If a paper bears on two questions, add one record per question with the same `id`.

### Human overrides

To overrule a score without losing the original, set:

```json
"human_override": {"stance": -1, "note": "why", "by": "kenan", "date": "2026-10-20"}
```

The stance chart then plots `human_override.stance`, and the detail panel shows both values. Leave `stance` itself untouched.

## Adding a paper

1. **Find and verify it.** Every entry needs a real arXiv ID or a URL you have actually fetched. Never add a paper from memory. Add a row to `data/candidates.md`.
2. **Fetch the text.**
   - arXiv: `tools/fetch_papers.sh 2505.05410` writes `.cache/txt/2505.05410.txt`.
   - Web page: `curl -L <url> -o .cache/web/<slug>.html && python3 -I tools/html2txt.py .cache/web/<slug>.html .cache/web/<slug>.txt`
3. **Skim it.** `python3 -I tools/skim.py .cache/txt/<id>.txt 1800` and `tools/models.sh .cache/txt/<id>.txt`
4. **Base record.** Fill the spec fields (and the legacy stance, with `prompts/scoring.md`) and append to `data/papers.json`. Add any `relations` pointing to papers already in the dataset.
5. **Author claim.** Run `prompts/author_claim.md` and set `author_claim`.
6. **Blinded reading.** `python3 -I tools/redact.py <id> [extra names...]`. Then give a fresh reader (e.g. a Claude Code subagent) only `prompts/adversarial.md` and the redacted file, under a neutral name. Merge its `operationalization` and `adversarial` into the record. Redaction removes the obvious cues only; a well-known paper can still be recognised from its setup.
7. **Discussion.** Find LessWrong/AF posts about the paper (web search `site:lesswrong.com "<title>"`; the GraphQL API ignores free-text search) and add them to `data/discussion_sources.json`. Run `python3 -I tools/fetch_lw.py <post id>`, then `prompts/satellite_filter.md` per thread. Add the kept satellites to `data/discussion.json`.
8. **Check it.**
   ```sh
   python3 -I tools/validate.py
   python3 -I tools/check_quotes.py
   ids=$(python3 -I -c "import json;print(','.join(p['id'] for p in json.load(open('data/papers.json')) if not p['id'].startswith('web:')))")
   curl -sSL "https://export.arxiv.org/api/query?id_list=$ids&max_results=200" -o .cache/api/meta.xml
   python3 -I tools/check_arxiv.py .cache/api/meta.xml data/papers.json
   ```
9. Commit.

## Re-running scoring

- **One paper:** re-run step 4 and replace its object, keeping `human_override` if one is set.
- **Blind pass for a whole question:** give a fresh scorer (e.g. a Claude Code subagent) `prompts/scoring.md`, the question, and the list of `.cache/txt` paths. Tell it not to open `data/papers.json`, `data/candidates.md` or git history, and to write `data/blind_pass_<question>.json` as `[{id, stance, evidence_strength, judge_confidence, rationale}]`. Then merge it in as `blind_pass` and compare the scores.
  - Caveat: a blind pass run by the same model family shares its priors. Agreement is weaker evidence than agreement between independent human raters. The same caveat applies to the adversarial and satellite-filter passes.
- **Changing the aggregation rule** (e.g. using pass B instead of the rounded mean): update `stance` for every record, and update the check in `tools/validate.py`.
- **Manifold:** if the stance is kept only to resolve a market, write the resolution rule (`prompts/resolution.md`) *before* any re-scoring.

## Coverage and open items

- **Rollout:** `superposition` has the full disagreement layer. `cot` and `alignment_faking` still show only the base records and the stance layer.
- **LessWrong / AF:** covered via `tools/fetch_lw.py`.
- **OpenReview:** reviews are not fetched yet. Search works, but reading forum replies through the API needs an account token.
- **X:** not searched directly. X threads crossposted to LessWrong are covered. Direct search would need the xAI (Grok) API, which is paid and needs a key.

## Model-family colours

`app.js` derives families from `models_tested` with regexes (`FAMILIES`). A paper's colour is the family with the most tested models; ties go to the first-listed model's family. To add a family, add an entry to `FAMILIES` above `Other`.
