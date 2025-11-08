#!/usr/bin/env python3
import os
import sys
import json
from pathlib import Path
from datetime import datetime
from typing import Any, List


def uniq_preserve(seq: List[str]) -> List[str]:
    seen = set()
    out = []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def try_parse_json_list(s: str) -> List[str] | None:
    try:
        v = json.loads(s)
        if isinstance(v, list):
            return [str(t).strip() for t in v if str(t).strip()]
        return None
    except Exception:
        return None


def normalize_tags(raw: Any) -> List[str]:
    # Already a clean list of strings
    if isinstance(raw, list):
        # Detect case where list actually contains slices of a JSON-encoded list
        joined = "".join([str(x) for x in raw])
        if "[" in joined and "]" in joined and '\\"' in joined:
            parsed = try_parse_json_list(joined)
            if parsed is not None:
                return uniq_preserve(parsed)
        # Fallback: clean each entry
        cleaned: List[str] = []
        for t in raw:
            s = str(t).strip()
            # remove surrounding quotes if present
            if len(s) >= 2 and ((s[0] == '"' and s[-1] == '"') or (s[0] == "'" and s[-1] == "'")):
                s = s[1:-1].strip()
            # remove stray brackets
            s = s.strip("[] ")
            if s:
                cleaned.append(s)
        return uniq_preserve([c for c in cleaned if c])

    # If it's a string, try JSON list first, else split by comma
    if isinstance(raw, str):
        s = raw.strip()
        parsed = try_parse_json_list(s)
        if parsed is not None:
            return uniq_preserve(parsed)
        # Remove outer brackets if user stored like "[a,b]"
        s = s.strip()
        s = s.strip("[]")
        parts = [p.strip() for p in s.split(",")]
        out = []
        for p in parts:
            if len(p) >= 2 and ((p[0] == '"' and p[-1] == '"') or (p[0] == "'" and p[-1] == "'")):
                p = p[1:-1].strip()
            p = p.strip()
            if p:
                out.append(p)
        return uniq_preserve(out)

    # Unknown format -> empty
    return []


def process_file(meta_path: Path) -> bool:
    try:
        with meta_path.open("r", encoding="utf-8") as fh:
            meta = json.load(fh)
    except Exception as e:
        print(f"[skip read] {meta_path}: {e}")
        return False

    raw_tags = meta.get("tags")
    new_tags = normalize_tags(raw_tags)

    # Determine if change required
    changed = False
    if isinstance(raw_tags, list):
        src = [str(t).strip() for t in raw_tags]
        if src != new_tags:
            changed = True
    elif isinstance(raw_tags, str):
        # any string form becomes list
        changed = True
    else:
        # None or other -> only change if we produced something non-empty
        changed = bool(new_tags)

    if not changed:
        return False

    # Backup first
    backup_path = meta_path.with_suffix(meta_path.suffix + ".bak")
    try:
        if not backup_path.exists():
            backup_path.write_text(meta_path.read_text(encoding="utf-8"), encoding="utf-8")
        else:
            # timestamped backup to avoid overwrite
            ts = datetime.now().strftime("%Y%m%d-%H%M%S")
            backup_ts = meta_path.with_suffix(meta_path.suffix + f".{ts}.bak")
            backup_ts.write_text(meta_path.read_text(encoding="utf-8"), encoding="utf-8")
    except Exception as e:
        print(f"[warn] backup failed for {meta_path}: {e}")

    # Write fixed file
    meta["tags"] = new_tags
    try:
        with meta_path.open("w", encoding="utf-8") as fh:
            json.dump(meta, fh, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[error] write failed for {meta_path}: {e}")
        return False


def main():
    arg_path: Path | None = None
    if len(sys.argv) > 1:
        arg_path = Path(sys.argv[1])
    else:
        root_env = os.getenv("COLLECTION_ROOT")
        if root_env:
            arg_path = Path(root_env)
    if arg_path is None:
        print("Usage: fix_tags_json.py <PATH>  (PATH can be COLLECTION_ROOT, a project folder, or a .stl_collect.json file). Alternatively, set env COLLECTION_ROOT.")
        sys.exit(2)

    if not arg_path.exists():
        print(f"Invalid path: {arg_path}")
        sys.exit(2)

    total = 0
    fixed = 0

    # Case 1: direct file .stl_collect.json
    if arg_path.is_file() and arg_path.name == ".stl_collect.json":
        total = 1
        if process_file(arg_path):
            fixed = 1
            print(f"[fixed] {arg_path}")
        print(f"Done. Checked: {total}, Fixed: {fixed}")
        return

    # Case 2: directory with its own .stl_collect.json (single project)
    if arg_path.is_dir():
        meta_here = arg_path / ".stl_collect.json"
        if meta_here.exists() and meta_here.is_file():
            total = 1
            if process_file(meta_here):
                fixed = 1
                print(f"[fixed] {meta_here}")
            print(f"Done. Checked: {total}, Fixed: {fixed}")
            return

        # Case 3: treat as root directory: scan immediate subfolders
        for entry in os.scandir(arg_path):
            if not entry.is_dir() or entry.name.startswith('.'):
                continue
            meta_path = Path(entry.path) / ".stl_collect.json"
            if not meta_path.exists() or not meta_path.is_file():
                continue
            total += 1
            if process_file(meta_path):
                fixed += 1
                print(f"[fixed] {meta_path}")
        print(f"Done. Checked: {total}, Fixed: {fixed}")
        return

    print(f"Unsupported path: {arg_path}")


if __name__ == "__main__":
    main()
