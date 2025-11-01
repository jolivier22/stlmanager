from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pathlib import Path
import os

router = APIRouter()

@router.get("/")
def get_file(path: str = Query(..., description="Absolute file path under COLLECTION_ROOT")):
    root = os.getenv("COLLECTION_ROOT")
    if not root:
        raise HTTPException(status_code=400, detail="COLLECTION_ROOT non défini")
    root_path = Path(root).resolve()

    target = Path(path).resolve()
    # Security: only allow files under COLLECTION_ROOT
    try:
        target.relative_to(root_path)
    except Exception:
        raise HTTPException(status_code=403, detail="Accès refusé")

    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    # Decide inline vs attachment based on extension
    ext = target.suffix.lower()
    image_ext = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    gif_ext = {".gif"}
    video_ext = {".mp4", ".webm", ".mov", ".m4v"}
    # Inline for media previews
    if ext in image_ext or ext in gif_ext or ext in video_ext:
        return FileResponse(str(target))
    # Force download with explicit filename for archives/others
    return FileResponse(str(target), filename=target.name, media_type="application/octet-stream")
