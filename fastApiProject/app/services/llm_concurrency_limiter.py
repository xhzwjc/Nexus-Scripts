from __future__ import annotations

import asyncio
import threading
import time
from collections import deque
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Callable, Deque, Dict, Iterator, Optional


def normalize_llm_source(value: Optional[str]) -> str:
    text = str(value or "").strip()
    return text or "default"


@dataclass
class _LimiterState:
    max_concurrent: int
    max_qps: int
    active: int = 0
    condition: threading.Condition = field(default_factory=lambda: threading.Condition(threading.Lock()))
    qps_window: Deque[float] = field(default_factory=deque)
    qps_lock: threading.Lock = field(default_factory=threading.Lock)


class SharedLLMConcurrencyLimiter:
    def __init__(self) -> None:
        self._states: Dict[str, _LimiterState] = {}
        self._lock = threading.Lock()

    def _state(self, source: str, max_concurrent: int, max_qps: int) -> _LimiterState:
        source_key = normalize_llm_source(source)
        limit = max(1, int(max_concurrent or 1))
        qps = max(0, int(max_qps or 0))
        with self._lock:
            state = self._states.get(source_key)
            if state is None:
                state = _LimiterState(max_concurrent=limit, max_qps=qps)
                self._states[source_key] = state
                return state
            with state.condition:
                old_limit = state.max_concurrent
                state.max_concurrent = limit
                state.max_qps = qps
                if limit > old_limit:
                    state.condition.notify_all()
            return state

    def _wait_for_qps_sync(
        self,
        state: _LimiterState,
        cancel_check: Optional[Callable[[], None]],
    ) -> None:
        while True:
            if cancel_check:
                cancel_check()
            wait_seconds = 0.0
            with state.qps_lock:
                now = time.monotonic()
                while state.qps_window and (now - state.qps_window[0]) >= 1.0:
                    state.qps_window.popleft()
                if state.max_qps <= 0 or len(state.qps_window) < state.max_qps:
                    state.qps_window.append(now)
                    return
                wait_seconds = max(0.01, 1.0 - (now - state.qps_window[0]))
            time.sleep(min(wait_seconds, 0.25))

    async def _wait_for_qps_async(self, state: _LimiterState) -> None:
        while True:
            wait_seconds = 0.0
            with state.qps_lock:
                now = time.monotonic()
                while state.qps_window and (now - state.qps_window[0]) >= 1.0:
                    state.qps_window.popleft()
                if state.max_qps <= 0 or len(state.qps_window) < state.max_qps:
                    state.qps_window.append(now)
                    return
                wait_seconds = max(0.01, 1.0 - (now - state.qps_window[0]))
            await asyncio.sleep(min(wait_seconds, 0.25))

    def acquire_sync(
        self,
        source: str,
        *,
        max_concurrent: int,
        max_qps: int,
        cancel_check: Optional[Callable[[], None]] = None,
    ) -> None:
        state = self._state(source, max_concurrent, max_qps)
        acquired = False
        try:
            while not acquired:
                if cancel_check:
                    cancel_check()
                with state.condition:
                    if state.active < state.max_concurrent:
                        state.active += 1
                        acquired = True
                        break
                    state.condition.wait(timeout=0.25)
            self._wait_for_qps_sync(state, cancel_check)
        except BaseException:
            if acquired:
                self.release(source)
            raise

    async def acquire_async(
        self,
        source: str,
        *,
        max_concurrent: int,
        max_qps: int,
    ) -> None:
        state = self._state(source, max_concurrent, max_qps)
        acquired = False
        try:
            while not acquired:
                with state.condition:
                    if state.active < state.max_concurrent:
                        state.active += 1
                        acquired = True
                        break
                await asyncio.sleep(0.05)
            await self._wait_for_qps_async(state)
        except BaseException:
            if acquired:
                self.release(source)
            raise

    def release(self, source: str) -> None:
        source_key = normalize_llm_source(source)
        with self._lock:
            state = self._states.get(source_key)
        if state is None:
            return
        with state.condition:
            if state.active > 0:
                state.active -= 1
            state.condition.notify_all()

    @contextmanager
    def sync_slot(
        self,
        source: str,
        *,
        max_concurrent: int,
        max_qps: int,
        cancel_check: Optional[Callable[[], None]] = None,
    ) -> Iterator[None]:
        self.acquire_sync(
            source,
            max_concurrent=max_concurrent,
            max_qps=max_qps,
            cancel_check=cancel_check,
        )
        try:
            yield
        finally:
            self.release(source)


shared_llm_limiter = SharedLLMConcurrencyLimiter()
