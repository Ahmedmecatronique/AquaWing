import json
from pathlib import Path
from collections import Counter

detect = json.loads(Path("/home/ahmed/drone/AquaWing/graphify-out/.graphify_detect.json").read_text(encoding="utf-8"))
scan_root = Path(detect["scan_root"])
files = []
for cat in ["code", "document", "paper", "image", "video"]:
    files.extend(detect["files"].get(cat, []))
files = [f for f in files if "graphify-out" not in f]
dirs = Counter()
for f in files:
    rel = Path(f).relative_to(scan_root)
    parts = rel.parts
    if len(parts) > 1:
        dirs[parts[0]] += 1
    else:
        dirs["(root)"] += 1
print("Top subdirectories by file count:")
for d, count in dirs.most_common(10):
    print(f"  {d}: {count} files")
print(f"\nTotal words: {detect['total_words']:,}")
print(f"Total files: {detect['total_files']}")
