import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
import json
from ..db import get_connection
import shutil
from datetime import datetime

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


def _created_at_from_images(folder: Path) -> str | None:
    try:
        min_ctime: float | None = None
        for entry in os.scandir(folder):
            if entry.is_file():
                ext = Path(entry.name).suffix.lower()
                if ext in IMAGE_EXT or ext in GIF_EXT:
                    try:
                        ct = entry.stat().st_ctime
                        if isinstance(ct, (int, float)):
                            if min_ctime is None or ct < min_ctime:
                                min_ctime = ct
                    except Exception:
                        continue
        if min_ctime is not None:
            return datetime.fromtimestamp(min_ctime).isoformat()
    except PermissionError:
        pass
    return None


@router.get("/")
def list_folders(
    sort: str = Query("name", description="Tri: name|date|rating|created|modified"),
    order: str = Query("asc", description="Ordre: asc|desc"),
    page: int = Query(1, ge=1, description="Numéro de page (1-based)"),
    limit: int = Query(24, ge=1, le=200, description="Taille de page"),
    q: str | None = Query(None, description="Filtre texte (nom/chemin)"),
    tags: list[str] | None = Query(None, description="Filtre par tags (cumulatif): répétez le paramètre tags= pour chaque tag"),
):
    conn = get_connection()
    cur = conn.cursor()
    # WHERE clauses: one for total (no alias), one for page query (with alias 'fi')
    params_total: list[object] = []
    params_page: list[object] = []
    where_total_parts: list[str] = []
    where_page_parts: list[str] = []
    if q:
        like = f"%{q.lower()}%"
        params_total += [like, like]
        params_page += [like, like]
        where_total_parts.append("(LOWER(name) LIKE ? OR LOWER(path) LIKE ?)" )
        where_page_parts.append("(LOWER(fi.name) LIKE ? OR LOWER(fi.path) LIKE ?)")
    # Tags filtering: require each tag to be present as whole token in CSV
    if tags:
        for t in tags:
            tv = (t or "").strip().lower()
            if not tv:
                continue
            where_total_parts.append("(tags IS NOT NULL AND instr(',' || LOWER(tags) || ',', ',' || ? || ',') > 0)")
            where_page_parts.append("(fi.tags IS NOT NULL AND instr(',' || LOWER(fi.tags) || ',', ',' || ? || ',') > 0)")
            params_total.append(tv)
            params_page.append(tv)
    where_clause_total = (" WHERE " + " AND ".join(where_total_parts)) if where_total_parts else ""
    where_clause_page = (" WHERE " + " AND ".join(where_page_parts)) if where_page_parts else ""

    sort_map = {
        "name": "name",
        "date": "mtime",
        "rating": "rating",
        "created": "created_at",
        "modified": "modified_at",
    }
    s = sort_map.get((sort or "name").lower(), "name")
    o = "DESC" if (order or "asc").lower() == "desc" else "ASC"
    # For rating: ensure NULLs last regardless of order by using CASE
    if s == "rating":
        order_by = f"CASE WHEN rating IS NULL THEN 1 ELSE 0 END, rating {o}"
    else:
        order_by = f"{s} {o}"

    # Total
    cur.execute(f"SELECT COUNT(*) FROM folder_index{where_clause_total}", params_total)
    total = cur.fetchone()[0]

    # Page
    offset = (page - 1) * limit
    cur.execute(
        f"""
        SELECT fi.name, fi.path, fi.rel, fi.mtime, fi.images, fi.gifs, fi.videos, fi.archives, fi.stls,
               fi.tags, fi.rating, fi.created_at, fi.modified_at,
               COALESCE(po.thumbnail_path, fi.thumbnail_path) AS thumbnail_path
        FROM folder_index fi
        LEFT JOIN preview_overrides po ON po.path = fi.path
        {where_clause_page}
        ORDER BY {order_by}
        LIMIT ? OFFSET ?
        """,
        [*params_page, limit, offset],
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
    created_at = None
    modified_at = None
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
                meta.get("thumbnail")
                or meta.get("cover")
                or meta.get("image")
                or meta.get("preview")
                or meta.get("preview_file")
            )
            if isinstance(thumbnail_name, str):
                candidate = fpath / thumbnail_name
                if candidate.exists() and candidate.is_file():
                    thumbnail_path = str(candidate)
            # Dates
            try:
                if isinstance(meta.get("added_at"), str) and meta.get("added_at").strip():
                    created_at = meta.get("added_at").strip()
            except Exception:
                pass
            try:
                if isinstance(meta.get("modified_at"), str) and meta.get("modified_at").strip():
                    modified_at = meta.get("modified_at").strip()
            except Exception:
                pass
        except Exception:
            pass
    # Fallback for created_at: earliest image/gif ctime, else folder ctime
    if not created_at:
        created_at = _created_at_from_images(fpath)
    if not created_at:
        try:
            created_at = datetime.fromtimestamp(fpath.stat().st_ctime).isoformat()
        except Exception:
            created_at = None
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
        "created_at": created_at,
        "modified_at": modified_at,
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
    failed = 0
    try:
        for entry in os.scandir(root_path):
            try:
                if not entry.is_dir():
                    continue
                if entry.name.startswith('.'):
                    continue
                fpath = Path(entry.path)
                rec = _build_folder_record(fpath)
                cur.execute(
                    """
                    INSERT OR REPLACE INTO folder_index
                    (path, name, rel, mtime, images, gifs, videos, archives, stls, tags, rating, thumbnail_path, created_at, modified_at)
                    VALUES (:path, :name, :rel, :mtime, :images, :gifs, :videos, :archives, :stls, :tags, :rating, :thumbnail_path, :created_at, :modified_at)
                    """,
                    rec,
                )
                added += 1
            except PermissionError:
                continue
            except Exception as e:
                # Minimal logging to diagnose problematic folders, but do not fail the whole reindex
                try:
                    print(f"[reindex] skip '{entry.path}': {e}")
                except Exception:
                    pass
                failed += 1
    except PermissionError:
        pass
    conn.commit()
    conn.close()
    return {"indexed": added, "failed": failed}


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
                (path, name, rel, mtime, images, gifs, videos, archives, stls, tags, rating, thumbnail_path, created_at, modified_at)
                VALUES (:path, :name, :rel, :mtime, :images, :gifs, :videos, :archives, :stls, :tags, :rating, :thumbnail_path, :created_at, :modified_at)
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


