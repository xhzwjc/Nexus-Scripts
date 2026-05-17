import asyncio
import hashlib
import json
import logging
import re
from itertools import count
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

SESSION_CHANNEL_KEY_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def normalize_session_channel_key(session_token: Optional[str]) -> Optional[str]:
    token = str(session_token or "").strip()
    if not token:
        return None
    if SESSION_CHANNEL_KEY_PATTERN.fullmatch(token):
        return token
    if token.endswith("..."):
        return None
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class TaskEventBus:
    """
    全局单例事件总线。
    key = session_token (str)，value = {connection_id: asyncio.Queue}
    """
    _queues: Dict[str, Dict[int, asyncio.Queue]] = {}
    _subscription_counter = count(1)
    _loop: asyncio.AbstractEventLoop = None  # type: ignore[assignment]

    @classmethod
    def subscribe(cls, session_token: str) -> tuple[int, asyncio.Queue]:
        channel_key = normalize_session_channel_key(session_token)
        if not channel_key:
            raise ValueError("Invalid session token for TaskEventBus subscription")
        q = asyncio.Queue(maxsize=2000)
        subscription_id = next(cls._subscription_counter)
        token_queues = cls._queues.setdefault(channel_key, {})
        token_queues[subscription_id] = q
        # 保存当前 event loop，供后台线程 emit 使用
        try:
            cls._loop = asyncio.get_running_loop()
        except RuntimeError:
            pass
        return subscription_id, q

    @classmethod
    def unsubscribe(cls, session_token: str, subscription_id: int):
        channel_key = normalize_session_channel_key(session_token)
        if not channel_key:
            return
        token_queues = cls._queues.get(channel_key)
        if not token_queues:
            return
        token_queues.pop(subscription_id, None)
        if not token_queues:
            cls._queues.pop(channel_key, None)

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
        channel_key = normalize_session_channel_key(session_token)
        if not channel_key:
            logger.warning("TaskEventBus.emit skipped: invalid session token for event_type=%s", event_type)
            return
        token_queues = cls._queues.get(channel_key)
        if not token_queues:
            return
        loop = cls._get_loop()
        if loop is None:
            logger.warning("TaskEventBus.emit skipped: no event loop available for event_type=%s", event_type)
            return
        data = json.dumps({"type": event_type, **payload}, ensure_ascii=False)

        queues = list(token_queues.values())

        def _safe_put_all():
            for q in queues:
                try:
                    q.put_nowait(data)
                except asyncio.QueueFull:
                    pass

        loop.call_soon_threadsafe(_safe_put_all)

    @classmethod
    def emit_to_all(cls, event_type: str, payload: Dict[str, Any]):
        """广播给所有在线用户（如全局 batch 完成通知）"""
        for token in list(cls._queues.keys()):
            cls.emit(token, event_type, payload)
