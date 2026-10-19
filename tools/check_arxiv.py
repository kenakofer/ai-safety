"""Cross-check papers.json authors/dates/titles against an arXiv API Atom response.

Usage:
  ids=$(python3 -I -c "import json;print(','.join(p['id'] for p in json.load(open('data/papers.json')) if not p['id'].startswith('web:')))")
  curl -sSL "https://export.arxiv.org/api/query?id_list=$ids&max_results=200" -o .cache/api/meta.xml
  python3 -I tools/check_arxiv.py .cache/api/meta.xml data/papers.json
"""
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET

ns = {"a": "http://www.w3.org/2005/Atom"}
api = {}
for e in ET.parse(sys.argv[1]).getroot().findall("a:entry", ns):
    i = re.sub(r"v\d+$", "", e.find("a:id", ns).text.rsplit("/", 1)[-1])
    api[i] = (
        [a.find("a:name", ns).text for a in e.findall("a:author", ns)],
        e.find("a:published", ns).text[:10],
        " ".join(e.find("a:title", ns).text.split()),
    )


def surname(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().split()[-1]


def simple(t):
    return re.sub(r"[^a-z0-9]", "", t.lower())


bad = 0
for p in json.load(open(sys.argv[2], encoding="utf-8")):
    if p["id"] not in api:
        continue
    names, date, title = api[p["id"]]
    mine = [a for a in p["authors"] if a != "et al."]
    issues = []
    if date != p["first_version_date"]:
        issues.append(f"date {p['first_version_date']} vs {date}")
    if [surname(a) for a in mine] != [surname(a) for a in names[: len(mine)]]:
        issues.append(f"authors {mine} vs {names[: len(mine) + 1]}")
    if simple(title) != simple(p["title"]):
        issues.append(f"title: {title}")
    if issues:
        bad += 1
        print(p["id"], "|", " ; ".join(issues))
print(f"checked {len(api)} arXiv entries, {bad} with issues")
