from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import health, projects, scan, folders, files, version
from .db import init_db

app = FastAPI(title="STLManager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(scan.router, tags=["scan"])
app.include_router(folders.router, prefix="/folders", tags=["folders"])
app.include_router(files.router, prefix="/files", tags=["files"])
app.include_router(version.router)

@app.on_event("startup")
def on_startup():
    init_db()
