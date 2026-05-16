"""
AI 岗位匹配公平调度器

- 多 key 独立并发控制，配置动态读取
- 多用户 Round-Robin 公平调度，防止大批量任务饿死其他用户
- 支持 key 动态添加/删除（热重载）
- MiMo 等并发=1 的模型天然串行，不需要特殊处理
"""

import asyncio
import logging
import time
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────
# Key 槽：管理单个 key 的并发和 QPS
# ─────────────────────────────────────────

@dataclass
class KeySlot:
    key_id: str
    config_id: int
    semaphore: asyncio.Semaphore
    max_concurrent: int
    max_qps: int  # 0 表示不限制
    _qps_window: deque = field(default_factory=deque)
    _qps_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def acquire(self):
        """获取并发槽 + QPS 检查，两个条件都满足才放行"""
        await self.semaphore.acquire()
        if self.max_qps > 0:
            await self._wait_for_qps()

    def release(self):
        self.semaphore.release()

    async def _wait_for_qps(self):
        async with self._qps_lock:
            now = time.monotonic()
            # 清理 1 秒前的记录
            while self._qps_window and self._qps_window[0] < now - 1.0:
                self._qps_window.popleft()
            # QPS 已满，等到窗口最早的请求过期
            if len(self._qps_window) >= self.max_qps:
                wait = 1.0 - (now - self._qps_window[0])
                if wait > 0:
                    await asyncio.sleep(wait)
            self._qps_window.append(time.monotonic())

    @property
    def available(self) -> bool:
        """当前是否有空闲并发槽（非阻塞检查）"""
        return self.semaphore._value > 0


# ─────────────────────────────────────────
# Key 轮转器：在多个 key 之间分配请求
# ─────────────────────────────────────────

class KeyRotator:
    def __init__(self):
        self._slots: List[KeySlot] = []
        self._index = 0
        self._lock = asyncio.Lock()

    def reload(self, key_configs: List[Dict[str, Any]]):
        """
        动态重载 key 配置，不需要重启服务。

        key_configs 格式：
        [
            {"key_id": "config_key_a", "config_id": 1, "max_concurrent": 4, "max_qps": 10},
            {"key_id": "config_key_b", "config_id": 2, "max_concurrent": 4, "max_qps": 10},
            {"key_id": "config_key_c", "config_id": 3, "max_concurrent": 1, "max_qps": 5},
        ]
        """
        existing = {s.key_id: s for s in self._slots}
        new_slots = []
        for cfg in key_configs:
            key_id = cfg["key_id"]
            if key_id in existing:
                slot = existing[key_id]
                # 更新配置（保留 semaphore 状态）
                slot.max_concurrent = cfg.get("max_concurrent", slot.max_concurrent)
                slot.max_qps = cfg.get("max_qps", slot.max_qps)
                slot.config_id = cfg.get("config_id", slot.config_id)
                new_slots.append(slot)
            else:
                new_slots.append(KeySlot(
                    key_id=key_id,
                    config_id=cfg.get("config_id", 0),
                    semaphore=asyncio.Semaphore(cfg.get("max_concurrent", 4)),
                    max_concurrent=cfg.get("max_concurrent", 4),
                    max_qps=cfg.get("max_qps", 0),
                ))
        self._slots = new_slots
        logger.info(
            "KeyRotator reloaded: %d keys, total_concurrent=%d",
            len(self._slots),
            self.total_concurrent,
        )

    async def acquire_slot(self) -> KeySlot:
        """
        找到一个可用的 key 槽并获取，Round-Robin 轮转。
        所有 key 都满时阻塞等待，直到有空槽。
        """
        if not self._slots:
            raise RuntimeError("No LLM keys configured for matching")

        while True:
            async with self._lock:
                for _ in range(len(self._slots)):
                    slot = self._slots[self._index % len(self._slots)]
                    self._index += 1
                    if slot.available:
                        await slot.acquire()
                        return slot

            # 所有 key 都满，短暂等待后重试
            await asyncio.sleep(0.05)

    @property
    def total_concurrent(self) -> int:
        return sum(s.max_concurrent for s in self._slots)

    @property
    def slots(self) -> List[KeySlot]:
        return list(self._slots)


# ─────────────────────────────────────────
# 任务包装
# ─────────────────────────────────────────

@dataclass
class MatchTask:
    user_id: str
    batch_id: str
    candidate_id: int
    candidate: Any  # RecruitmentCandidate 对象
    resume_content: str
    position_summaries: List[Dict[str, Any]]
    enqueue_time: float = field(default_factory=time.monotonic)
    started_at: Optional[float] = None  # worker 真正开始执行的时间
    retry_count: int = 0  # 已重试次数


# ─────────────────────────────────────────
# 公平调度器：Round-Robin 多用户公平调度
# ─────────────────────────────────────────

