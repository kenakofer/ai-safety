"""Make a de-branded copy of a paper for the adversarial reading pass.

Usage: python3 -I tools/redact.py <id> [extra name ...]
Reads .cache/txt/<id>.txt (or .cache/web/<slug>.{txt,md}) and writes .cache/redacted/<id>.txt with:
- everything before the first body section dropped (title, author block, affiliations, abstract,
  and for web sources the summary and byline before the first "##" heading)
- acknowledgements and references dropped (appendices after them are kept)
- the paper's own title, author surnames (from data/papers.json, plus any extra names given) and lab
  names replaced by [TITLE] / [AUTHOR] / [LAB]; emails and GitHub/HF/GitLab URLs replaced too
Model names are kept, since they are part of the method. This removes the obvious cues only; a
well-known paper can still be recognised from its setup, so treat "blinded" as best-effort.
"""
import json
import os
import re
import sys

LABS = ["Google DeepMind", "DeepMind", "Anthropic", "OpenAI", "Goodfire", "Redwood Research", "Apollo Research",
        "METR", "EleutherAI", "Transluce", "Meta AI", "FAIR", "Microsoft Research", "MATS", "UK AISI", "AISI",
        "Alignment Research Center", "Conjecture", "Timaeus", "FAR AI", "FAR.AI", "Palisade Research"]

pid = sys.argv[1]
slug = pid[4:] if pid.startswith("web:") else None
cands = [f".cache/web/{slug}.txt", f".cache/web/{slug}.md"] if slug else [f".cache/txt/{pid}.txt"]
src = next(c for c in cands if os.path.exists(c))
t = open(src, encoding="utf-8", errors="replace").read()

# Drop front matter: start at the first body heading.
if slug:
    # Skip title/byline headings that html2txt turns into "## Authors" etc.
    heads = list(re.finditer(r"^##\s+(.*)$", t, re.M))
    front = [h for h in heads if re.fullmatch(r"(?i)authors?|affiliations?|published", h.group(1).strip())]
    m = next((h for h in heads if not front or h.start() > front[-1].start()), None)
else:
    # "I NTRODUCTION" is how pdftotext renders small-caps headings.
    m = re.search(r"\n\s*(?:1\.?|I\.)\s+(?:Introduction|I ?NTRODUCTION)[^\n]{0,40}\n|\n\s*(?:Introduction|I NTRODUCTION)\s*\n", t, re.I)
    if not m:  # no intro heading: drop through the end of the abstract paragraph
        ab = re.search(r"\babstract\b", t[:8000], re.I)
        m = re.search(r"\n[ \t]*\n", t[ab.end():]) if ab else None
        if m:
            t = t[ab.end():]
t = t[m.start():] if m else t

# Drop acknowledgements and the reference list, keeping any appendix after it.
ack = re.search(r"\n\s*(?:Acknowledge?ments?|Author Contributions)\s*\n", t, re.I)
refs = re.search(r"\n\s*(?:References|Bibliography)\s*\n", t, re.I)
cut = min((x.start() for x in (ack, refs) if x), default=None)
if cut is not None:
    app = re.search(r"\n\s*(?:Appendix|A\s{1,3}[A-Z][^\n]{3,60})\s*\n", t[cut:])
    t = t[:cut] + ("\n[ACKNOWLEDGEMENTS AND REFERENCES REMOVED]\n" + t[cut + app.start():] if app else "")

# Replace the paper's own title, author names and lab names.
names, titles = list(sys.argv[2:]), set()
for p in json.load(open("data/papers.json", encoding="utf-8")):
    if p["id"] == pid:
        names += [a for a in p["authors"] if a != "et al."]
        titles |= {p["title"], p["title"].split(":")[0]}
for title in sorted(titles, key=len, reverse=True):
    t = re.sub(re.escape(title).replace(r"\ ", r"\s+"), "[TITLE]", t, flags=re.I)
surnames = {n.split()[-1] for n in names if len(n.split()[-1]) > 2} | {n for n in names}
for n in sorted(surnames, key=len, reverse=True):
    t = re.sub(rf"\b{re.escape(n)}\b", "[AUTHOR]", t)
for lab in sorted(LABS, key=len, reverse=True):
    t = re.sub(rf"\b{re.escape(lab)}\b", "[LAB]", t)
# Emails and code-host URLs carry usernames and org names.
t = re.sub(r"[\w.+-]+@[\w-]+\.[\w.-]+", "[EMAIL]", t)
t = re.sub(r"(?:https?://)?(?:www\.)?(?:github\.com|huggingface\.co|gitlab\.com)/[\w\-./]+", "[CODE URL]", t)

os.makedirs(".cache/redacted", exist_ok=True)
out = f".cache/redacted/{pid.replace(':', '_')}.txt"
open(out, "w", encoding="utf-8").write(t)
print(f"{out}: {len(t)} chars (from {src})")
