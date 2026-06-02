import asyncio
import threading
import time

from app.services import match_scheduler
from app.services.llm_concurrency_limiter import SharedLLMConcurrencyLimiter
from app.services.match_scheduler import KeySlot


def test_sync_limiter_blocks_same_source_until_released():
    limiter = SharedLLMConcurrencyLimiter()
    limiter.acquire_sync("db:test", max_concurrent=1, max_qps=0)
    acquired = []

    def acquire_second_slot():
        limiter.acquire_sync("db:test", max_concurrent=1, max_qps=0)
        acquired.append(True)
        limiter.release("db:test")

    thread = threading.Thread(target=acquire_second_slot, daemon=True)
    try:
        thread.start()
        time.sleep(0.05)
        assert acquired == []
    finally:
        limiter.release("db:test")
    thread.join(timeout=1)
    assert not thread.is_alive()
    assert acquired == [True]


def test_key_slot_uses_shared_limiter_source(monkeypatch):
    calls = []

    async def fake_acquire(source, *, max_concurrent, max_qps):
        calls.append(("acquire", source, max_concurrent, max_qps))

    def fake_release(source):
        calls.append(("release", source))

    monkeypatch.setattr(match_scheduler.shared_llm_limiter, "acquire_async", fake_acquire)
    monkeypatch.setattr(match_scheduler.shared_llm_limiter, "release", fake_release)

    async def run():
        slot = KeySlot(
            key_id="config_1",
            config_id=1,
            source_key="db:test",
            semaphore=asyncio.Semaphore(1),
            max_concurrent=2,
            max_qps=0,
        )
        await slot.acquire()
        slot.release()

    asyncio.run(run())

    assert calls == [
        ("acquire", "db:test", 2, 0),
        ("release", "db:test"),
    ]
