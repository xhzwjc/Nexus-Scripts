import asyncio

from app.services.match_scheduler import FairMatchScheduler, KeyRotator, MatchTask


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
