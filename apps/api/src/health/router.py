from fastapi import APIRouter
from src.health.schemas import HealthResponse
from src.database import ping_database
from src.storage import ObjectStorage
from workers.celery_app import celery_app

health_router = APIRouter(prefix="/healthz")


@health_router.get("", response_model=HealthResponse)
async def health() -> HealthResponse:
    is_db_ok = await ping_database()
    is_storage_ok = await ObjectStorage().ping()
    inspector = celery_app.control.inspect()

    ping_response = inspector.ping()
    is_celery_ok = False

    if ping_response:
        print("Worker status: RUNNING")
        print(f"Active workers: {list(ping_response.keys())}")
        is_celery_ok = True
    else:
        print("Worker status: DOWN (No workers responded)")

    if is_db_ok and is_storage_ok and is_celery_ok:
        return HealthResponse(
            status="ready",
            dependencies={"db": "connected", "storage": "connected", "celery": "available"},
        )
    else:
        return HealthResponse(
            status="failing",
            dependencies={
                "db": "connected" if is_db_ok else "failed",
                "storage": "connected" if is_storage_ok else "failed",
                "celery": "ready" if is_celery_ok else "not running",
            },
        )
