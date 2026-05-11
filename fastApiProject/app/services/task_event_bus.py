import asyncio
import json
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


class TaskEventBus:
    """
    全局单例事件总线。
    key = session_token (str)，value = asyncio.Queue
    """
    _queues: Dict[str, asyncio.Queue] = {}
    _loop: asyncio.AbstractEventLoop = None  # type: ignore[assignment]

    @classmethod
    def subscribe(cls, session_token: str) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=2000)
        cls._queues[session_token] = q
        # 保存当前 event loop，供后台线程 emit 使用
        try:
            cls._loop = asyncio.get_running_loop()
        except RuntimeError:
            pass
        return q

    @classmethod
    def unsubscribe(cls, session_token: str):
        cls._queues.pop(session_token, None)

    @classmethod
    def _get_loop(cls) -> asyncio.AbstractEventLoop | None:
        """获取保存的 event loop，优先用当前线程的 loop，fallback 到 subscribe 时保存的 loop。"""
        try:
            return asyncio.get_running_loop()
        except RuntimeError:
            loop = cls._loop
            if loop is not None and loop.is_closed():
                cls._loop = None
                return None
            return loop

    @classmethod
    def emit(cls, session_token: str, event_type: str, payload: Dict[str, Any]):
        """
        从同步代码（Worker 线程）安全地向异步 Queue 投递事件。
        使用 call_soon_threadsafe，避免跨线程写 asyncio 对象。
        """
        q = cls._queues.get(session_token)
        if q is None:
            return
        loop = cls._get_loop()
        if loop is None:
            logger.warning("TaskEventBus.emit skipped: no event loop available for event_type=%s", event_type)
            return
        data = json.dumps({"type": event_type, **payload}, ensure_ascii=False)

        def _safe_put():
            try:
                q.put_nowait(data)
            except asyncio.QueueFull:
                pass

        loop.call_soon_threadsafe(_safe_put)

    @classmethod
    def emit_to_all(cls, event_type: str, payload: Dict[str, Any]):
        """广播给所有在线用户（如全局 batch 完成通知）"""
        for token in list(cls._queues.keys()):
            cls.emit(token, event_type, payload)
