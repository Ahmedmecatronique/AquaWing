import json, os, glob, sys
from pathlib import Path

ROOT = Path("/home/ahmed/drone/AquaWing")
OUT = ROOT / "graphify-out"

# Load AST
ast = json.loads((OUT / ".graphify_ast.json").read_text(encoding="utf-8"))

# Collect chunk files
chunk_files = sorted(glob.glob(str(OUT / ".graphify_chunk_*.json")))
print(f"Chunk files found: {len(chunk_files)}")

print("Proceeding with AST + available chunk data...")

# Build merged from AST + available chunks
all_chunks_nodes = []
all_chunks_edges = []

for cf in chunk_files:
    try:
        d = json.loads(Path(cf).read_text(encoding="utf-8"))
        all_chunks_nodes.extend(d.get("nodes", []))
        all_chunks_edges.extend(d.get("edges", []))
    except:
        pass

print(f"Available semantic data: {len(all_chunks_nodes)} nodes, {len(all_chunks_edges)} edges")

# Dedup nodes
seen = {n["id"] for n in ast["nodes"]}
for n in all_chunks_nodes:
    if n["id"] not in seen:
        seen.add(n["id"])
        ast["nodes"].append(n)

# Add edges
ast["edges"].extend(all_chunks_edges)

merged = ast
(OUT / ".graphify_extract.json").write_text(
    json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8"
)
print(f"Merged: {len(merged['nodes'])} nodes, {len(merged['edges'])} edges")

# Build
sys.path.insert(0, "/home/ahmed/.local/lib/python3.11/site-packages")
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json

detection = json.loads((OUT / ".graphify_detect.json").read_text(encoding="utf-8"))

G = build_from_json(merged, root=str(ROOT), directed=False)
if G.number_of_nodes() == 0:
    print("ERROR: Graph is empty")
    sys.exit(1)

communities = cluster(G)
cohesion = score_all(G, communities)
tokens = {"input": 0, "output": 0}
gods = god_nodes(G)
surprises = surprising_connections(G, communities)
labels = {cid: f"Community {cid}" for cid in communities}
questions = suggest_questions(G, communities, labels)

wrote = to_json(G, communities, str(OUT / "graph.json"))
if not wrote:
    print("ERROR: refused to shrink graph")
    sys.exit(1)

report = generate(G, communities, cohesion, labels, gods, surprises, detection, tokens, str(ROOT), suggested_questions=questions)
(OUT / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")

analysis = {
    "communities": {str(k): v for k, v in communities.items()},
    "cohesion": {str(k): v for k, v in cohesion.items()},
    "gods": gods,
    "surprises": surprises,
    "questions": questions,
}
(OUT / ".graphify_analysis.json").write_text(
    json.dumps(analysis, indent=2, ensure_ascii=False), encoding="utf-8"
)

# Generate HTML
os.chdir(str(ROOT))
os.system(f"{sys.executable} -m graphify export html 2>/dev/null")

# Label communities
labels_map = {str(k): f"Community {k}" for k in sorted(communities.keys())}
(OUT / ".graphify_labels.json").write_text(
    json.dumps(labels_map, ensure_ascii=False), encoding="utf-8"
)

print(f"\n=== BUILD COMPLETE ===")
print(f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities")
print(f"Outputs in {OUT}/")
print(f"  graph.json")
print(f"  GRAPH_REPORT.md")
if (OUT / "graph.html").exists():
    print(f"  graph.html")
