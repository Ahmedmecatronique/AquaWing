"""Test rapide RF-DETR : une image publique → détections + image annotée."""

from pathlib import Path

import supervision as sv
from rfdetr import RFDETRNano
from rfdetr.assets.coco_classes import COCO_CLASSES


def main() -> None:
    model = RFDETRNano()
    image_url = "https://media.roboflow.com/dog.jpg"
    detections = model.predict(image_url, threshold=0.5)

    print(f"Nombre de détections: {len(detections)}")
    for xyxy, class_id in zip(detections.xyxy, detections.class_id):
        label = COCO_CLASSES[int(class_id)]
        print(f"  - {label} à {xyxy}")

    labels = [COCO_CLASSES[int(cid)] for cid in detections.class_id]
    source = detections.metadata["source_image"]
    boxed = sv.BoxAnnotator().annotate(scene=source.copy(), detections=detections)
    out = sv.LabelAnnotator().annotate(scene=boxed, detections=detections, labels=labels)

    out_path = Path("output_test_detection.jpg")
    out.save(out_path)
    print(f"Image sauvegardée: {out_path.resolve()}")


if __name__ == "__main__":
    main()