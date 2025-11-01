import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
import json
from ..db import get_connection

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
    max_mtime = 0.0
    try:
        for entry in os.scandir(folder):
            try:
                if entry.is_file():
                    m = entry.stat().st_mtime
                    if m > max_mtime:
                        max_mtime = m
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
                continue
    except PermissionError:
        pass
    # Fallback to folder mtime if no files found
    try:
        if max_mtime == 0.0 and folder.exists():
            max_mtime = folder.stat().st_mtime
    except Exception:
        pass
    return images, gifs, videos, archives, stls, max_mtime


@router.get("/")
def list_folders(
    sort: str = Query("name", description="Tri: name|date|rating"),
    order: str = Query("asc", description="Ordre: asc|desc"),
    page: int = Query(1, ge=1, description="Numéro de page (1-based)"),
    limit: int = Query(24, ge=1, le=200, description="Taille de page"),
    q: str | None = Query(None, description="Filtre texte (nom/chemin)"),
):
    conn = get_connection()
    cur = conn.cursor()
    where = []
    params: list[object] = []
    if q:
        where.append("(LOWER(name) LIKE ? OR LOWER(path) LIKE ?)")
        like = f"%{q.lower()}%"
        params.extend([like, like])
    where_clause = (" WHERE " + " AND ".join(where)) if where else ""

    sort_map = {
        "name": "name",
        "date": "mtime",
        "rating": "rating",
    }
    s = sort_map.get((sort or "name").lower(), "name")
    o = "DESC" if (order or "asc").lower() == "desc" else "ASC"
    # For rating: ensure NULLs last regardless of order by using CASE
    if s == "rating":
        order_by = f"CASE WHEN rating IS NULL THEN 1 ELSE 0 END, rating {o}"
    else:
        order_by = f"{s} {o}"

    # Total
    cur.execute(f"SELECT COUNT(*) FROM folder_index{where_clause}", params)
    total = cur.fetchone()[0]

    # Page
    offset = (page - 1) * limit
    cur.execute(
        f"""
        SELECT name, path, rel, mtime, images, gifs, videos, archives, stls, tags, rating, thumbnail_path
        FROM folder_index
        {where_clause}
        ORDER BY {order_by}
        LIMIT ? OFFSET ?
        """,
        [*params, limit, offset],
    )
    rows = cur.fetchall()
    conn.close()
    items = []
    for r in rows:
        d = dict(r)
        # convert tags TEXT to list
        raw = d.get("tags")
        if isinstance(raw, str) and raw.strip():
            d["tags"] = [t.strip() for t in raw.split(",") if t.strip()]
        else:
            d["tags"] = []
        d["counts"] = {
            "images": d.pop("images"),
            "gifs": d.pop("gifs"),
            "videos": d.pop("videos"),
            "archives": d.pop("archives"),
            "stls": d.pop("stls"),
        }
        items.append(d)
    return {"items": items, "total": total}


def _build_folder_record(fpath: Path):
    images, gifs, videos, archives, stls, folder_mtime = count_media(fpath)
    # metadata
    meta_path = fpath / ".stl_collect.json"
    tags_list = []
    rating = None
    thumbnail_name = None
    thumbnail_path = None
    if meta_path.exists() and meta_path.is_file():
        try:
            with open(meta_path, "r", encoding="utf-8") as fh:
                meta = json.load(fh)
            raw_tags = meta.get("tags")
            if isinstance(raw_tags, list):
                tags_list = [str(t) for t in raw_tags]
            elif isinstance(raw_tags, str):
                tags_list = [t.strip() for t in raw_tags.split(",") if t.strip()]
            rating = meta.get("rating") if meta.get("rating") is not None else meta.get("note")
            try:
                if rating is not None:
                    rating = int(rating)
            except Exception:
                rating = None
            thumbnail_name = (
                meta.get("thumbnail") or meta.get("cover") or meta.get("image") or meta.get("preview")
            )
            if isinstance(thumbnail_name, str):
                candidate = fpath / thumbnail_name
                if candidate.exists() and candidate.is_file():
                    thumbnail_path = str(candidate)
        except Exception:
            pass
    if thumbnail_path is None:
        try:
            for e in os.scandir(fpath):
                if e.is_file() and Path(e.name).suffix.lower() in IMAGE_EXT:
                    thumbnail_path = str(Path(e.path))
                    break
        except PermissionError:
            pass
    tags_text = ",".join(tags_list) if tags_list else None
    return {
        "path": str(fpath),
        "name": fpath.name,
        "rel": fpath.name,
        "mtime": folder_mtime,
        "images": images,
        "gifs": gifs,
        "videos": videos,
        "archives": archives,
        "stls": stls,
        "tags": tags_text,
        "rating": rating,
        "thumbnail_path": thumbnail_path,
    }


