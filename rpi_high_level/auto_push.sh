#!/bin/bash

cd "$(dirname "$0")" || exit 1

echo "🔄 Auto Git Push started..."

git status

git add .

git commit -m "auto update $(date '+%Y-%m-%d %H:%M:%S')" || echo "ℹ️ Nothing to commit"

git push

echo "✅ Auto push finished"
