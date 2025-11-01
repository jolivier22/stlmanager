import os
import sqlite3
from pathlib import Path

CACHE_DB_PATH = os.getenv("CACHE_DB_PATH", str(Path(__file__).resolve().parent.parent / "data" / "cache.db"))

def _ensure_dir(path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)


def get_connection() -> sqlite3.Connection:
    _ensure_dir(CACHE_DB_PATH)
    conn = sqlite3.connect(CACHE_DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            dir TEXT NOT NULL,
            first_scanned_at TEXT,
            updated_at TEXT,
            thumbnail_path TEXT
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS project_tags (
            project_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (project_id, tag_id),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );
        """
    )
    # Cache index for folders (projects-dossiers)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS folder_index (
            path TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            rel TEXT NOT NULL,
            mtime REAL,
            images INTEGER DEFAULT 0,
            gifs INTEGER DEFAULT 0,
            videos INTEGER DEFAULT 0,
            archives INTEGER DEFAULT 0,
            stls INTEGER DEFAULT 0,
            tags TEXT,
            rating INTEGER,
            thumbnail_path TEXT
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_folder_index_name ON folder_index(name)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_folder_index_mtime ON folder_index(mtime)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_folder_index_rating ON folder_index(rating)")
    # Global tags catalog (unique tag names)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tag_catalog (
            name TEXT PRIMARY KEY
        );
        """
    )
    # User overrides for folder preview thumbnail
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS preview_overrides (
            path TEXT PRIMARY KEY,
            thumbnail_path TEXT
        );
        """
    )
    conn.commit()
    conn.close()