@router.post("/set-preview")
def set_folder_preview(
    path: str = Query(..., description="Chemin absolu du projet (dossier)"),
    filename: str = Query(..., description="Nom de fichier (relatif au dossier) à utiliser comme miniature"),
):
    folder_path = Path(path)
    if not folder_path.exists() or not folder_path.is_dir():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    target = folder_path / filename
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=400, detail="Fichier non trouvé dans le dossier")
    ext = target.suffix.lower()
    if ext not in IMAGE_EXT and ext not in GIF_EXT:
        raise HTTPException(status_code=400, detail="Le fichier doit être une image ou un GIF")

    # Écrire/mettre à jour le fichier meta
    meta_path = folder_path / ".stl_collect.json"
    meta: dict = {}
    if meta_path.exists() and meta_path.is_file():
        try:
            with open(meta_path, "r", encoding="utf-8") as fh:
                meta = json.load(fh) or {}
        except Exception:
            meta = {}
    meta["preview_file"] = filename
    # Ensure dates
    try:
        if not meta.get("added_at"):
            created = _created_at_from_images(folder_path)
            if not created:
                try:
                    created = datetime.fromtimestamp(folder_path.stat().st_ctime).isoformat()
                except Exception:
                    created = None
            meta["added_at"] = created or datetime.now().isoformat()
    except Exception:
        meta["added_at"] = datetime.now().isoformat()
    meta["modified_at"] = datetime.now().isoformat()
    try:
        with open(meta_path, "w", encoding="utf-8") as fh:
            json.dump(meta, fh, ensure_ascii=False, indent=2)
    except Exception:
        # Ignore write errors (e.g., read-only volume); we'll persist in DB overrides below
        pass

    # Mettre à jour l'index
    thumb_path = str(target)
    try:
        conn = get_connection()
        cur = conn.cursor()
        # Ensure overrides table exists (safety in case migration not applied yet)
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS preview_overrides (
                path TEXT PRIMARY KEY,
                thumbnail_path TEXT
            );
            """
        )
        # Update cache for immediate effect
        cur.execute("UPDATE folder_index SET thumbnail_path = ? WHERE path = ?", (thumb_path, path))
        # Also store user override so it persists even if JSON can't be written
        cur.execute("INSERT OR REPLACE INTO preview_overrides(path, thumbnail_path) VALUES(?, ?)", (path, thumb_path))
        conn.commit()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur mise à jour index/override: {e}")

    return {"ok": True, "thumbnail_path": thumb_path}


@router.post("/set-rating")
def set_folder_rating(
    path: str = Query(..., description="Chemin absolu du projet (dossier)"),
    rating: int = Query(..., ge=0, le=5, description="Note entière entre 0 et 5"),
):
    folder_path = Path(path)
    if not folder_path.exists() or not folder_path.is_dir():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    # Update meta JSON
    meta_path = folder_path / ".stl_collect.json"
    meta: dict = {}
    if meta_path.exists() and meta_path.is_file():
        try:
            with open(meta_path, "r", encoding="utf-8") as fh:
                meta = json.load(fh) or {}
        except Exception:
            meta = {}
    meta["rating"] = int(rating)
    # Ensure dates
    try:
        if not meta.get("added_at"):
            ctime = folder_path.stat().st_ctime
            meta["added_at"] = datetime.fromtimestamp(ctime).isoformat()
    except Exception:
        meta["added_at"] = datetime.now().isoformat()
    meta["modified_at"] = datetime.now().isoformat()
    try:
        with open(meta_path, "w", encoding="utf-8") as fh:
            json.dump(meta, fh, ensure_ascii=False, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur écriture meta: {e}")
    # Update index
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("UPDATE folder_index SET rating = ? WHERE path = ?", (int(rating), path))
        # keep tag_catalog untouched here
        conn.commit()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur mise à jour index: {e}")
    return {"ok": True, "rating": int(rating)}


@router.post("/rename")
def rename_folder(
    path: str = Query(..., description="Chemin absolu du projet (dossier) à renommer"),
    new_name: str = Query(..., description="Nouveau nom du dossier (basename uniquement)"),
):
    folder_path = Path(path)
    if not folder_path.exists() or not folder_path.is_dir():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    new_name = (new_name or "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Nouveau nom invalide")
    if any(ch in new_name for ch in ['/', '\\', ':', '*', '?', '"', '<', '>', '|']):
        raise HTTPException(status_code=400, detail="Nom contient des caractères interdits")
    new_path = folder_path.parent / new_name
    # Si un dossier homonyme existe déjà, on refuse (l'utilisateur ajoutera un suffixe v2/v3)
    if new_path.exists() and new_path.resolve() != folder_path.resolve():
        raise HTTPException(status_code=409, detail="Un dossier avec ce nom existe déjà")

    # Effectuer le renommage sur le système de fichiers
    try:
        folder_path.rename(new_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur renommage FS: {e}")

    # Mettre à jour l'index (path, rel, name) et les chemins éventuels de miniature
    root = os.getenv("COLLECTION_ROOT") or "/"
    root_path = Path(root).resolve()
    try:
        new_rel = str(Path(new_path).resolve().relative_to(root_path))
    except Exception:
        new_rel = new_name
    try:
        conn = get_connection()
        cur = conn.cursor()
        # Mettre à jour l'entrée principale
        cur.execute(
            "UPDATE folder_index SET path = ?, rel = ?, name = ? WHERE path = ?",
            (str(new_path), new_rel, new_name, str(folder_path)),
        )
        # Mettre à jour les éventuelles miniatures qui stockeraient un chemin absolu
        try:
            cur.execute(
                "UPDATE folder_index SET thumbnail_path = REPLACE(COALESCE(thumbnail_path,''), ?, ?) WHERE thumbnail_path LIKE ?",
                (str(folder_path) + os.sep, str(new_path) + os.sep, f"{str(folder_path)}%"),
            )
        except Exception:
            pass
        # Mettre à jour les overrides
        try:
            cur.execute("UPDATE preview_overrides SET path = ? WHERE path = ?", (str(new_path), str(folder_path)))
        except Exception:
            pass
        conn.commit()
        conn.close()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur mise à jour index: {e}")

    return {"ok": True, "path": str(new_path), "name": new_name, "rel": new_rel}


def _split_tags_csv(s: str | None) -> list[str]:
    if not s:
        return []
    return [t.strip() for t in s.split(',') if t and t.strip()]


def _normalize_tags(raw) -> list[str]:
    def uniq_preserve(seq):
        seen = set()
        out = []
        for x in seq:
            if x not in seen:
                seen.add(x)
                out.append(x)
        return out

    def try_parse_json_list(s: str):
        try:
            v = json.loads(s)
            if isinstance(v, list):
                return [str(t).strip() for t in v if str(t).strip()]
            return None
        except Exception:
            return None

    def strip_wrapping_quotes(s: str) -> str:
        pairs = [("\"", "\""), ("'", "'"), ("“", "”"), ("‘", "’")]
        changed = True
        while changed and len(s) >= 2:
            changed = False
            for a, b in pairs:
                if s.startswith(a) and s.endswith(b):
                    s = s[len(a):-len(b)].strip()
                    changed = True
        # Handle escaped quotes at both ends like \"foo\"
        if len(s) >= 4 and s.startswith('\\"') and s.endswith('\\"'):
            s = s[2:-2].strip()
        return s

    if isinstance(raw, list):
        joined = "".join([str(x) for x in raw])
        if "[" in joined and "]" in joined and '\\"' in joined:
            parsed = try_parse_json_list(joined)
            if parsed is not None:
                return uniq_preserve(parsed)
        cleaned = []
        for t in raw:
            s = strip_wrapping_quotes(str(t).strip())
            s = s.strip("[] ")
            # After removing brackets, strip quotes again to catch cases like '["Tag1"'
            s = strip_wrapping_quotes(s)
            if s:
                cleaned.append(s)
        return uniq_preserve([c for c in cleaned if c])
    if isinstance(raw, str):
        s = raw.strip()
        parsed = try_parse_json_list(s)
        if parsed is not None:
            return uniq_preserve(parsed)
        s = s.strip("[]")
        parts = [p.strip() for p in s.split(',')]
        out = []
        for p in parts:
            p = strip_wrapping_quotes(p.strip())
            if p:
                out.append(p)
        return uniq_preserve(out)
    return []


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


@router.post("/fix-tags")
def fix_tags_for_folder(path: str = Query(..., description="Chemin absolu du projet (dossier)")):
    folder_path = Path(path)
    if not folder_path.exists() or not folder_path.is_dir():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    meta_path = folder_path / ".stl_collect.json"
    if not meta_path.exists() or not meta_path.is_file():
        raise HTTPException(status_code=404, detail="Fichier .stl_collect.json introuvable dans le dossier")
    # Read
    try:
        with meta_path.open("r", encoding="utf-8") as fh:
            meta = json.load(fh) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lecture JSON échouée: {e}")
    # Normalize
    new_tags = _normalize_tags(meta.get("tags"))
    # If nothing changes, return
    old_repr = meta.get("tags")
    if isinstance(old_repr, list):
        old_list = [str(t).strip() for t in old_repr]
        if old_list == new_tags:
            return {"ok": True, "changed": False, "tags": new_tags}
    # Backup
    try:
        bak = meta_path.with_suffix(meta_path.suffix + ".bak")
        content = meta_path.read_text(encoding="utf-8")
        if not bak.exists():
            bak.write_text(content, encoding="utf-8")
        else:
            ts = datetime.now().strftime("%Y%m%d-%H%M%S")
            bak_ts = meta_path.with_suffix(meta_path.suffix + f".{ts}.bak")
            bak_ts.write_text(content, encoding="utf-8")
    except Exception as e:
        # backup failure shouldn't block
        pass
    # Write
    meta["tags"] = new_tags
    # Ensure dates
    try:
        if not meta.get("added_at"):
            ctime = folder_path.stat().st_ctime
            meta["added_at"] = datetime.fromtimestamp(ctime).isoformat()
    except Exception:
        meta["added_at"] = datetime.now().isoformat()
    meta["modified_at"] = datetime.now().isoformat()
    try:
        with meta_path.open("w", encoding="utf-8") as fh:
            json.dump(meta, fh, ensure_ascii=False, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Écriture JSON échouée: {e}")
    # Update DB
    try:
        conn = get_connection()
        cur = conn.cursor()
        csv_text = ",".join(new_tags) if new_tags else None
        cur.execute("UPDATE folder_index SET tags = ? WHERE path = ?", (csv_text, path))
        # Update tag catalog with any new tag
        for t in new_tags:
            try:
                cur.execute("INSERT OR IGNORE INTO tag_catalog(name) VALUES(?)", (t,))
            except Exception:
                pass
        conn.commit()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur mise à jour index: {e}")
    return {"ok": True, "changed": True, "tags": new_tags}


@router.post("/fix-tags-all")
def fix_tags_all():
    root = os.getenv("COLLECTION_ROOT")
    if not root:
        raise HTTPException(status_code=400, detail="COLLECTION_ROOT non défini")
    root_path = Path(root)
    if not root_path.exists() or not root_path.is_dir():
        raise HTTPException(status_code=400, detail="COLLECTION_ROOT introuvable")

    checked = 0
    fixed = 0
    errors: list[str] = []
    updated_tags: set[str] = set()

    for entry in os.scandir(root_path):
        if not entry.is_dir():
            continue
        if entry.name.startswith('.'):
            continue
        folder_path = Path(entry.path)
        meta_path = folder_path / ".stl_collect.json"
        if not meta_path.exists() or not meta_path.is_file():
            continue
        checked += 1
        try:
            with meta_path.open("r", encoding="utf-8") as fh:
                meta = json.load(fh) or {}
        except Exception as e:
            errors.append(f"read:{meta_path}:{e}")
            continue

        new_tags = _normalize_tags(meta.get("tags"))
        old_repr = meta.get("tags")
        need_write = True
        if isinstance(old_repr, list):
            if [str(t).strip() for t in old_repr] == new_tags:
                need_write = False
        if not new_tags and not isinstance(old_repr, str):
            # nothing to do
            need_write = False

        if not need_write:
            # still update DB to ensure consistency
            try:
                conn = get_connection()
                cur = conn.cursor()
                csv_text = ",".join(new_tags) if new_tags else None
                cur.execute("UPDATE folder_index SET tags = ? WHERE path = ?", (csv_text, str(folder_path)))
                conn.commit()
                conn.close()
            except Exception as e:
                errors.append(f"db-update:{folder_path}:{e}")
            continue

        # backup
        try:
            bak = meta_path.with_suffix(meta_path.suffix + ".bak")
            content = meta_path.read_text(encoding="utf-8")
            if not bak.exists():
                bak.write_text(content, encoding="utf-8")
            else:
                ts = datetime.now().strftime("%Y%m%d-%H%M%S")
                bak_ts = meta_path.with_suffix(meta_path.suffix + f".{ts}.bak")
                bak_ts.write_text(content, encoding="utf-8")
        except Exception as e:
            # backup failure tolerated
            pass

        meta["tags"] = new_tags
        # Ensure dates
        try:
            if not meta.get("added_at"):
                created = _created_at_from_images(folder_path)
                if not created:
                    try:
                        created = datetime.fromtimestamp(folder_path.stat().st_ctime).isoformat()
                    except Exception:
                        created = None
                meta["added_at"] = created or datetime.now().isoformat()
        except Exception:
            meta["added_at"] = datetime.now().isoformat()
        meta["modified_at"] = datetime.now().isoformat()
        try:
            with meta_path.open("w", encoding="utf-8") as fh:
                json.dump(meta, fh, ensure_ascii=False, indent=2)
            fixed += 1
        except Exception as e:
            errors.append(f"write:{meta_path}:{e}")
            continue

        # update DB and tag catalog
        try:
            conn = get_connection()
            cur = conn.cursor()
            csv_text = ",".join(new_tags) if new_tags else None
            cur.execute("UPDATE folder_index SET tags = ? WHERE path = ?", (csv_text, str(folder_path)))
            for t in new_tags:
                updated_tags.add(t)
                try:
                    cur.execute("INSERT OR IGNORE INTO tag_catalog(name) VALUES(?)", (t,))
                except Exception:
                    pass
            conn.commit()
            conn.close()
        except Exception as e:
            errors.append(f"db:{folder_path}:{e}")

    return {"ok": True, "checked": checked, "fixed": fixed, "errors": errors, "new_tags_indexed": len(updated_tags)}


@router.post("/backfill-dates-all")
def backfill_dates_all():
    root = os.getenv("COLLECTION_ROOT")
    if not root:
        raise HTTPException(status_code=400, detail="COLLECTION_ROOT non défini")
    root_path = Path(root)
    if not root_path.exists() or not root_path.is_dir():
        raise HTTPException(status_code=400, detail="COLLECTION_ROOT introuvable")

    checked = 0
    updated = 0
    errors: list[str] = []

    for entry in os.scandir(root_path):
        if not entry.is_dir() or entry.name.startswith('.'):
            continue
        folder_path = Path(entry.path)
        meta_path = folder_path / ".stl_collect.json"
        if not meta_path.exists() or not meta_path.is_file():
            continue
        checked += 1
        try:
            with meta_path.open("r", encoding="utf-8") as fh:
                meta = json.load(fh) or {}
        except Exception as e:
            errors.append(f"read:{meta_path}:{e}")
            continue

        before = json.dumps(meta, sort_keys=True, ensure_ascii=False)

        # Ensure added_at
        try:
            if not meta.get("added_at"):
                ctime = folder_path.stat().st_ctime
                meta["added_at"] = datetime.fromtimestamp(ctime).isoformat()
        except Exception:
            if not meta.get("added_at"):
                meta["added_at"] = datetime.now().isoformat()

        # Ensure modified_at only if missing
        if not meta.get("modified_at"):
            meta["modified_at"] = datetime.now().isoformat()

        after = json.dumps(meta, sort_keys=True, ensure_ascii=False)
        if before == after:
            continue

        # backup
        try:
            bak = meta_path.with_suffix(meta_path.suffix + ".bak")
            content = meta_path.read_text(encoding="utf-8")
            if not bak.exists():
                bak.write_text(content, encoding="utf-8")
            else:
                ts = datetime.now().strftime("%Y%m%d-%H%M%S")
                bak_ts = meta_path.with_suffix(meta_path.suffix + f".{ts}.bak")
                bak_ts.write_text(content, encoding="utf-8")
        except Exception:
            pass

        try:
            with meta_path.open("w", encoding="utf-8") as fh:
                json.dump(meta, fh, ensure_ascii=False, indent=2)
            updated += 1
        except Exception as e:
            errors.append(f"write:{meta_path}:{e}")
            continue

    return {"ok": True, "checked": checked, "updated": updated, "errors": errors}

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


@router.post("/tags/add")
def add_tag_to_folder(
    path: str = Query(..., description="Chemin absolu du projet (dossier)"),
    tag: str = Query(..., description="Tag à ajouter"),
):
    tag = (tag or "").strip()
    if not tag:
        raise HTTPException(status_code=400, detail="Tag vide")
    folder_path = Path(path)
    if not folder_path.exists() or not folder_path.is_dir():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    meta_path = folder_path / ".stl_collect.json"
    meta: dict = {}
    if meta_path.exists() and meta_path.is_file():
        try:
            with open(meta_path, "r", encoding="utf-8") as fh:
                meta = json.load(fh) or {}
        except Exception:
            meta = {}
    current: list[str] = []
    raw = meta.get("tags")
    if isinstance(raw, list):
        current = [str(t) for t in raw if str(t).strip()]
    elif isinstance(raw, str) and raw.strip():
        current = [t.strip() for t in raw.split(",") if t.strip()]
    if tag not in current:
        current.append(tag)
    meta["tags"] = current
    # Ensure dates
    try:
        if not meta.get("added_at"):
            ctime = folder_path.stat().st_ctime
            meta["added_at"] = datetime.fromtimestamp(ctime).isoformat()
    except Exception:
        meta["added_at"] = datetime.now().isoformat()
    meta["modified_at"] = datetime.now().isoformat()
    try:
        with open(meta_path, "w", encoding="utf-8") as fh:
            json.dump(meta, fh, ensure_ascii=False, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur écriture meta: {e}")
    # Update DB
    try:
        conn = get_connection()
        cur = conn.cursor()
        csv_text = ",".join(current) if current else None
        cur.execute("UPDATE folder_index SET tags = ? WHERE path = ?", (csv_text, path))
        # Update tag catalog
        cur.execute("INSERT OR IGNORE INTO tag_catalog(name) VALUES(?)", (tag,))
        conn.commit()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur mise à jour index: {e}")
    return {"ok": True, "tags": current}


@router.post("/tags/remove")
def remove_tag_from_folder(
    path: str = Query(..., description="Chemin absolu du projet (dossier)"),
    tag: str = Query(..., description="Tag à supprimer"),
):
    tag = (tag or "").strip()
    if not tag:
        raise HTTPException(status_code=400, detail="Tag vide")
    folder_path = Path(path)
    if not folder_path.exists() or not folder_path.is_dir():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    meta_path = folder_path / ".stl_collect.json"
    meta: dict = {}
    if meta_path.exists() and meta_path.is_file():
        try:
            with open(meta_path, "r", encoding="utf-8") as fh:
                meta = json.load(fh) or {}
        except Exception:
            meta = {}
    current: list[str] = []
    raw = meta.get("tags")
    if isinstance(raw, list):
        current = [str(t) for t in raw if str(t).strip()]
    elif isinstance(raw, str) and raw.strip():
        current = [t.strip() for t in raw.split(",") if t.strip()]
    new_tags = [t for t in current if t != tag]
    meta["tags"] = new_tags
    # Ensure dates
    try:
        if not meta.get("added_at"):
            ctime = folder_path.stat().st_ctime
            meta["added_at"] = datetime.fromtimestamp(ctime).isoformat()
    except Exception:
        meta["added_at"] = datetime.now().isoformat()
    meta["modified_at"] = datetime.now().isoformat()
    try:
        with open(meta_path, "w", encoding="utf-8") as fh:
            json.dump(meta, fh, ensure_ascii=False, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur écriture meta: {e}")
    # Update DB
    try:
        conn = get_connection()
        cur = conn.cursor()
        csv_text = ",".join(new_tags) if new_tags else None
        cur.execute("UPDATE folder_index SET tags = ? WHERE path = ?", (csv_text, path))
        conn.commit()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur mise à jour index: {e}")
    return {"ok": True, "tags": new_tags}


@router.get("/detail")
def get_folder_detail(path: str = Query(..., description="Chemin absolu d'un projet (depuis folder_index)")):
    # Sécurité: le chemin doit exister dans l'index pour être autorisé
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT fi.name, fi.path, fi.rel, fi.mtime, fi.images, fi.gifs, fi.videos, fi.archives, fi.stls,
               fi.tags, fi.rating,
               COALESCE(po.thumbnail_path, fi.thumbnail_path) AS thumbnail_path
        FROM folder_index fi
        LEFT JOIN preview_overrides po ON po.path = fi.path
        WHERE fi.path = ?
        """,
        (path,),
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    base = dict(row)
    base["tags"] = _split_tags_csv(base.get("tags"))
    counts = {
        "images": base.pop("images"),
        "gifs": base.pop("gifs"),
        "videos": base.pop("videos"),
        "archives": base.pop("archives"),
        "stls": base.pop("stls"),
    }

    # Scan du dossier cible uniquement pour lister les médias
    folder_path = Path(path)
    if not folder_path.exists() or not folder_path.is_dir():
        raise HTTPException(status_code=404, detail="Chemin du projet invalide")

    images: list[str] = []
    gifs: list[str] = []
    videos: list[str] = []
    archives: list[str] = []
    archive_sizes: dict[str, int] = {}
    stls: list[str] = []
    others: list[str] = []
    ignore_names = {"Thumbs.db", "desktop.ini"}
    try:
        for e in os.scandir(folder_path):
            if not e.is_file():
                continue
            name = e.name
            if name.startswith('.') or name in ignore_names:
                continue
            ext = Path(name).suffix.lower()
            rel = name  # nom de fichier relatif au dossier
            if ext in IMAGE_EXT:
                images.append(rel)
            elif ext in GIF_EXT:
                gifs.append(rel)
            elif ext in VIDEO_EXT:
                videos.append(rel)
            elif ext in ARCHIVE_EXT:
                archives.append(rel)
                try:
                    archive_sizes[rel] = int(e.stat().st_size)
                except Exception:
                    pass
            elif ext == ".stl":
                stls.append(rel)
            else:
                others.append(rel)
    except PermissionError:
        pass

    # Héro: miniature si dispo, sinon première image
    hero = base.get("thumbnail_path")
    if not hero and images:
        hero = str(folder_path / images[0])

    return {
        **base,
        "counts": counts,
        "media": {
            "images": images,
            "gifs": gifs,
            "videos": videos,
            "archives": archives,
            "stls": stls,
            "others": others,
        },
        "media_sizes": {
            "archives": archive_sizes,
        },
        "hero": hero,
    }


