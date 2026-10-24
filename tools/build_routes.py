"""Write q/<slug>/index.html for each question in data/questions.json, from index.html.

Usage: python3 -I tools/build_routes.py [--check]
Each page is index.html plus <base href="../../"> (so styles, scripts and data load from
the site root) and the question in its <title> and description. app.js reads the slug from
the path. With --check, writes nothing and exits non-zero if any page is missing or stale.
Run it after editing index.html or the questions' slugs/text.
"""
import html, json, os, sys

check = "--check" in sys.argv
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
template = open(os.path.join(root, "index.html"), encoding="utf-8").read()
questions = json.load(open(os.path.join(root, "data/questions.json"), encoding="utf-8"))

TITLE = "<title>AI Safety Evidence Dashboard</title>"
CHARSET = '<meta charset="utf-8">'
assert template.count(TITLE) == 1 and template.count(CHARSET) == 1, "index.html head changed; update build_routes.py"

stale = []
for q in questions:
    page = template.replace(CHARSET, CHARSET + '\n  <!-- Generated from index.html by tools/build_routes.py; edit that instead. -->\n  <base href="../../">', 1)
    page = page.replace(TITLE, f"<title>{html.escape(q['tab'])} · AI Safety Evidence Dashboard</title>\n"
                        f'  <meta name="description" content="{html.escape(q["text"])}">', 1)
    path = os.path.join(root, "q", q["slug"], "index.html")
    current = open(path, encoding="utf-8").read() if os.path.exists(path) else None
    if current == page:
        continue
    stale.append(os.path.relpath(path, root))
    if not check:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, "w", encoding="utf-8").write(page)

wanted = {q["slug"] for q in questions}
extra = [d for d in os.listdir(os.path.join(root, "q")) if d not in wanted] if os.path.isdir(os.path.join(root, "q")) else []
if check:
    if stale or extra:
        sys.exit(f"stale or missing: {stale}; not a question slug: {extra}. Run python3 -I tools/build_routes.py")
    print(f"{len(questions)} question pages up to date")
else:
    print(f"wrote {stale or 'nothing'}" + (f"; remove q/{', q/'.join(extra)} by hand" if extra else ""))