class FairMatchScheduler:
    """
    多用户公平调度器

    设计原则：
    - 每个用户一个任务桶，Round-Robin 轮转取任务
    - 新用户加入立即插入轮转，不需要等当前用户跑完
    - 某用户任务跑完自动退出轮转
    - worker 数量 = 所有 key 的总并发上限
    """

    def __init__(self, key_rotator: KeyRotator):
        self.key_rotator = key_rotator
        self._user_queues: Dict[str, deque] = defaultdict(deque)
        self._active_users: deque = deque()
        self._queue_lock = asyncio.Lock()
        self._has_tasks = asyncio.Event()
        self._workers: List[asyncio.Task] = []
        self.running = False
        self._cancelled_ids: set = set()

        # 统计
        self._stats = {
            "total_enqueued": 0,
            "total_completed": 0,
            "total_failed": 0,
        }

    def cancel_match(self, candidate_id: int):
        """标记候选人为已取消，worker 执行前会检查"""
        self._cancelled_ids.add(candidate_id)

    def is_cancelled(self, candidate_id: int) -> bool:
        return candidate_id in self._cancelled_ids

    def clear_cancelled(self, candidate_id: int):
        self._cancelled_ids.discard(candidate_id)

    async def reenqueue(self, task: MatchTask):
        """重新入队（重试场景），放到队列头部优先处理"""
        async with self._queue_lock:
            self._user_queues[task.user_id].appendleft(task)
            if task.user_id not in self._active_users:
                self._active_users.append(task.user_id)
        self._has_tasks.set()
        logger.info(
            "Reenqueued candidate=%d for retry (attempt %d)",
            task.candidate_id, task.retry_count,
        )

    async def start(self):
        """启动调度器，worker 数量跟随 key 总并发数"""
        self.running = True
        worker_count = max(self.key_rotator.total_concurrent, 1)
        self._workers = [
            asyncio.create_task(self._worker(i))
            for i in range(worker_count)
        ]
        logger.info("FairMatchScheduler started with %d workers", worker_count)

    async def stop(self):
        self.running = False
        self._has_tasks.set()  # 唤醒所有 worker 让其退出
        for w in self._workers:
            w.cancel()
        await asyncio.gather(*self._workers, return_exceptions=True)
        logger.info("FairMatchScheduler stopped")

    async def enqueue_batch(
        self,
        user_id: str,
        batch_id: str,
        candidates: List[Any],
        position_summaries: List[Dict[str, Any]],
        resume_extractor: Callable[[Any], str],
    ):
        """
        批量入队。同一 batch_id 的任务属于同一次上传。

        resume_extractor: 从 candidate 对象提取简历文本的函数
        """
        async with self._queue_lock:
            is_new_user = (
                user_id not in self._user_queues
                or len(self._user_queues[user_id]) == 0
            )
            for candidate in candidates:
                task = MatchTask(
                    user_id=user_id,
                    batch_id=batch_id,
                    candidate_id=candidate.id,
                    candidate=candidate,
                    resume_content=resume_extractor(candidate),
                    position_summaries=position_summaries,
                )
                self._user_queues[user_id].append(task)
                self._stats["total_enqueued"] += 1

            if is_new_user and user_id not in self._active_users:
                self._active_users.append(user_id)

        self._has_tasks.set()
        logger.info(
            "Enqueued %d tasks for user=%s batch=%s",
            len(candidates), user_id, batch_id,
        )

    async def _next_task(self) -> Optional[MatchTask]:
        """Round-Robin 取下一个任务"""
        async with self._queue_lock:
            if not self._active_users:
                return None
            # 轮转尝试每个用户
            for _ in range(len(self._active_users)):
                user_id = self._active_users[0]
                self._active_users.rotate(-1)
                if self._user_queues[user_id]:
                    task = self._user_queues[user_id].popleft()
                    # 用户队列空了，退出轮转
                    if not self._user_queues[user_id]:
                        try:
                            self._active_users.remove(user_id)
                        except ValueError:
                            pass
                    return task
            return None

    async def _worker(self, worker_id: int):
        """worker 主循环，持续从队列取任务执行"""
        logger.info("MatchWorker-%d started", worker_id)
        while self.running:
            task = await self._next_task()
            if task is None:
                self._has_tasks.clear()
                await self._has_tasks.wait()
                continue

            # 检查是否已被用户取消
            if self.is_cancelled(task.candidate_id):
                self.clear_cancelled(task.candidate_id)
                logger.info(
                    "MatchWorker-%d skipping cancelled candidate=%d",
                    worker_id, task.candidate_id,
                )
                continue

            # 记录实际开始匹配时间
            task.started_at = time.monotonic()

            slot = None
            try:
                slot = await self.key_rotator.acquire_slot()
                logger.debug(
                    "MatchWorker-%d executing candidate=%d key=%s user=%s",
                    worker_id, task.candidate_id, slot.key_id, task.user_id,
                )

                # 调用回调执行实际匹配（由 service 层提供）
                if self._match_callback:
                    await self._match_callback(task, slot)

                self._stats["total_completed"] += 1

            except asyncio.CancelledError:
                break
            except Exception as e:
                self._stats["total_failed"] += 1
                logger.error(
                    "MatchWorker-%d task failed candidate=%d: %s",
                    worker_id, task.candidate_id, e, exc_info=True,
                )
                # 失败也要回调，写 failed 审计日志
                if self._error_callback:
                    await self._error_callback(task, e)
            finally:
                if slot:
                    slot.release()

        logger.info("MatchWorker-%d stopped", worker_id)

    # 回调函数，由 service 层注入
    _match_callback: Optional[Callable] = None
    _error_callback: Optional[Callable] = None

    def set_callbacks(
        self,
        match_callback: Callable,
        error_callback: Callable,
    ):
        """设置匹配和错误回调（由 service 层注入）"""
        self._match_callback = match_callback
        self._error_callback = error_callback

    def stats(self) -> Dict[str, Any]:
        return {
            **self._stats,
            "queue_depth": {
                uid: len(q)
                for uid, q in self._user_queues.items()
                if q
            },
            "active_users": list(self._active_users),
            "worker_count": len(self._workers),
            "key_slots": [
                {
                    "key_id": s.key_id,
                    "max_concurrent": s.max_concurrent,
                    "max_qps": s.max_qps,
                    "available": s.available,
                }
                for s in self.key_rotator.slots
            ],
        }


# ─────────────────────────────────────────
# 全局单例（应用启动时初始化）
# ─────────────────────────────────────────

key_rotator = KeyRotator()
scheduler = FairMatchScheduler(key_rotator)
