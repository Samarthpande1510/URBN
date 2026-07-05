"""
Simple in-process SSE broadcaster.
All connected clients get a "products_updated" event whenever any product changes.
"""
import asyncio
from typing import AsyncIterator

_listeners: list[asyncio.Queue] = []


def broadcast():
    """Call this from any synchronous route after a product mutation."""
    for q in _listeners:
        try:
            q.put_nowait("products_updated")
        except asyncio.QueueFull:
            pass


async def event_stream() -> AsyncIterator[dict]:
    q: asyncio.Queue = asyncio.Queue(maxsize=20)
    _listeners.append(q)
    try:
        while True:
            event = await asyncio.wait_for(q.get(), timeout=25)
            yield {"event": event, "data": "1"}
    except (asyncio.TimeoutError, asyncio.CancelledError):
        # TimeoutError → send keepalive comment; CancelledError → client disconnected
        if isinstance(asyncio.current_task(), asyncio.Task):
            pass
        raise
    finally:
        _listeners.remove(q)


async def keepalive_stream() -> AsyncIterator[dict]:
    """Wraps event_stream with periodic keepalive pings so proxies don't close the connection."""
    q: asyncio.Queue = asyncio.Queue(maxsize=20)
    _listeners.append(q)
    try:
        while True:
            try:
                event = await asyncio.wait_for(q.get(), timeout=20)
                yield {"event": event, "data": "1"}
            except asyncio.TimeoutError:
                yield {"event": "ping", "data": ""}
    finally:
        if q in _listeners:
            _listeners.remove(q)
