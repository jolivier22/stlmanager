from fastapi import APIRouter, HTTPException, Query
from typing import List
from ..db import get_connection
from ..schemas import Project, ProjectList

router = APIRouter()

@router.get("/", response_model=ProjectList)
def list_projects(q: str | None = Query(default=None, description="Rechercher par nom")):
    conn = get_connection()
    cur = conn.cursor()
    if q:
        cur.execute("SELECT id, path, name, dir, thumbnail_path FROM projects WHERE name LIKE ? ORDER BY name", (f"%{q}%",))
    else:
        cur.execute("SELECT id, path, name, dir, thumbnail_path FROM projects ORDER BY name")
    rows = cur.fetchall()
    conn.close()
    items: List[Project] = [Project(**dict(r)) for r in rows]
    return {"items": items, "total": len(items)}

@router.get("/{project_id}", response_model=Project)
def get_project(project_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, path, name, dir, thumbnail_path FROM projects WHERE id = ?", (project_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    return dict(row)
