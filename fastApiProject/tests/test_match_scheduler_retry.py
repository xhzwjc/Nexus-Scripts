import asyncio

from app.services.match_scheduler import FairMatchScheduler, KeyRotator, MatchTask
from app.services.recruitment_task_control import RecruitmentTaskCancelled


def _make_task(candidate_id=1, user_id="u1"):
    return MatchTask(
        user_id=user_id,
        batch_id="b1",
        candidate_id=candidate_id,
        candidate=object(),
        position_summaries=[],
    )


def test_reenqueue_keeps_candidate_live_for_dedup():
    """0.1-C：错误回调重新入队重试时，候选人必须保持 live，
    以便重试延迟窗口内新一次 trigger 不会重复入队同一候选人。"""
    async def scenario():
        scheduler = FairMatchScheduler(KeyRotator())
        task = _make_task(candidate_id=42)
        # 入队一次，模拟 live
        await scheduler.enqueue_batch(
            user_id="u1", batch_id="b1", candidates=[type("C", (), {"id": 42})()], position_summaries=[]
        )
        assert scheduler.is_candidate_live(42) is True

        # 错误回调重新入队 → 标记 requeued 且保持 live
        await scheduler.reenqueue(task)
        assert task.requeued_for_retry is True
        assert scheduler.is_candidate_live(42) is True

        # worker finally 在 requeued 时不清除 live
        # 模拟 finally 的判定逻辑
        if not task.requeued_for_retry:
            scheduler.clear_live_candidate(42)
        assert scheduler.is_candidate_live(42) is True

        # 重新执行时清除重试标记；此后终态 finally 会清 live
        task.requeued_for_retry = False
        if not task.requeued_for_retry:
            scheduler.clear_live_candidate(42)
        assert scheduler.is_candidate_live(42) is False

    asyncio.run(scenario())


def test_enqueue_and_next_task_roundtrip():
    async def scenario():
        scheduler = FairMatchScheduler(KeyRotator())
        await scheduler.enqueue_batch(
            user_id="u1",
            batch_id="b1",
            candidates=[type("C", (), {"id": 7})()],
            position_summaries=[{"id": 1, "title": "岗位"}],
            session_token="tok",
            task_type="ai_position_match",
        )
        task = await scheduler._next_task()
        assert task is not None
        assert task.candidate_id == 7
        assert task.session_token == "tok"
        assert task.task_type == "ai_position_match"
        assert task.position_summaries == [{"id": 1, "title": "岗位"}]

    asyncio.run(scenario())


def test_cancel_match_interrupts_running_task_control():
    async def scenario():
        rotator = KeyRotator()
        rotator.reload([
            {
                "key_id": "config_1",
                "config_id": 1,
                "source_key": "db:test",
                "max_concurrent": 1,
                "max_qps": 0,
            }
        ])
        scheduler = FairMatchScheduler(rotator)
        started = asyncio.Event()
        closer_called = []
        errors = []

        async def match_callback(task, slot):
            assert task.cancel_control is not None
            task.cancel_control.register_closer(lambda: closer_called.append(task.candidate_id))
            started.set()
            while not task.cancel_control.is_cancelled():
                await asyncio.sleep(0.01)
            task.cancel_control.raise_if_cancelled()

        async def error_callback(task, error):
            errors.append(error)

        scheduler.set_callbacks(match_callback=match_callback, error_callback=error_callback)
        await scheduler.start()
        await scheduler.enqueue_batch(
            user_id="u1",
            batch_id="b1",
            candidates=[type("C", (), {"id": 42})()],
            position_summaries=[],
        )
        await asyncio.wait_for(started.wait(), timeout=1)

        scheduler.cancel_match(42)
        for _ in range(100):
            if not scheduler.is_candidate_live(42):
                break
            await asyncio.sleep(0.01)
        await scheduler.stop()

        assert closer_called == [42]
        assert len(errors) == 1
        assert isinstance(errors[0], RecruitmentTaskCancelled)
        assert scheduler.is_candidate_live(42) is False

    asyncio.run(scenario())
