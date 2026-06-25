import json
from pathlib import Path

OUT = Path("/home/ahmed/drone/AquaWing/graphify-out")
OUT.mkdir(parents=True, exist_ok=True)

chunks = []

# Chunk 1
chunks.append((
    "chunk_01",
    {"nodes":[{"id":"assets_roboflow_logo_svg","label":"Roboflow Logo SVG","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia detection/rf-detr-develop/docs/assets/roboflow-logo.svg","source_location":None},{"id":"roboflow_brand","label":"Roboflow","file_type":"concept","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia detection/rf-detr-develop/docs/assets/roboflow-logo.svg","source_location":None},{"id":"rf_detr_project","label":"RF-DETR","file_type":"concept","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia detection/rf-detr-develop/docs/assets/roboflow-logo.svg","source_location":None}],"edges":[{"source":"assets_roboflow_logo_svg","target":"roboflow_brand","relation":"references","confidence":"EXTRACTED","confidence_score":1.0,"source_file":"/home/ahmed/drone/AquaWing/backend/src/ia detection/rf-detr-develop/docs/assets/roboflow-logo.svg","source_location":None,"weight":1.0},{"source":"assets_roboflow_logo_svg","target":"rf_detr_project","relation":"conceptually_related_to","confidence":"INFERRED","confidence_score":0.95,"source_file":"/home/ahmed/drone/AquaWing/backend/src/ia detection/rf-detr-develop/docs/assets/roboflow-logo.svg","source_location":None,"weight":1.0}],"hyperedges":[],"input_tokens":0,"output_tokens":0}
))

# Chunk 2
chunks.append((
    "chunk_02",
    {"nodes":[{"id":"visualize_drone_35_image","label":"drone_35.png","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/OD/visualize/drone_35.png","source_location":None},{"id":"visualize_drone_35_fully_transparent","label":"fully_transparent_image","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/OD/visualize/drone_35.png","source_location":None},{"id":"visualize_drone_35_dataset","label":"SeaDronesSee Dataset","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/OD/visualize/drone_35.png","source_location":None},{"id":"visualize_drone_35_od_task","label":"object_detection","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/OD/visualize/drone_35.png","source_location":None},{"id":"visualize_drone_35_aerial_maritime","label":"drone_aerial_maritime_scene","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/OD/visualize/drone_35.png","source_location":None},{"id":"visualize_drone_35_no_detections","label":"no_visible_detections","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/OD/visualize/drone_35.png","source_location":None}],"edges":[{"source":"visualize_drone_35_image","target":"visualize_drone_35_dataset","relation":"conceptually_related_to","confidence":"INFERRED","confidence_score":0.95,"source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/OD/visualize/drone_35.png","source_location":None,"weight":1.0},{"source":"visualize_drone_35_image","target":"visualize_drone_35_od_task","relation":"conceptually_related_to","confidence":"INFERRED","confidence_score":0.95,"source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/OD/visualize/drone_35.png","source_location":None,"weight":1.0}],"hyperedges":[],"input_tokens":0,"output_tokens":0}
))

# Helper to add remaining chunks
def add_chunk(num, data):
    chunks.append((f"chunk_{num:02d}", data))

# Chunk 3
add_chunk(3, {"nodes":[{"id":"visualize_drone_35_65_png_image","label":"drone_35_65.png","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/OD/visualize/drone_35_65.png","source_location":None},{"id":"visualize_drone_35_65_png_drone","label":"drone_35_65","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/OD/visualize/drone_35_65.png","source_location":None},{"id":"seadronessee-main_dataset","label":"SeaDronesSee","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/OD/visualize/drone_35_65.png","source_location":None},{"id":"od_task_object_detection","label":"object_detection","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/OD/visualize/drone_35_65.png","source_location":None}],"edges":[{"source":"visualize_drone_35_65_png_image","target":"seadronessee-main_dataset","relation":"references","confidence":"INFERRED","confidence_score":0.95,"source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/OD/visualize/drone_35_65.png","source_location":None,"weight":1.0}],"hyperedges":[],"input_tokens":0,"output_tokens":0})

