#!/usr/bin/env python3
"""Script autonome : JPEG stdin/ fichier → détections JSON stdout (pour tests)."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from backend.src.ia_detection import get_person_detector  # noqa: E402


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: run_detect_frame.py <image.jpg>", file=sys.stderr)
        sys.exit(1)
    path = Path(sys.argv[1])
    jpeg = path.read_bytes()
    det = get_person_detector()
    results = det.detect_jpeg(jpeg, 0, 0)
    print(json.dumps({"detections": results, "stats": det.get_stats()}, indent=2))


if __name__ == "__main__":
    main()
