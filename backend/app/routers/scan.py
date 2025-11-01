import os
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException
from ..db import get_connection

router = APIRouter()

@router.post("/scan")
def scan_collection(force: bool = False):
    root = os.getenv("COLLECTION_ROOT")
    if not root:
        raise HTTPException(status_code=400, detail="COLLECTION_ROOT non défini")
    root_path = Path(root)
    if not root_path.exists() or not root_path.is_dir():
        raise HTTPException(status_code=400, detail="COLLECTION_ROOT introuvable")

    conn = get_connection()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()

    added = 0
    updated = 0

    for dirpath, dirnames, filenames in os.walk(root):
        for fname in filenames:
            if not fname.lower().endswith(".stl"):
                continue
            fpath = Path(dirpath) / fname
            rel = fpath.relative_to(root_path)
            name = fpath.stem
            dir_only = str(rel.parent).replace("\\", "/")

            cur.execute("SELECT id, name, dir FROM projects WHERE path = ?", (str(fpath),))
            row = cur.fetchone()
            if row:
                cur.execute(
                    "UPDATE projects SET name = ?, dir = ?, updated_at = ? WHERE id = ?",
                    (name, dir_only, now, row["id"]),
                )
                updated += 1
            else:
                cur.execute(
                    "INSERT INTO projects(path, name, dir, first_scanned_at, updated_at) VALUES(?,?,?,?,?)",
                    (str(fpath), name, dir_only, now, now),
                )
                added += 1

    conn.commit()
    conn.close()
    return {"added": added, "updated": updated}
