import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
import json

router = APIRouter()

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
GIF_EXT = {".gif"}
VIDEO_EXT = {".mp4", ".webm", ".mov", ".m4v"}
ARCHIVE_EXT = {".zip", ".7z", ".rar"}


def count_media(folder: Path):
    images = 0
    gifs = 0
    videos = 0
    archives = 0
    stls = 0
    try:
        for entry in os.scandir(folder):
            if not entry.is_file():
                continue
            ext = Path(entry.name).suffix.lower()
            if ext in IMAGE_EXT:
                images += 1
            elif ext in GIF_EXT:
                gifs += 1
            elif ext in VIDEO_EXT:
                videos += 1
            elif ext in ARCHIVE_EXT:
                archives += 1
            elif ext == ".stl":
                stls += 1
    except PermissionError:
        pass
    return images, gifs, videos, archives, stls


@router.get("/")
def list_folders():
    root = os.getenv("COLLECTION_ROOT")
    if not root:
        raise HTTPException(status_code=400, detail="COLLECTION_ROOT non défini")
    root_path = Path(root)
    if not root_path.exists() or not root_path.is_dir():
        raise HTTPException(status_code=400, detail="COLLECTION_ROOT introuvable")

    items = []
    try:
        for entry in os.scandir(root_path):
            # Skip non-directories and hidden folders (starting with a dot like .TS)
            if not entry.is_dir():
                continue
            if entry.name.startswith('.'):
                continue
            fpath = Path(entry.path)
            images, gifs, videos, archives, stls = count_media(fpath)

            # Optional metadata from .stl_collect.json
            meta_path = fpath / ".stl_collect.json"
            tags = []
            rating = None
            thumbnail_name = None
            thumbnail_path = None
            if meta_path.exists() and meta_path.is_file():
                try:
                    with open(meta_path, "r", encoding="utf-8") as fh:
                        meta = json.load(fh)
                    # tags can be list or comma-separated string
                    raw_tags = meta.get("tags")
                    if isinstance(raw_tags, list):
                        tags = [str(t) for t in raw_tags]
                    elif isinstance(raw_tags, str):
                        tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
                    else:
                        tags = []

                    # rating may be under different keys
                    rating = meta.get("rating")
                    if rating is None:
                        rating = meta.get("note")
                    try:
                        if rating is not None:
                            rating = int(rating)
                    except Exception:
                        rating = None

                    # thumbnail may be under different keys
                    thumbnail_name = (
                        meta.get("thumbnail")
                        or meta.get("cover")
                        or meta.get("image")
                        or meta.get("preview")
                    )
                    if isinstance(thumbnail_name, str):
                        candidate = fpath / thumbnail_name
                        if candidate.exists() and candidate.is_file():
                            thumbnail_path = str(candidate)
                except Exception:
                    # ignore malformed json
                    pass

            # Fallback: if no thumbnail from JSON, pick first image file in folder
            if thumbnail_path is None:
                try:
                    for e in os.scandir(fpath):
                        if e.is_file() and Path(e.name).suffix.lower() in IMAGE_EXT:
                            thumbnail_path = str(Path(e.path))
                            break
                except PermissionError:
                    pass

            items.append({
                "name": fpath.name,
                "path": str(fpath),
                "rel": fpath.name,
                "counts": {
                    "images": images,
                    "gifs": gifs,
                    "videos": videos,
                    "archives": archives,
                    "stls": stls,
                },
                "tags": tags,
                "rating": rating,
                "thumbnail_path": thumbnail_path,
            })
    except PermissionError:
        pass

    items.sort(key=lambda x: x["name"].lower())
    return {"items": items, "total": len(items)}
