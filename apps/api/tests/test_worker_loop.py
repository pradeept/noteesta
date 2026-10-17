import asyncio

import pytest
from pymongo.errors import PyMongoError

from noteesta_api import database
from workers import tasks


class LoopBoundClient:
    instances: list["LoopBoundClient"] = []

    def __init__(self, uri: str) -> None:
        self.loop = None
        self.closed = False
        self.instances.append(self)

    def __getitem__(self, name: str) -> "LoopBoundClient":
        return self

    async def touch(self) -> None:
        loop = asyncio.get_running_loop()
        if self.loop is not None and self.loop is not loop:
            raise RuntimeError("Cannot use AsyncMongoClient in different event loop")
        self.loop = loop

    async def close(self) -> None:
        assert asyncio.get_running_loop() is self.loop
        self.closed = True


@pytest.fixture
def fake_database(monkeypatch: pytest.MonkeyPatch) -> None:
    LoopBoundClient.instances = []
    monkeypatch.setattr(database, "_client", None)
    monkeypatch.setattr(database, "AsyncMongoClient", LoopBoundClient)


def test_sequential_worker_tasks_use_separate_clients(
    fake_database, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_process_pill(pill_id: str) -> None:
        await database.get_database().touch()

    monkeypatch.setattr(tasks, "process_pill", fake_process_pill)

    tasks.process_pill_task.run("pill-1")
    tasks.process_pill_task.run("pill-2")

    assert len(LoopBoundClient.instances) == 2
    assert all(client.closed for client in LoopBoundClient.instances)
    assert database._client is None


def test_retry_status_update_uses_processing_loop(
    fake_database, monkeypatch: pytest.MonkeyPatch
) -> None:
    updates = []

    async def fake_process_pill(pill_id: str) -> None:
        await database.get_database().touch()
        raise PyMongoError("temporary database failure")

    class FakeRepository:
        def __init__(self, client: LoopBoundClient) -> None:
            self.client = client

        async def update(self, pill_id: str, **changes: object) -> None:
            await self.client.touch()
            updates.append((pill_id, changes))

    monkeypatch.setattr(tasks, "process_pill", fake_process_pill)
    monkeypatch.setattr(tasks, "PillRepository", FakeRepository)

    with pytest.raises(PyMongoError, match="temporary database failure"):
        tasks.process_pill_task.run("pill-1")

    assert updates[0][0] == "pill-1"
    assert updates[0][1]["status"] == "queued"
    assert len(LoopBoundClient.instances) == 1
    assert LoopBoundClient.instances[0].closed
    assert database._client is None