@router.post("/delete-file")
def delete_file(file: str = Query(..., description="Chemin absolu du fichier à supprimer (sous COLLECTION_ROOT)")):
    """Supprime un fichier média dans un projet et met à jour l'index.
    - file: chemin absolu du fichier (construit côté front avec detail.path + '/' + filename)
    Retourne les compteurs mis à jour et la miniature potentiellement recalculée.
    """
    root = os.getenv("COLLECTION_ROOT")
    if not root:
        raise HTTPException(status_code=400, detail="COLLECTION_ROOT non défini")
    root_path = Path(root).resolve()

    target = Path(file).resolve()
    # Sécurité: limiter aux fichiers sous la racine collection
    try:
        target.relative_to(root_path)
    except Exception:
        raise HTTPException(status_code=403, detail="Accès refusé")

    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Fichier introuvable")

    folder_path = target.parent
    # Supprimer le fichier
    try:
        target.unlink()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur suppression fichier: {e}")

    # Mettre à jour l'index pour le dossier parent
    try:
        rec = _build_folder_record(folder_path)
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO folder_index(path, name, rel, mtime, images, gifs, videos, archives, stls, tags, rating, thumbnail_path)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
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
              thumbnail_path=excluded.thumbnail_path
            """,
            (
                rec["path"], rec["name"], rec["rel"], rec["mtime"], rec["images"], rec["gifs"], rec["videos"], rec["archives"], rec["stls"], rec["tags"], rec["rating"], rec["thumbnail_path"],
            ),
        )
        # Si une preview_override pointait sur ce fichier supprimé, l'effacer
        cur.execute("DELETE FROM preview_overrides WHERE path = ? AND thumbnail_path = ?", (str(folder_path), str(target)))
        conn.commit()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur mise à jour index: {e}")

    # Recalculer hero (miniature effective): override si existe, sinon folder_index.thumbnail_path, sinon première image
    hero = rec.get("thumbnail_path")
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT thumbnail_path FROM preview_overrides WHERE path = ?", (str(folder_path),))
        row = cur.fetchone()
        conn.close()
        if row and row[0]:
            hero = row[0]
    except Exception:
        pass

    return {
        "ok": True,
        "path": str(folder_path),
        "counts": {
            "images": rec["images"],
            "gifs": rec["gifs"],
            "videos": rec["videos"],
            "archives": rec["archives"],
            "stls": rec["stls"],
        },
        "thumbnail_path": rec.get("thumbnail_path"),
        "hero": hero,
    }


@router.post("/delete-project")
def delete_project(path: str = Query(..., description="Chemin absolu du projet (dossier) à supprimer")):
    """Supprime un dossier projet ENTIER sous COLLECTION_ROOT et nettoie l'index DB.
    Attention: ne supprime PAS la collection complète, uniquement le dossier cible.
    """
    root = os.getenv("COLLECTION_ROOT")
    if not root:
        raise HTTPException(status_code=400, detail="COLLECTION_ROOT non défini")
    root_path = Path(root).resolve()
    target = Path(path).resolve()
    try:
        target.relative_to(root_path)
    except Exception:
        raise HTTPException(status_code=403, detail="Accès refusé")
    if not target.exists() or not target.is_dir():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    # Sécurité: empêcher la suppression de la racine collection
    if target == root_path:
        raise HTTPException(status_code=400, detail="Suppression de la collection interdite")

    # Suppression FS récursive
    try:
        shutil.rmtree(target)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur suppression dossier: {e}")

    # Nettoyage DB
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM folder_index WHERE path = ?", (str(target),))
        cur.execute("DELETE FROM preview_overrides WHERE path = ?", (str(target),))
        conn.commit()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur nettoyage index: {e}")

    return {"ok": True, "removed": str(target)}
