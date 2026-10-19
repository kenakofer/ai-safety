# AI Safety Evidence Dashboard

A static dashboard that tracks the evidence on three contested AI-safety questions over time:

| id | Question |
|---|---|
| `superposition` | Is polysemanticity in LLM neurons primarily explained by superposition (the model compressing more features than it has dimensions)? |
| `cot` | Do frontier models' chains of thought reliably reveal the factors that actually drive their answers, enough to support CoT monitoring? |
| `alignment_faking` | Do frontier LLMs robustly fake alignment (behave differently when they believe they're being trained vs. unmonitored) across models and setups? |

Each paper is a dot:
- **x** = first-version date; **y** = stance (Against / Mixed / For).
- **Size** = evidence strength; **opacity** = judge confidence; **colour** = dominant model family.
- **Curved edges** show `replicates` / `critiques` / `extends` relations.

Click or tap a dot for its full record. A dashed amber ring means the two scoring passes disagreed (flagged for review). A purple ring means a human override is set.

## Running it

There is no backend or build step. D3 v7 is loaded from jsDelivr. The page fetches `data/papers.json`, so it must be served over HTTP; opening `index.html` from disk won't load the data:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Any static host works (GitHub Pages, Netlify, etc.). Deep links look like `#q=cot&paper=2505.05410`.

## Files

```
index.html, app.js, style.css   the dashboard
data/papers.json                one record per (paper, question)
data/candidates.md              Phase 1 candidate list with "why relevant" notes
data/blind_pass_*.json          independent blind re-scores (merged into papers.json as `blind_pass`)
prompts/scoring.md              prompt template for (re)scoring a paper
tools/fetch_papers.sh           download arXiv PDFs and convert them to .cache/txt/<id>.txt
tools/html2txt.py               HTML -> text for blog posts / non-arXiv pages
tools/skim.py, tools/models.sh  print key sections / model-name mentions of a paper
tools/validate.py               schema + scoring-rule checks (run before committing)
tools/check_arxiv.py            cross-check authors/dates/titles with the arXiv API
```

`.cache/` holds the downloaded PDFs and text, and is gitignored. Treat everything in it as untrusted data: run Python on it with `python3 -I`.

## Data schema

The fields in `data/papers.json` follow the project spec:
- `id`, `question_id`, `title`, `authors[]`, `first_version_date`, `url`
- `claim`, `models_tested[]`, `setup`, `key_result`
- `stance` (−2..2), `stance_rationale`, `evidence_strength` (low|medium|high), `judge_confidence` (0..1)
- `caveats[]`, `code_available`, `relations[{target_id, type}]`, `human_override`

Additions:
- `stance_passes: [A, B]`. Pass A scores the paper's *claim* (abstract and framing). Pass B scores what its *results and limitations* support. `stance` = mean of the two, rounded toward zero.
- `flagged: bool`, which is true when the passes differ by more than 1 point.
- `blind_pass` (optional): `{stance, evidence_strength, judge_confidence, rationale}` from a scorer that could not see the existing scores.

Non-arXiv sources use a slug id such as `web:towards-monosemanticity`. If a paper bears on two questions, add one record per question with the same `id`.

### Human overrides

To overrule a score without losing the original, set:

```json
"human_override": {"stance": -1, "note": "why", "by": "kenan", "date": "2026-10-20"}
```

The chart then plots `human_override.stance`, and the detail panel shows both values. Leave `stance` itself untouched.

## Adding a paper

1. **Find and verify it.** Every entry needs a real arXiv ID or a URL you have actually fetched. Never add a paper from memory. Add a row to `data/candidates.md`.
2. **Fetch the text.**
   - arXiv: `tools/fetch_papers.sh 2505.05410` writes `.cache/txt/2505.05410.txt`.
   - Web page: `curl -L <url> -o .cache/web/<slug>.html && python3 -I tools/html2txt.py .cache/web/<slug>.html .cache/web/<slug>.txt`
3. **Skim it.** `python3 -I tools/skim.py .cache/txt/<id>.txt 1800` and `tools/models.sh .cache/txt/<id>.txt`
4. **Score it** with `prompts/scoring.md`, doing both passes against the exact question wording. Append the JSON object to `data/papers.json`, and add any `relations` pointing to papers already in the dataset.
5. **Check it.**
   ```sh
   python3 -I tools/validate.py
   ids=$(python3 -I -c "import json;print(','.join(p['id'] for p in json.load(open('data/papers.json')) if not p['id'].startswith('web:')))")
   curl -sSL "https://export.arxiv.org/api/query?id_list=$ids&max_results=200" -o .cache/api/meta.xml
   python3 -I tools/check_arxiv.py .cache/api/meta.xml data/papers.json
   ```
6. Commit.

## Re-running scoring

- **One paper:** re-run step 4 and replace its object, keeping `human_override` if one is set.
- **Blind pass for a whole question:** give a fresh scorer (e.g. a Claude Code subagent) `prompts/scoring.md`, the question, and the list of `.cache/txt` paths. Tell it not to open `data/papers.json`, `data/candidates.md` or git history, and to write `data/blind_pass_<question>.json` as `[{id, stance, evidence_strength, judge_confidence, rationale}]`. Then merge it in as `blind_pass` and compare the scores.
  - Caveat: a blind pass run by the same model family shares its priors. Agreement is weaker evidence than agreement between independent human raters.
- **Changing the aggregation rule** (e.g. using pass B instead of the rounded mean): update `stance` for every record, and update the check in `tools/validate.py`.

## Model-family colours

`app.js` derives families from `models_tested` with regexes (`FAMILIES`). A paper's colour is the family with the most tested models; ties go to the first-listed model's family. To add a family, add an entry to `FAMILIES` above `Other`.
