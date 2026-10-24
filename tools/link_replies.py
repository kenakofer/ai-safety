"""Set `reply_to` on satellites that answer another kept satellite in the same LessWrong thread.

Usage: python3 -I tools/link_replies.py [data/discussion.json]
For each LessWrong comment satellite, walks up its parent chain in .cache/discussion/lw_<post>.json
to the nearest comment kept as a satellite under the same key. If it reaches the top of the thread,
and the post itself is kept as a satellite, it links to the post. Otherwise `reply_to` is removed:
the satellite responds to the paper. `reply_to` is the target satellite's url.
"""
import json
import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "data/discussion.json"
disc = json.load(open(path, encoding="utf-8"))
threads = {}


def thread(post):
    if post not in threads:
        data = json.load(open(f".cache/discussion/lw_{post}.json", encoding="utf-8"))
        threads[post] = {c["_id"]: c for c in data["comments"]}
    return threads[post]


linked = 0
for key, sats in disc.items():
    # (post id, comment id or None) -> url, for satellites under this key
    kept = {}
    for s in sats:
        m = re.search(r"/posts/(\w+)[^?]*(?:\?commentId=(\w+))?", s["url"])
        if s["platform"] in ("lesswrong", "alignmentforum") and m:
            kept[(m.group(1), m.group(2))] = s["url"]
    for s in sats:
        s.pop("reply_to", None)
        m = re.search(r"/posts/(\w+)[^?]*\?commentId=(\w+)", s["url"])
        if not m or (m.group(1), m.group(2)) not in kept:
            continue
        post, cid = m.groups()
        comments = thread(post)
        parent = comments[cid]["parent"]
        while parent and (post, parent) not in kept:
            parent = comments.get(parent, {}).get("parent")
        target = kept.get((post, parent))  # parent None -> the post itself, if kept
        if target and target != s["url"]:
            s["reply_to"] = target
            linked += 1
            print(f"{key}: {s['author']} -> {target}")

open(path, "w", encoding="utf-8").write(json.dumps(disc, indent=2, ensure_ascii=False) + "\n")
print(f"{linked} replies linked")
