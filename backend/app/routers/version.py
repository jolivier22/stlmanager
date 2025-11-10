from fastapi import APIRouter
import os

router = APIRouter(tags=["version"])

BUILD_SHA = os.getenv("BUILD_SHA", "unknown")
BUILD_DATE = os.getenv("BUILD_DATE", "unknown")

@router.get("/version")
def version():
    return {
        "name": "stlmanager-api",
        "build_sha": BUILD_SHA,
        "build_date": BUILD_DATE,
    }
