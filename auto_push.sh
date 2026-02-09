#!/bin/bash
cd "$(dirname "$0")" || exit 1

echo "📂 Checking for changes..."
git add .

if git diff --cached --quiet; then
    echo "✅ Nothing to push — already up to date."
    exit 0
fi

echo "📝 Committing..."
git commit -m "auto update $(date '+%Y-%m-%d %H:%M:%S')"

echo "🚀 Pushing to origin/main..."
git push origin main

if [ $? -eq 0 ]; then
    echo "✅ Push successful!"
else
    echo "❌ Push failed!"
    exit 1
fi
