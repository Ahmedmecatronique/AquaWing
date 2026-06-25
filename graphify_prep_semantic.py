import json
from pathlib import Path

detect = json.loads(Path("/home/ahmed/drone/AquaWing/graphify-out/.graphify_detect.json").read_text(encoding="utf-8"))

all_files = []
for cat in ("document", "paper", "image"):
    all_files.extend(detect["files"].get(cat, []))

print(f"Semantic extraction files count: {len(all_files)}")
print()

# Show files grouped by category
for cat in ("document", "paper", "image"):
    files = detect["files"].get(cat, [])
    print(f"\n=== {cat.upper()} ({len(files)} files) ===")
    for f in files:
        p = Path(f)
        rel = p.relative_to("/home/ahmed/drone/AquaWing") if p.is_absolute() else p
        print(f"  {rel}")

# Calculate total size
import os
total_size = sum(os.path.getsize(f) for f in all_files if os.path.exists(f))
print(f"\nTotal size: {total_size:,} bytes ({total_size/1024:.1f} KB)")
