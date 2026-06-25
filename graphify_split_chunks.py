import json, os
from pathlib import Path

detect = json.loads(Path("/home/ahmed/drone/AquaWing/graphify-out/.graphify_detect.json").read_text(encoding="utf-8"))
scan_root = Path(detect["scan_root"])

# Collect non-code files
images = []
docs_papers = []
for cat in ("image",):
    images.extend(detect["files"].get(cat, []))
for cat in ("document", "paper"):
    docs_papers.extend(detect["files"].get(cat, []))

# Verify files exist (some may have spaces in path)
def verify(files):
    return [f for f in files if Path(f).exists()]

images = verify(images)
docs_papers = verify(docs_papers)

print(f"Images: {len(images)}")
print(f"Docs+Papers: {len(docs_papers)}")
print()

# Each image gets its own chunk (per spec)
chunks = []
chunk_num = 1

# Image chunks (one per image)
for img in images:
    chunks.append({
        "chunk_num": chunk_num,
        "files": [img],
        "type": "image"
    })
    chunk_num += 1

# Doc/paper chunks (20-25 each)
import math
chunk_size = 22
for i in range(0, len(docs_papers), chunk_size):
    chunk_files = docs_papers[i:i+chunk_size]
    chunks.append({
        "chunk_num": chunk_num,
        "files": chunk_files,
        "type": "doc"
    })
    chunk_num += 1

# Save chunks info
out = {"total_chunks": len(chunks), "chunks": chunks}
out_path = Path("/home/ahmed/drone/AquaWing/graphify-out/.graphify_chunks.json")
out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")

print(f"Total chunks: {len(chunks)}")
for c in chunks:
    count = len(c["files"])
    total_size = sum(os.path.getsize(f) for f in c["files"] if Path(f).exists())
    sample = [str(Path(f).relative_to(scan_root)) for f in c["files"][:3]]
    print(f"  Chunk {c['chunk_num']} ({c['type']}): {count} files, {total_size/1024:.0f} KB - {sample}{'...' if count > 3 else ''}")
