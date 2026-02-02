#!/bin/bash
cd "$(dirname "$0")" || exit 1
git add .
git diff --cached --quiet && exit 0
git commit -m "auto update $(date '+%Y-%m-%d %H:%M:%S')"
git push origin main
