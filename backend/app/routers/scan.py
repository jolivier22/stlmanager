import os
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException
from ..db import get_connection
import json

router = APIRouter()

# Reuse same notion of media as folders router
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
GIF_EXT = {".gif"}
VIDEO_EXT = {".mp4", ".webm", ".mov", ".m4v"}
ARCHIVE_EXT = {".zip", ".7z", ".rar"}
STL_EXT = {".stl"}

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
    meta_created = 0
    meta_patched = 0

    # Pass 1: For each top-level project folder, if any media exists anywhere under it, ensure top-level meta with added_at
    try:
        for entry in os.scandir(root_path):
            if not entry.is_dir():
                continue
            if entry.name.startswith('.'):
                continue
            project_dir = Path(entry.path)
            any_media = False
            try:
                for dp, dns, fns in os.walk(project_dir):
                    for fn in fns:
                        ext = Path(fn).suffix.lower()
                        if ext in IMAGE_EXT or ext in GIF_EXT or ext in VIDEO_EXT or ext in ARCHIVE_EXT or ext in STL_EXT:
                            any_media = True
                            break
                    if any_media:
                        break
            except PermissionError:
                continue
            if any_media:
                meta_path = project_dir / ".stl_collect.json"
                try:
                    if not meta_path.exists():
                        meta = {"added_at": now}
                        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
                        meta_created += 1
                    else:
                        raw = meta_path.read_text(encoding="utf-8")
                        meta = json.loads(raw) if raw.strip() else {}
                        if not isinstance(meta, dict):
                            meta = {}
                        if not meta.get("added_at"):
                            meta["added_at"] = now
                            meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
                            meta_patched += 1
                except Exception:
                    # Non-fatal
                    pass
    except PermissionError:
        pass

    # Pass 2: Upsert top-level project folders into folder_index so they appear immediately
    try:
        for entry in os.scandir(root_path):
            if not entry.is_dir() or entry.name.startswith('.'):
                continue
            project_dir = Path(entry.path)
            # Count media recursively
            images = gifs = videos = archives = stls = 0
            latest_mtime: float | None = None
            try:
                for dp, dns, fns in os.walk(project_dir):
                    for fn in fns:
                        ext = Path(fn).suffix.lower()
                        p = Path(dp) / fn
                        if ext in IMAGE_EXT:
                            images += 1
                        elif ext in GIF_EXT:
                            gifs += 1
                        elif ext in VIDEO_EXT:
                            videos += 1
                        elif ext in ARCHIVE_EXT:
                            archives += 1
                        elif ext in STL_EXT:
                            stls += 1
                        try:
                            mt = p.stat().st_mtime
                            if isinstance(mt, (int, float)):
                                if latest_mtime is None or mt > latest_mtime:
                                    latest_mtime = mt
                        except Exception:
                            pass
            except PermissionError:
                pass

            # Read metadata
            meta_path = project_dir / ".stl_collect.json"
            tags_text = None
            rating = None
            created_at = None
            modified_at = None
            thumb_path = None
            if meta_path.exists():
                try:
                    raw = meta_path.read_text(encoding="utf-8")
                    meta = json.loads(raw) if raw.strip() else {}
                    if isinstance(meta, dict):
                        if isinstance(meta.get("tags"), list):
                            try:
                                tags_text = ",".join([str(t).strip() for t in meta.get("tags") if str(t).strip()]) or None
                            except Exception:
                                tags_text = None
                        r = meta.get("rating")
                        if isinstance(r, (int, float)):
                            rating = int(r)
                        created_at = meta.get("added_at") or None
                        modified_at = meta.get("modified_at") or None
                        # thumbnail from meta.preview_file
                        try:
                            pf = meta.get("preview_file")
                            if isinstance(pf, str) and pf.strip():
                                cand = project_dir / pf
                                if cand.exists() and cand.is_file():
                                    thumb_path = str(cand)
                        except Exception:
                            pass
                except Exception:
                    pass

            # If no explicit thumbnail from meta, pick the first image found (recursive)
            if thumb_path is None:
                try:
                    stop = False
                    for dp, dns, fns in os.walk(project_dir):
                        for fn in fns:
                            if Path(fn).suffix.lower() in IMAGE_EXT:
                                thumb_path = str(Path(dp) / fn)
                                stop = True
                                break
                        if stop:
                            break
                except Exception:
                    pass

            # Derive basics
            rel = str(project_dir.relative_to(root_path)).replace("\\", "/")
            name = project_dir.name
            mtime_val = latest_mtime if isinstance(latest_mtime, (int, float)) else project_dir.stat().st_mtime

            try:
                cur.execute(
                    """
                    INSERT INTO folder_index
                    (path, name, rel, mtime, images, gifs, videos, archives, stls, tags, rating, thumbnail_path, created_at, modified_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(path) DO UPDATE SET
                      name=excluded.name,
                      rel=excluded.rel,
                      mtime=excluded.mtime,
                      images=excluded.images,
                      gifs=excluded.gifs,
                      videos=excluded.videos,
                      archives=excluded.archives,
                      stls=excluded.stls,
                      tags=excluded.tags,
                      rating=COALESCE(folder_index.rating, excluded.rating),
                      thumbnail_path=COALESCE(excluded.thumbnail_path, folder_index.thumbnail_path),
                      created_at=COALESCE(folder_index.created_at, excluded.created_at),
                      modified_at=COALESCE(excluded.modified_at, folder_index.modified_at)
                    """,
                    (
                        str(project_dir), name, rel, float(mtime_val),
                        images, gifs, videos, archives, stls,
                        tags_text, rating, thumb_path, created_at, modified_at,
                    ),
                )
            except Exception:
                # Don't break the scan if upsert fails
                pass
        conn.commit()
    except PermissionError:
        pass

    # Pass 3: maintain legacy projects table per STL files (unchanged)
    for dirpath, dirnames, filenames in os.walk(root):
        # Ensure per-folder metadata if folder contains any media
        try:
            folder_path = Path(dirpath)
            has_media = False
            for fname in filenames:
                ext = Path(fname).suffix.lower()
                if ext in IMAGE_EXT or ext in GIF_EXT or ext in VIDEO_EXT or ext in ARCHIVE_EXT or ext in STL_EXT:
                    has_media = True
                    break
            if has_media:
                meta_path = folder_path / ".stl_collect.json"
                if not meta_path.exists():
                    meta = {"added_at": now}
                    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
                else:
                    try:
                        raw = meta_path.read_text(encoding="utf-8")
                        meta = json.loads(raw) if raw.strip() else {}
                    except Exception:
                        meta = {}
                    if not isinstance(meta, dict):
                        meta = {}
                    if not meta.get("added_at"):
                        meta["added_at"] = now
                        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass

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

                # Ensure project metadata file with added_at at first scan
                try:
                    folder_path = fpath.parent
                    meta_path = folder_path / ".stl_collect.json"
                    if not meta_path.exists():
                        meta = {"added_at": now}
                        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
                    else:
                        # Patch in added_at if missing
                        try:
                            raw = meta_path.read_text(encoding="utf-8")
                            meta = json.loads(raw) if raw.strip() else {}
                        except Exception:
                            meta = {}
                        if not isinstance(meta, dict):
                            meta = {}
                        if not meta.get("added_at"):
                            meta["added_at"] = now
                            meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
                except Exception:
                    # Non-fatal: continue scan even if metadata write fails
                    pass

    conn.commit()
    conn.close()
    return {"added": added, "updated": updated, "meta_created": meta_created, "meta_patched": meta_patched}
