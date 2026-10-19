"""Validate data/papers.json against the schema and the two-pass scoring rule.

Usage: python3 -I tools/validate.py [data/papers.json]
Checks field types/ranges, that relation targets exist, that `stance` equals the
mean of `stance_passes` rounded toward zero, and that `flagged` is true whenever
the two passes differ by more than 1 point. Exits non-zero on any error.
"""
import json
import math
import re
import sys

QUESTIONS = {"superposition", "cot", "alignment_faking"}
STRENGTHS = {"low", "medium", "high"}
REL_TYPES = {"replicates", "critiques", "extends"}

path = sys.argv[1] if len(sys.argv) > 1 else "data/papers.json"
papers = json.load(open(path, encoding="utf-8"))
ids = [p.get("id") for p in papers]
errors = []


def err(p, msg):
    errors.append(f"{p.get('id', '?')}: {msg}")


for dup in {i for i in ids if ids.count(i) > 1}:
    errors.append(f"duplicate id {dup}")

for p in papers:
    for f in ("id", "title", "url", "claim", "setup", "key_result", "stance_rationale"):
        if not isinstance(p.get(f), str) or not p[f].strip():
            err(p, f"missing/empty {f}")
    if p.get("question_id") not in QUESTIONS:
        err(p, f"bad question_id {p.get('question_id')}")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(p.get("first_version_date"))):
        err(p, "first_version_date must be YYYY-MM-DD")
    for f in ("authors", "models_tested", "caveats"):
        if not isinstance(p.get(f), list) or not all(isinstance(x, str) for x in p[f]):
            err(p, f"{f} must be a list of strings")
    if p.get("evidence_strength") not in STRENGTHS:
        err(p, "bad evidence_strength")
    c = p.get("judge_confidence")
    if not isinstance(c, (int, float)) or not 0 <= c <= 1:
        err(p, "judge_confidence must be in [0, 1]")
    if not isinstance(p.get("code_available"), bool):
        err(p, "code_available must be bool")
    if "human_override" not in p:
        err(p, "human_override key missing (use null)")

    s, passes = p.get("stance"), p.get("stance_passes")
    if not (isinstance(passes, list) and len(passes) == 2 and all(isinstance(x, int) and -2 <= x <= 2 for x in passes)):
        err(p, "stance_passes must be two ints in [-2, 2]")
    else:
        expected = math.trunc(sum(passes) / 2)
        if s != expected:
            err(p, f"stance {s} != mean of passes rounded toward zero ({expected})")
        if abs(passes[0] - passes[1]) > 1 and p.get("flagged") is not True:
            err(p, "passes differ by >1 but flagged is not true")
    if not isinstance(p.get("flagged"), bool):
        err(p, "flagged must be bool")

    for r in p.get("relations", []):
        if r.get("type") not in REL_TYPES:
            err(p, f"bad relation type {r.get('type')}")
        if r.get("target_id") not in ids:
            err(p, f"relation target {r.get('target_id')} not in dataset")

counts = {q: sum(p.get("question_id") == q for p in papers) for q in sorted(QUESTIONS)}
print(f"{len(papers)} papers {counts}; flagged: {[p['id'] for p in papers if p.get('flagged')]}")
if errors:
    print("\n".join(errors))
    sys.exit(1)
print("OK")
