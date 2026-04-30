import asyncio
import json
from typing import Dict, Any


class TaskEventBus:
    """
    全局单例事件总线。
    key = session_token (str)，value = asyncio.Queue
    使用 weakref.WeakValueDictionary 防止内存泄漏（连接断开后 Queue 自动被 GC）
    """
    _queues: Dict[str, asyncio.Queue] = {}

    @classmethod
    def subscribe(cls, session_token: str) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=500)
        cls._queues[session_token] = q
        return q

    @classmethod
    def unsubscribe(cls, session_token: str):
        cls._queues.pop(session_token, None)

    @classmethod
    def emit(cls, session_token: str, event_type: str, payload: Dict[str, Any]):
        """
        从同步代码（Worker 线程）安全地向异步 Queue 投递事件。
        使用 call_soon_threadsafe，避免跨线程写 asyncio 对象。
        """
        q = cls._queues.get(session_token)
        if q is None:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        data = json.dumps({"type": event_type, **payload}, ensure_ascii=False)
        # put_nowait 在 maxsize 满时会抛 QueueFull，前端重连即可重新同步
        loop.call_soon_threadsafe(cls._queues[session_token].put_nowait, data)

    @classmethod
    def emit_to_all(cls, event_type: str, payload: Dict[str, Any]):
        """广播给所有在线用户（如全局 batch 完成通知）"""
        for token in list(cls._queues.keys()):
            cls.emit(token, event_type, payload)
