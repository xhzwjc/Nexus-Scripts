from __future__ import annotations

from dataclasses import dataclass, field
from threading import Event, Lock
from typing import Callable, Dict, Optional


class RecruitmentTaskCancelled(RuntimeError):
    """Raised when an in-flight recruitment AI task is cancelled by the user."""


@dataclass
class RecruitmentTaskControl:
    task_id: int
    _cancel_event: Event = field(default_factory=Event)
    _lock: Lock = field(default_factory=Lock)
    _closers: list[Callable[[], None]] = field(default_factory=list)

    def register_closer(self, closer: Callable[[], None]) -> None:
        if not callable(closer):
            return
        with self._lock:
            if self._cancel_event.is_set():
                try:
                    closer()
                except Exception:
                    pass
                return
            self._closers.append(closer)

    def cancel(self) -> None:
        closers: list[Callable[[], None]] = []
        with self._lock:
            if self._cancel_event.is_set():
                return
            self._cancel_event.set()
            closers = list(self._closers)
            self._closers.clear()
        for closer in closers:
            try:
                closer()
            except Exception:
                continue

    def is_cancelled(self) -> bool:
        return self._cancel_event.is_set()

    def wait(self, timeout: float) -> bool:
        return self._cancel_event.wait(timeout)

    def raise_if_cancelled(self, message: str = "任务已被用户停止。") -> None:
        if self.is_cancelled():
            raise RecruitmentTaskCancelled(message)


class RecruitmentTaskRegistry:
    def __init__(self) -> None:
        self._lock = Lock()
        self._controls: Dict[int, RecruitmentTaskControl] = {}

    def register(self, task_id: int, control: RecruitmentTaskControl) -> None:
        with self._lock:
            self._controls[task_id] = control

    def pop(self, task_id: int) -> Optional[RecruitmentTaskControl]:
        with self._lock:
            return self._controls.pop(task_id, None)

    def get(self, task_id: int) -> Optional[RecruitmentTaskControl]:
        with self._lock:
            return self._controls.get(task_id)


recruitment_task_registry = RecruitmentTaskRegistry()
