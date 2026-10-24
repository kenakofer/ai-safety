"""Check that every quote in the dataset appears verbatim in its cached source.

Usage: python3 -I tools/check_quotes.py [data/papers.json] [data/discussion.json]
Paper quotes (author_claim, author_view, operationalization.terms, adversarial.flags) are looked up in
.cache/txt/<id>.txt or .cache/web/<slug>.{txt,md}. Satellite quotes are looked up in the
specific comment their url points at, inside .cache/discussion/<source>.json.
Matching ignores whitespace, line-break hyphenation, ligatures and curly-vs-straight quotes;
"..." in a quote splits it into pieces that must appear in order. Sources missing from the
cache are reported as skipped, not passed. Exits non-zero on any mismatch.
"""
import json
import os
import re
import sys

papers_path = sys.argv[1] if len(sys.argv) > 1 else "data/papers.json"
disc_path = sys.argv[2] if len(sys.argv) > 2 else "data/discussion.json"

TRANS = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-",
                       "−": "-", "ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", " ": " "})


def norm(s):
    s = s.translate(TRANS)
    s = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", s)  # pdftotext line-break hyphenation
    s = re.sub(r"[*_`]", "", s)  # markdown emphasis in .md sources
    return re.sub(r"\s+", " ", s).strip().lower()


def found(quote, text):
    pos = 0
    for piece in re.split(r"\s*(?:\.\.\.|…)\s*", norm(quote)):
        if not piece:
            continue
        i = text.find(piece, pos)
        if i < 0:
            return False
        pos = i + len(piece)
    return True


def paper_source(pid):
    slug = pid[4:] if pid.startswith("web:") else None
    cands = [f".cache/web/{slug}.txt", f".cache/web/{slug}.md"] if slug else [f".cache/txt/{pid}.txt"]
    for c in cands:
        if os.path.exists(c):
            return norm(open(c, encoding="utf-8", errors="replace").read())
    return None


def comment_source(sat):
    # source "lw:<post_id>" -> .cache/discussion/lw_<post_id>.json; url's commentId picks the comment
    plat, _, sid = sat.get("source", "").partition(":")
    path = f".cache/discussion/{plat}_{sid}.json"
    if not os.path.exists(path):
        return None
    d = json.load(open(path, encoding="utf-8"))
    m = re.search(r"commentId=(\w+)", sat.get("url", ""))
    if m:
        texts = [c["text"] for c in d["comments"] if c["_id"] == m.group(1)]
    else:
        texts = [d["post"]["text"]]
    return norm(texts[0]) if texts else ""


def paper_quotes(p):
    if p.get("author_claim"):
        yield "author_claim", p["author_claim"]["quote"]
    if p.get("author_view"):
        yield "author_view", p["author_view"]["quote"]
    for term, v in ((p.get("operationalization") or {}).get("terms") or {}).items():
        if v:
            yield f"terms.{term}", v["quote"]
    for i, f in enumerate((p.get("adversarial") or {}).get("flags") or []):
        if f.get("quote"):
            yield f"flags[{i}]", f["quote"]
    for i, l in enumerate(p.get("limitations") or []):
        yield f"limitations[{i}]", l["quote"]


bad, ok, skipped = [], 0, set()
for p in json.load(open(papers_path, encoding="utf-8")):
    qs = list(paper_quotes(p))
    if not qs:
        continue
    src = paper_source(p["id"])
    if src is None:
        skipped.add(p["id"])
        continue
    for where, q in qs:
        if found(q, src):
            ok += 1
        else:
            bad.append(f"{p['id']}|{p['question_id']} {where}: {q[:90]!r}")

if os.path.exists(disc_path):
    for key, sats in json.load(open(disc_path, encoding="utf-8")).items():
        for i, s in enumerate(sats):
            src = comment_source(s)
            if src is None:
                skipped.add(s.get("source", "?"))
            elif found(s["quote"], src):
                ok += 1
            else:
                bad.append(f"{key} satellite[{i}] ({s.get('author')}): {s['quote'][:90]!r}")

print(f"{ok} quotes verified; {len(bad)} not found; sources not cached: {sorted(skipped) or 'none'}")
if bad:
    print("\n".join(bad))
    sys.exit(1)
