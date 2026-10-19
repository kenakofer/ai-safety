#!/usr/bin/env bash
# Download arXiv PDFs for every arXiv ID in data/candidates.md and convert them to text.
# Output: .cache/pdf/<id>.pdf and .cache/txt/<id>.txt (both gitignored).
# Usage: tools/fetch_papers.sh [id ...]   (no args = all IDs in candidates.md)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .cache/pdf .cache/txt

if [ $# -gt 0 ]; then
  ids=("$@")
else
  mapfile -t ids < <(grep -oE 'arxiv\.org/abs/[0-9]{4}\.[0-9]{4,5}' data/candidates.md | sed 's#.*/##' | sort -u)
fi

for id in "${ids[@]}"; do
  pdf=".cache/pdf/$id.pdf" txt=".cache/txt/$id.txt"
  if [ ! -s "$pdf" ]; then
    echo "fetching $id"
    curl -sfL -A "evidence-dashboard/0.1 (research use)" "https://arxiv.org/pdf/$id" -o "$pdf" || { echo "FAILED $id"; rm -f "$pdf"; continue; }
    sleep 3  # be polite to arXiv
  fi
  [ -s "$txt" ] || pdftotext -q "$pdf" "$txt" || echo "pdftotext failed for $id"
done
echo "done: $(ls .cache/txt | wc -l) text files"
