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

    return FileResponse(str(target))