# Chunk 4
add_chunk(4, {"nodes":[{"id":"visualize_drone_65_image","label":"drone_65.png","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/OD/visualize/drone_65.png","source_location":None}],"edges":[],"hyperedges":[],"input_tokens":0,"output_tokens":0})

# Chunk 5
add_chunk(5, {"nodes":[{"id":"seadronessee_main_cover_gif","label":"cover.gif","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/cover.gif","source_location":None},{"id":"raw_seadronessee_main","label":"SeaDronesSee-main","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/cover.gif","source_location":None},{"id":"seadronessee_dataset","label":"SeaDronesSee Dataset","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/cover.gif","source_location":None}],"edges":[{"source":"seadronessee_main_cover_gif","target":"raw_seadronessee_main","relation":"references","confidence":"EXTRACTED","confidence_score":1.0,"source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/cover.gif","source_location":None,"weight":1.0},{"source":"seadronessee_main_cover_gif","target":"seadronessee_dataset","relation":"conceptually_related_to","confidence":"INFERRED","confidence_score":0.95,"source_file":"/home/ahmed/drone/AquaWing/backend/src/ia_prediction/training/data/raw/SeaDronesSee-main/cover.gif","source_location":None,"weight":1.0}],"hyperedges":[],"input_tokens":0,"output_tokens":0},)

# Chunk 6
add_chunk(6, {"nodes":[{"id":"frontend_static_aquawing-logo_image","label":"AquaWing Logo PNG Image","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/frontend/static/aquawing-logo.png","source_location":None},{"id":"frontend_static_aquawing-logo_project","label":"AquaWing Project","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/frontend/static/aquawing-logo.png","source_location":None},{"id":"frontend_static_aquawing-logo_logo","label":"AquaWing Logo","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/frontend/static/aquawing-logo.png","source_location":None}],"edges":[{"source":"frontend_static_aquawing-logo_image","target":"frontend_static_aquawing-logo_logo","relation":"references","confidence":"EXTRACTED","confidence_score":1.0,"source_file":"/home/ahmed/drone/AquaWing/frontend/static/aquawing-logo.png","source_location":None,"weight":1.0},{"source":"frontend_static_aquawing-logo_logo","target":"frontend_static_aquawing-logo_project","relation":"references","confidence":"INFERRED","confidence_score":0.95,"source_file":"/home/ahmed/drone/AquaWing/frontend/static/aquawing-logo.png","source_location":None,"weight":1.0}],"hyperedges":[],"input_tokens":0,"output_tokens":0})

# Chunk 7
add_chunk(7, {"nodes":[{"id":"static_bg_plane_file","label":"bg_plane.jpg","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/frontend/static/bg_plane.jpg","source_location":None},{"id":"static_bg_plane_plane","label":"plane","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/frontend/static/bg_plane.jpg","source_location":None},{"id":"static_bg_plane_background_image","label":"background_image","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/frontend/static/bg_plane.jpg","source_location":None},{"id":"static_bg_plane_aquawing_frontend","label":"AquaWing Frontend","file_type":"image","source_file":"/home/ahmed/drone/AquaWing/frontend/static/bg_plane.jpg","source_location":None}],"edges":[{"source":"static_bg_plane_file","target":"static_bg_plane_aquawing_frontend","relation":"references","confidence":"EXTRACTED","confidence_score":1.0,"source_file":"/home/ahmed/drone/AquaWing/frontend/static/bg_plane.jpg","source_location":None,"weight":1.0}],"hyperedges":[],"input_tokens":0,"output_tokens":0})

# Chunks 8-13 are too large to embed inline.
# Let me use a different approach - save them as separate files

print(f"Total chunks to save: {len(chunks)}")
for name, data in chunks:
    path = OUT / f".graphify_{name}.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"Saved {name}: {len(data.get('nodes',[]))} nodes, {len(data.get('edges',[]))} edges")

print("\nDone. Ready for remaining chunks.")
