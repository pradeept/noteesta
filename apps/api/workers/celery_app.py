from celery import Celery

from noteesta_api.config import get_settings

settings = get_settings()
celery_app = Celery("noteesta", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_always_eager=settings.celery_task_always_eager,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_track_started=True,
    broker_connection_retry_on_startup=True,
    result_expires=3600,
)
celery_app.autodiscover_tasks(["workers"])
