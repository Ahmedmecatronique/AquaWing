#!/usr/bin/env python3
"""
Automatic download and preparation of swimmer/drowning training datasets.

Run from project root:
    python ia_prediction/training/download_dataset.py
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Callable, List, Tuple

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_SCRIPT_DIR = Path(__file__).resolve().parent
_IA_PRED_ROOT = _SCRIPT_DIR.parent
_PROJECT_ROOT = _IA_PRED_ROOT.parent

_RAW_DIR = _IA_PRED_ROOT / "training" / "data" / "raw"
_PROCESSED_DIR = _IA_PRED_ROOT / "training" / "data" / "processed"
_MODELS_DIR = _IA_PRED_ROOT / "models"

_SEADRONESSEE_DIR = _RAW_DIR / "SeaDronesSee"
_AFO_DIR = _RAW_DIR / "AFO"
_MOBDRONE_DIR = _RAW_DIR / "MOBDrone"
_YOLO_WEIGHTS_DST = _MODELS_DIR / "yolov8n.pt"

_STATUS: List[Tuple[str, bool, str]] = []


def _install_packages() -> None:
    packages = ["requests", "tqdm", "gdown", "gitpython", "roboflow", "ultralytics"]
    for pkg in packages:
        try:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", pkg, "-q"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except subprocess.CalledProcessError:
            print(f"WARNING: could not install {pkg}")


def _ensure_dirs() -> None:
    _RAW_DIR.mkdir(parents=True, exist_ok=True)
    _PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    _MODELS_DIR.mkdir(parents=True, exist_ok=True)


def _check_disk_space() -> None:
    free_gb = shutil.disk_usage("/").free / (1024**3)
    if free_gb < 3.0:
        print(f"WARNING: only {free_gb:.1f}GB free. Need at least 3GB.")
        confirm = input("Continue anyway? (y/n): ")
        if confirm.lower() != "y":
            sys.exit(0)


def _download_file(url: str, dest: Path, desc: str = "download") -> bool:
    """Download URL to dest with tqdm progress bar."""
    if dest.exists() and dest.stat().st_size > 1024:
        return True
    try:
        import requests
        from tqdm import tqdm

        dest.parent.mkdir(parents=True, exist_ok=True)
        resp = requests.get(url, stream=True, timeout=120)
        resp.raise_for_status()
        total = int(resp.headers.get("content-length", 0))
        with open(dest, "wb") as f, tqdm(
            total=total or None,
            unit="B",
            unit_scale=True,
            desc=desc,
        ) as bar:
            for chunk in resp.iter_content(chunk_size=65536):
                if chunk:
                    f.write(chunk)
                    bar.update(len(chunk))
        return dest.exists() and dest.stat().st_size > 0
    except Exception as exc:
        print(f"WARNING: download failed for {url}: {exc}")
        return False


def _extract_zip(zip_path: Path, dest_dir: Path) -> bool:
    if not zip_path.exists():
        return False
    try:
        from tqdm import tqdm

        dest_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path, "r") as zf:
            members = zf.namelist()
            for member in tqdm(members, desc=f"Extract {zip_path.name}"):
                zf.extract(member, dest_dir)
        zip_path.unlink(missing_ok=True)
        return True
    except Exception as exc:
        print(f"WARNING: extract failed {zip_path}: {exc}")
        return False


def _download_seadronessee() -> bool:
    repo_url = "https://github.com/Ben93kie/SeaDronesSee.git"
    try:
        if _SEADRONESSEE_DIR.exists() and (_SEADRONESSEE_DIR / ".git").exists():
            import git

            repo = git.Repo(_SEADRONESSEE_DIR)
            repo.remotes.origin.pull()
            print("SeaDronesSee: git pull OK")
            return True
        import git

        git.Repo.clone_from(repo_url, _SEADRONESSEE_DIR, depth=1)
        print("SeaDronesSee: cloned OK")
        return True
    except Exception as exc:
        print(f"WARNING: SeaDronesSee git failed ({exc}); trying zip fallback")
        zip_url = "https://github.com/Ben93kie/SeaDronesSee/archive/refs/heads/main.zip"
        zip_path = _RAW_DIR / "SeaDronesSee.zip"
        if _download_file(zip_url, zip_path, "SeaDronesSee zip"):
            ok = _extract_zip(zip_path, _RAW_DIR)
            extracted = _RAW_DIR / "SeaDronesSee-main"
            if extracted.exists() and not _SEADRONESSEE_DIR.exists():
                extracted.rename(_SEADRONESSEE_DIR)
            return ok
        return False


def _download_afo() -> bool:
    if _AFO_DIR.exists() and any(_AFO_DIR.iterdir()):
        print("AFO: already present, skipping")
        return True
    try:
        from roboflow import Roboflow

        rf = Roboflow(api_key="YOUR_PUBLIC_KEY")
        project = rf.workspace("public").project("afo-aerial-footage-open-water")
        dataset = project.version(1).download("yolov8", location=str(_AFO_DIR))
        print(f"AFO: Roboflow download OK -> {dataset.location}")
        return True
    except Exception as exc:
        print(f"WARNING: Roboflow AFO failed ({exc}); using zip fallback")
        url = "https://github.com/ahmedriadmr/AFO-Dataset/archive/refs/heads/main.zip"
        zip_path = _RAW_DIR / "AFO.zip"
        if not _download_file(url, zip_path, "AFO zip"):
            return False
        ok = _extract_zip(zip_path, _RAW_DIR)
        extracted = _RAW_DIR / "AFO-Dataset-main"
        if extracted.exists() and not _AFO_DIR.exists():
            extracted.rename(_AFO_DIR)
        return ok


def _download_mobdrone() -> bool:
    if _MOBDRONE_DIR.exists() and any(_MOBDRONE_DIR.iterdir()):
        print("MOBDrone: already present, skipping")
        return True
    url = "https://github.com/ARSControl/MoBDrone/archive/refs/heads/main.zip"
    zip_path = _RAW_DIR / "MOBDrone.zip"
    if not _download_file(url, zip_path, "MOBDrone zip"):
        return False
    ok = _extract_zip(zip_path, _RAW_DIR)
    extracted = _RAW_DIR / "MoBDrone-main"
    if extracted.exists() and not _MOBDRONE_DIR.exists():
        extracted.rename(_MOBDRONE_DIR)
    return ok


def _download_yolo_weights() -> bool:
    try:
        if _YOLO_WEIGHTS_DST.exists() and _YOLO_WEIGHTS_DST.stat().st_size > 1_000_000:
            print("YOLOv8n.pt: already at destination")
            return True
        from ultralytics import YOLO

        model = YOLO("yolov8n.pt")
        src = Path(getattr(model, "ckpt_path", None) or "yolov8n.pt")
        if not src.is_absolute():
            src = Path.cwd() / src
        if not src.exists():
            candidates = list(Path.cwd().rglob("yolov8n.pt"))
            src = candidates[0] if candidates else src
        if src.exists():
            shutil.copy2(src, _YOLO_WEIGHTS_DST)
            print(f"YOLOv8n.pt: copied to {_YOLO_WEIGHTS_DST}")
            return True
        print("WARNING: yolov8n.pt not found after ultralytics download")
        return False
    except Exception as exc:
        print(f"WARNING: YOLO weights download failed: {exc}")
        return False


def _run_step(name: str, fn: Callable[[], bool]) -> None:
    try:
        ok = fn()
        _STATUS.append((name, ok, "OK" if ok else "FAILED"))
    except Exception as exc:
        print(f"WARNING: {name} crashed: {exc}")
        _STATUS.append((name, False, str(exc)))


def _prepare_sequences() -> Tuple[int, int, int]:
    if str(_PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(_PROJECT_ROOT))
    from ia_prediction.training.seadronessee_loader import prepare_sequences

    prepare_sequences(data_dir=str(_RAW_DIR))
    labels_path = _IA_PRED_ROOT / "training" / "data" / "processed" / "labels.npy"
    if not labels_path.exists():
        return 0, 0, 0
    import numpy as np

    labels = np.load(labels_path)
    pos = int(labels.sum())
    neg = int(len(labels) - pos)
    return len(labels), pos, neg


def main() -> None:
    print("=" * 50)
    print("ia_prediction — automatic dataset download")
    print("=" * 50)

    _install_packages()
    _ensure_dirs()
    _check_disk_space()

    _run_step("SeaDronesSee", _download_seadronessee)
    _run_step("AFO", _download_afo)
    _run_step("MOBDrone", _download_mobdrone)
    _run_step("YOLOv8n weights", _download_yolo_weights)

    n, pos, neg = 0, 0, 0
    try:
        n, pos, neg = _prepare_sequences()
    except Exception as exc:
        print(f"WARNING: prepare_sequences failed: {exc}")

    print("\nDataset status:")
    for name, ok, msg in _STATUS:
        mark = "✓" if ok else "✗"
        print(f"  {mark} {name}: {msg}")

    print("=" * 50)
    print("Dataset download complete.")
    print(f"  SeaDronesSee : {_SEADRONESSEE_DIR}/")
    print(f"  AFO          : {_AFO_DIR}/")
    print(f"  MOBDrone     : {_MOBDRONE_DIR}/")
    print(f"  Sequences    : {n} sequences ready for training")
    print(f"  Labels       : {pos} drowning risk / {neg} safe")
    print("")
    print("Next step: python ia_prediction/training/train_lstm.py")
    print("=" * 50)


if __name__ == "__main__":
    main()
