from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from noteesta_api.config import get_settings
from noteesta_api.database import close_database, ensure_indexes
from noteesta_api.routes.collections import router as collections_router
from noteesta_api.routes.health import router as health_router
from noteesta_api.routes.library import router as library_router
from noteesta_api.routes.pills import router as pills_router
from noteesta_api.storage import get_storage


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await ensure_indexes()
    await get_storage().ensure_bucket()
    yield
    await close_database()


app = FastAPI(
    title="Noteesta API",
    version="0.1.0",
    summary="Evidence-backed Study Pill generation",
    lifespan=lifespan,
)
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-User-Id"],
)
app.include_router(health_router, prefix="/api/v1")
app.include_router(pills_router, prefix="/api/v1")
app.include_router(collections_router, prefix="/api/v1")
app.include_router(library_router, prefix="/api/v1")