@router.post("/reindex")
def reindex_folders():
    root = os.getenv("COLLECTION_ROOT")
    if not root:
        raise HTTPException(status_code=400, detail="COLLECTION_ROOT non défini")
    root_path = Path(root)
    if not root_path.exists() or not root_path.is_dir():
        raise HTTPException(status_code=400, detail="COLLECTION_ROOT introuvable")

    conn = get_connection()
    cur = conn.cursor()
    # Clear existing index
    cur.execute("DELETE FROM folder_index")
    added = 0
    try:
        for entry in os.scandir(root_path):
            if not entry.is_dir():
                continue
            if entry.name.startswith('.'):
                continue
            fpath = Path(entry.path)
            rec = _build_folder_record(fpath)
            cur.execute(
                """
                INSERT OR REPLACE INTO folder_index
                (path, name, rel, mtime, images, gifs, videos, archives, stls, tags, rating, thumbnail_path)
                VALUES (:path, :name, :rel, :mtime, :images, :gifs, :videos, :archives, :stls, :tags, :rating, :thumbnail_path)
                """,
                rec,
            )
            added += 1
    except PermissionError:
        pass
    conn.commit()
    conn.close()
    return {"indexed": added}


@router.post("/reindex-incremental")
def reindex_folders_incremental():
    root = os.getenv("COLLECTION_ROOT")
    if not root:
        raise HTTPException(status_code=400, detail="COLLECTION_ROOT non défini")
    root_path = Path(root)
    if not root_path.exists() or not root_path.is_dir():
        raise HTTPException(status_code=400, detail="COLLECTION_ROOT introuvable")

    conn = get_connection()
    cur = conn.cursor()

    # Load current index (path -> mtime)
    cur.execute("SELECT path, mtime FROM folder_index")
    existing = {row[0]: row[1] for row in cur.fetchall()}

    seen_paths: set[str] = set()
    added = 0
    updated = 0
    skipped = 0

    try:
        for entry in os.scandir(root_path):
            if not entry.is_dir():
                continue
            if entry.name.startswith('.'):
                continue
            fpath = str(Path(entry.path))
            rec = _build_folder_record(Path(entry.path))
            seen_paths.add(fpath)
            prev_mtime = existing.get(fpath)
            # If unchanged mtime, skip (fast path)
            if prev_mtime is not None and isinstance(prev_mtime, (int, float)) and abs(float(prev_mtime) - float(rec["mtime"])) < 1e-6:
                skipped += 1
                continue

            cur.execute(
                """
                INSERT OR REPLACE INTO folder_index
                (path, name, rel, mtime, images, gifs, videos, archives, stls, tags, rating, thumbnail_path)
                VALUES (:path, :name, :rel, :mtime, :images, :gifs, :videos, :archives, :stls, :tags, :rating, :thumbnail_path)
                """,
                rec,
            )
            if prev_mtime is None:
                added += 1
            else:
                updated += 1
    except PermissionError:
        pass

    # Delete removed folders
    to_remove = [p for p in existing.keys() if p not in seen_paths]
    removed = 0
    if to_remove:
        cur.executemany("DELETE FROM folder_index WHERE path = ?", [(p,) for p in to_remove])
        removed = len(to_remove)

    conn.commit()
    conn.close()
    return {"added": added, "updated": updated, "removed": removed, "skipped": skipped}


def _split_tags_csv(s: str | None) -> list[str]:
    if not s:
        return []
    return [t.strip() for t in s.split(',') if t and t.strip()]


@router.get("/tags")
def get_all_tags(q: str | None = Query(None, description="Filtre de préfixe/contient"), limit: int = Query(200, ge=1, le=5000)):
    conn = get_connection()
    cur = conn.cursor()
    if q:
        cur.execute("SELECT name FROM tag_catalog WHERE LOWER(name) LIKE ? ORDER BY name ASC LIMIT ?", (f"%{q.lower()}%", limit))
    else:
        cur.execute("SELECT name FROM tag_catalog ORDER BY name ASC LIMIT ?", (limit,))
    tags = [r[0] for r in cur.fetchall()]
    conn.close()
    return {"tags": tags, "total": len(tags)}


@router.post("/tags/reindex")
def tags_reindex_full():
    conn = get_connection()
    cur = conn.cursor()
    # Clear catalog
    cur.execute("DELETE FROM tag_catalog")
    # Gather all tags from folder_index
    cur.execute("SELECT tags FROM folder_index WHERE tags IS NOT NULL AND tags != ''")
    seen: set[str] = set()
    for (csv_text,) in cur.fetchall():
        for t in _split_tags_csv(csv_text):
            if t not in seen:
                seen.add(t)
    cur.executemany("INSERT OR IGNORE INTO tag_catalog(name) VALUES(?)", [(t,) for t in seen])
    conn.commit()
    total = len(seen)
    conn.close()
    return {"indexed": total}


@router.post("/tags/reindex-incremental")
def tags_reindex_incremental():
    conn = get_connection()
    cur = conn.cursor()
    # Load existing names
    cur.execute("SELECT name FROM tag_catalog")
    existing = {row[0] for row in cur.fetchall()}
    # Scan folder_index and insert missing
    cur.execute("SELECT tags FROM folder_index WHERE tags IS NOT NULL AND tags != ''")
    added = 0
    for (csv_text,) in cur.fetchall():
        for t in _split_tags_csv(csv_text):
            if t not in existing:
                try:
                    cur.execute("INSERT OR IGNORE INTO tag_catalog(name) VALUES(?)", (t,))
                    added += 1
                    existing.add(t)
                except Exception:
                    pass
    conn.commit()
    conn.close()
    return {"added": added, "total": len(existing)}
