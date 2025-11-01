from pydantic import BaseModel
from typing import Optional, List

class Project(BaseModel):
    id: int
    path: str
    name: str
    dir: str
    thumbnail_path: Optional[str] = None

class ProjectList(BaseModel):
    items: List[Project]
    total: int
