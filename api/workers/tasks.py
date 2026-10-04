import asyncio
import logging

import httpx
from botocore.exceptions import BotoCoreError, ClientError
from pymongo.errors import PyMongoError

from noteesta_api.database import get_database
from noteesta_api.repository import PillRepository
from noteesta_api.services.pipeline import process_pill
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)
RETRYABLE_ERRORS = (
    ConnectionError,
    TimeoutError,
    httpx.TransportError,
    PyMongoError,
    BotoCoreError,
    ClientError,
)


@celery_app.task(
    bind=True,
    name="noteesta.process_pill",
    autoretry_for=RETRYABLE_ERRORS,
    retry_backoff=True,
    retry_jitter=True,
    max_retries=2,
)
def process_pill_task(self, pill_id: str) -> None:
    logger.info(
        "Pill %s: task %s received (attempt %d/%d)",
        pill_id,
        self.request.id,
        self.request.retries + 1,
        self.max_retries + 1,
    )
    try:
        asyncio.run(process_pill(pill_id))
    except RETRYABLE_ERRORS:
        will_retry = self.request.retries < self.max_retries
        logger.exception(
            "Pill %s: temporary dependency failure on attempt %d/%d%s",
            pill_id,
            self.request.retries + 1,
            self.max_retries + 1,
            "; scheduling a retry" if will_retry else "; retries exhausted",
        )
        if will_retry:
            try:
                asyncio.run(
                    PillRepository(get_database()).update(
                        pill_id,
                        status="queued",
                        stage=(
                            "Temporary service issue; retrying "
                            f"(attempt {self.request.retries + 2} of {self.max_retries + 1})"
                        ),
                        error=None,
                    )
                )
            except Exception:
                logger.exception("Pill %s: could not record automatic retry status", pill_id)
        raise
    except Exception:
        logger.exception("Pill %s: task failed with a non-retryable error", pill_id)
        raise
    logger.info("Pill %s: task completed", pill_id)
