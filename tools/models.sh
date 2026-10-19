#!/usr/bin/env bash
# List the most-mentioned model names in an extracted paper text (helps fill models_tested).
grep -oiE '(claude[- ][0-9a-z.]+( [a-z]+)?|gpt-?[0-9][a-z0-9.-]*|\bo[134](-mini)?\b|llama[- ]?[0-9][a-z0-9.-]*( [0-9]+b)?|qwen[0-9.]*[- ][0-9.]+b|gemma[- ]?[0-9]*[- ]?[0-9]+b|olmo[- ]?[0-9]*[- ]?[0-9]+b|deepseek[- ][a-z0-9-]+|gemini[- ][0-9.]+( [a-z]+)?|mistral[- ][a-z0-9-]+|grok[- ]?[0-9]|pythia[- ][0-9.]+[mb]|gpt-?2[- a-z]*|kimi[- ][a-z0-9.]+)' "$1" | tr 'A-Z' 'a-z' | sort | uniq -c | sort -rn | head -${2:-12}
