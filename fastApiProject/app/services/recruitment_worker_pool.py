import threading
import queue
import logging
from typing import Callable, Optional

logger = logging.getLogger(__name__)


class BoundedWorkerPool:
    """
    固定大小线程池。线程数始终等于 max_workers，
    任务放入内部队列排队，不会无限创建线程。
    """
    def __init__(self, max_workers: int = 20):
        self._task_queue: queue.Queue = queue.Queue()
        self._max_workers = max_workers
        self._lock = threading.Lock()
        self._active_count = 0
        # 启动固定数量的 Worker 线程，长驻后台
        for i in range(max_workers):
            t = threading.Thread(
                target=self._worker_loop,
                name=f"bounded-worker-{i}",
                daemon=True,
            )
            t.start()

    def _worker_loop(self):
        """每个 Worker 线程持续从队列取任务执行。"""
        while True:
            task_id, runner = self._task_queue.get()
            with self._lock:
                self._active_count += 1
            try:
                runner()
            except Exception as exc:
                logger.exception("Worker task %s failed: %s", task_id, exc)
            finally:
                with self._lock:
                    self._active_count -= 1
                self._task_queue.task_done()

    def submit(self, task_id: int, runner: Callable, name: str = "worker"):
        """提交任务到队列，立即返回，不创建新线程。"""
        self._task_queue.put((task_id, runner))

    @property
    def active_count(self) -> int:
        return self._active_count

    @property
    def queued_count(self) -> int:
        return self._task_queue.qsize()


_global_pool: Optional[BoundedWorkerPool] = None
_pool_lock = threading.Lock()


def get_worker_pool() -> BoundedWorkerPool:
    global _global_pool
    if _global_pool is None:
        with _pool_lock:
            if _global_pool is None:
                import os
                max_workers = int(os.environ.get("RECRUITMENT_WORKER_CONCURRENCY", "20"))
                _global_pool = BoundedWorkerPool(max_workers=max_workers)
    return _global_pool