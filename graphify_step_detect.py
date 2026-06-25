import json, sys
from pathlib import Path

# Ensure graphify is importable
sys.path.insert(0, str(Path.home() / ".local" / "lib" / "python3.11" / "site-packages"))

from graphify.detect import detect

path = Path("/home/ahmed/drone/AquaWing")
result = detect(path)
total = result.get("total_files", 0)
words = result.get("total_words", 0)
files = result.get("files", {})

summary = {
    "total_files": total,
    "total_words": words,
    "code": len(files.get("code", [])),
    "docs": len(files.get("document", [])),
    "papers": len(files.get("paper", [])),
    "images": len(files.get("image", [])),
    "video": len(files.get("video", [])),
}
print(json.dumps(summary, indent=2))

# Also save the full detect result
result_path = path / "graphify-out" / ".graphify_detect.json"
result_path.parent.mkdir(parents=True, exist_ok=True)
result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Saved detect result to {result_path}")

# Save python interpreter path
py_path = path / "graphify-out" / ".graphify_python"
py_path.write_text(sys.executable, encoding="utf-8")
print(f"Saved python path: {sys.executable}")
