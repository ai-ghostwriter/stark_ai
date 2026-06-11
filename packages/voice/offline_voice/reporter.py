from __future__ import annotations

from collections.abc import Callable
from typing import Protocol


class StatusReporter(Protocol):
    def __call__(self, message: str) -> None: ...


class ConsoleStatusReporter:
    def __init__(self, *, prefix: str = "[status]") -> None:
        self.prefix = prefix

    def __call__(self, message: str) -> None:
        print(f"{self.prefix} {message}", flush=True)


def noop_reporter(_message: str) -> None:
    return


def coerce_reporter(reporter: StatusReporter | Callable[[str], None] | None) -> StatusReporter:
    if reporter is None:
        return ConsoleStatusReporter()
    return reporter
