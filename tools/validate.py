"""Validate data/papers.json and data/discussion.json against the schema and the two-pass scoring rule.

Usage: python3 -I tools/validate.py [data/papers.json] [data/discussion.json]
Checks field types/ranges, that relation targets exist, that `stance` equals the
mean of `stance_passes` rounded toward zero, and that `flagged` is true whenever
the two passes differ by more than 1 point. Also checks the optional Phase 4 fields
(author_claim, author_view, author_response, operationalization, adversarial, source_type) against data/questions.json,
and that every satellite in discussion.json is well-formed and keyed to an existing record.
Quote text itself is checked by tools/check_quotes.py. Exits non-zero on any error.
"""
import json
import math
import os
import re
import sys

QUESTIONS = {q["id"]: q for q in json.load(open("data/questions.json", encoding="utf-8"))}
STRENGTHS = {"low", "medium", "high"}
REL_TYPES = {"replicates", "critiques", "extends"}
SOURCE_TYPES = {"paper", "preprint", "essay", "blog"}
SCOPES = {"vision", "LLM", "toy", "mixed"}
FLAG_KINDS = {"definition_mismatch", "scope_gap", "method_weak_link", "framing_overreach"}
PLATFORMS = {"lesswrong", "alignmentforum", "openreview", "x", "hn"}
EFFECTS = {"weakens", "supports", "reframes"}

path = sys.argv[1] if len(sys.argv) > 1 else "data/papers.json"
disc_path = sys.argv[2] if len(sys.argv) > 2 else "data/discussion.json"
papers = json.load(open(path, encoding="utf-8"))
ids = [p.get("id") for p in papers]
errors = []


RELEVANCE = ("central", "partial", "tangential")


def err(p, msg):
    errors.append(f"{p.get('id', '?')}: {msg}")


keys = [f"{p.get('id')}|{p.get('question_id')}" for p in papers]
for dup in {k for k in keys if keys.count(k) > 1}:
    errors.append(f"duplicate record {dup}")


def is_quote(v):
    return isinstance(v, dict) and all(isinstance(v.get(f), str) and v[f].strip() for f in ("quote", "location"))

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

    # Phase 4 fields: optional, but well-formed when present.
    q = QUESTIONS.get(p.get("question_id"), {})
    if p.get("source_type") is not None and p["source_type"] not in SOURCE_TYPES:
        err(p, f"bad source_type {p['source_type']}")
    if p.get("author_claim") is not None and not is_quote(p["author_claim"]):
        err(p, "author_claim must be null or {quote, location}")
    av = p.get("author_view")
    if av is not None:
        if av.get("stance") not in (-2, -1, 0, 1, 2) or av.get("relevance") not in RELEVANCE:
            err(p, "author_view needs stance in -2..2 and relevance in " + "|".join(RELEVANCE))
        if not is_quote(av) or av.get("basis") != "estimated":
            err(p, "author_view needs quote, location and basis 'estimated'")
        for f in ("rationale", "framing_note"):
            if av.get(f) is not None and (not isinstance(av[f], str) or not av[f].strip()):
                err(p, f"author_view.{f} must be omitted or non-empty")
    ar = p.get("author_response")
    if ar is not None:
        if "stance" in ar and ar["stance"] not in (-2, -1, 0, 1, 2):
            err(p, "author_response.stance must be in -2..2")
        if "relevance" in ar and ar["relevance"] not in RELEVANCE:
            err(p, "bad author_response.relevance")
        if not ar.get("by") or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(ar.get("date"))) or "note" not in ar:
            err(p, "author_response needs by, date (YYYY-MM-DD) and note")
    op = p.get("operationalization")
    if op is not None:
        for term, v in (op.get("terms") or {}).items():
            if term not in q.get("terms", {}):
                err(p, f"operationalization term {term!r} not in question terms")
            if v is not None and not is_quote(v):
                err(p, f"operationalization.terms.{term} must be null or {{quote, location}}")
        for f in ("measured", "unit"):
            if not isinstance(op.get(f), str) or not op[f].strip():
                err(p, f"operationalization.{f} missing")
        if op.get("models_scope") not in SCOPES:
            err(p, f"bad operationalization.models_scope {op.get('models_scope')}")
        if op.get("lane") not in q.get("lanes", []):
            err(p, f"operationalization.lane {op.get('lane')!r} not in question lanes")
    adv = p.get("adversarial")
    if adv is not None:
        if not isinstance(adv.get("blinded"), bool):
            err(p, "adversarial.blinded must be bool")
        for i, f in enumerate(adv.get("flags", [])):
            if f.get("kind") not in FLAG_KINDS:
                err(p, f"adversarial.flags[{i}] bad kind {f.get('kind')}")
            if not is_quote(f) or ("text" in f and (not isinstance(f["text"], str) or not f["text"].strip())):
                err(p, f"adversarial.flags[{i}] needs quote and location; text is omitted or non-empty")
            if f.get("kind") == "definition_mismatch" and f.get("term") not in q.get("terms", {}):
                err(p, f"adversarial.flags[{i}] definition_mismatch needs a question term")

sat_count = 0
if os.path.exists(disc_path):
    for key, sats in json.load(open(disc_path, encoding="utf-8")).items():
        if key not in keys:
            errors.append(f"discussion key {key} has no matching paper record")
        for i, s in enumerate(sats):
            sat_count += 1
            where = f"discussion {key}[{i}]"
            for f in ("url", "author", "quote", "source"):
                if not isinstance(s.get(f), str) or not s[f].strip():
                    errors.append(f"{where}: missing {f}")
            for f in ("summary", "via"):
                if f in s and (not isinstance(s[f], str) or not s[f].strip()):
                    errors.append(f"{where}: {f} must be omitted or non-empty")
            if "paper_author" in s and s["paper_author"] is not True:
                errors.append(f"{where}: paper_author must be true or omitted")
            if s.get("platform") not in PLATFORMS:
                errors.append(f"{where}: bad platform {s.get('platform')}")
            if s.get("effect") not in EFFECTS:
                errors.append(f"{where}: bad effect {s.get('effect')}")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(s.get("date"))):
                errors.append(f"{where}: date must be YYYY-MM-DD")
            if s.get("score") is not None and not isinstance(s["score"], int):
                errors.append(f"{where}: score must be int or null")
            if s.get("pull") not in (-1, 0, 1):
                errors.append(f"{where}: pull must be -1, 0 or 1")
        urls = {s.get("url"): s for s in sats}
        for i, s in enumerate(sats):
            seen, cur = {s.get("url")}, s
            while "reply_to" in cur:
                cur = urls.get(cur["reply_to"])
                if cur is None:
                    errors.append(f"discussion {key}[{i}]: reply_to is not a satellite under this key")
                    break
                if cur.get("url") in seen:
                    errors.append(f"discussion {key}[{i}]: reply_to forms a cycle")
                    break
                seen.add(cur.get("url"))

counts = {q: sum(p.get("question_id") == q for p in papers) for q in sorted(QUESTIONS)}
print(f"{len(papers)} papers {counts}; {sat_count} satellites; flagged: {[p['id'] for p in papers if p.get('flagged')]}")
if errors:
    print("\n".join(errors))
    sys.exit(1)
print("OK")
