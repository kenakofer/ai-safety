"""Minimal HTML -> text (stdlib only). Usage: python3 -I tools/html2txt.py in.html out.txt"""
import sys
from html.parser import HTMLParser

SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "head"}
BLOCK = {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "tr", "section", "article", "figcaption", "table"}


class P(HTMLParser):
    def __init__(self):
        super().__init__()
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip += 1
        elif tag in BLOCK:
            self.out.append("\n")
        if tag in ("h1", "h2", "h3", "h4"):
            self.out.append("## ")

    def handle_endtag(self, tag):
        if tag in SKIP and self.skip:
            self.skip -= 1
        elif tag in BLOCK:
            self.out.append("\n")

    def handle_data(self, d):
        if not self.skip:
            self.out.append(d)


p = P()
p.feed(open(sys.argv[1], encoding="utf-8", errors="replace").read())
text = "".join(p.out)
lines = [" ".join(l.split()) for l in text.splitlines()]
out, blank = [], 0
for l in lines:
    blank = blank + 1 if not l else 0
    if blank <= 1:
        out.append(l)
open(sys.argv[2], "w", encoding="utf-8").write("\n".join(out))
