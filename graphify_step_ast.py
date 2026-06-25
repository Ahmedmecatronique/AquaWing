import json, sys
from pathlib import Path

detect = json.loads(Path("/home/ahmed/drone/AquaWing/graphify-out/.graphify_detect.json").read_text(encoding="utf-8"))

from graphify.extract import collect_files, extract

code_files = []
for f in detect.get("files", {}).get("code", []):
    code_files.extend(collect_files(Path(f)) if Path(f).is_dir() else [Path(f)])

print(f"AST: processing {len(code_files)} code files...")
result = extract(code_files, cache_root=Path("/home/ahmed/drone/AquaWing"))

Path("/home/ahmed/drone/AquaWing/graphify-out/.graphify_ast.json").write_text(
    json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
)
print(f"AST: {len(result['nodes'])} nodes, {len(result['edges'])} edges")
