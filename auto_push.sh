#!/bin/bash
cd "$(dirname "$0")" || exit 1

echo "📂 Checking for changes..."
git add .

if git diff --cached --quiet; then
    echo "✅ Nothing to commit."
else
    echo "📝 Committing..."
    git commit -m "auto update $(date '+%Y-%m-%d %H:%M:%S')"
fi

echo "🔄 Fetching latest changes from remote..."
git fetch origin main

# Check if local and remote have diverged
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse @{u})
BASE=$(git merge-base @ @{u})

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "✅ Local and remote are in sync."
elif [ "$LOCAL" = "$BASE" ]; then
    echo "📥 Remote is ahead, pulling changes..."
    git pull origin main --no-edit
elif [ "$REMOTE" = "$BASE" ]; then
    echo "📤 Local is ahead, ready to push."
else
    echo "⚠️  Branches have diverged. Attempting to merge..."
    git pull origin main --no-edit --no-rebase || {
        echo "❌ Merge conflict detected! Please resolve manually."
        exit 1
    }
fi

echo "🚀 Pushing to origin/main..."
git push origin main

if [ $? -eq 0 ]; then
    echo "✅ Push successful!"
else
    echo "❌ Push failed!"
    exit 1
fi
