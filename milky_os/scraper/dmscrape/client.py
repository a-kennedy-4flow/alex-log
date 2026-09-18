"""Throttled JSON access to the dm services."""

from __future__ import annotations

import gzip
import hashlib
import json
import random
import time
import zlib
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
DEFAULT_HEADERS = {
    "accept": "application/json",
    "accept-encoding": "gzip, deflate",
    "accept-language": "de-DE,de;q=0.9",
    "user-agent": USER_AGENT,
    "referer": "https://www.dm.de/",
}
RETRY_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})
DEFAULT_GAP = 1.0
DEFAULT_TRIES = 6
DEFAULT_TIMEOUT = 30.0


class FetchError(RuntimeError):
    """The service refused a URL and retrying did not help."""

    def __init__(self, url: str, reason: str, status: int | None = None) -> None:
        super().__init__(f"{url} -> {reason}")
        self.url = url
        self.reason = reason
        self.status = status


def _decoded(body: bytes, encoding: str) -> bytes:
    """Undo the transfer encoding the service chose.

    Because a) the product service answers gzip whatever the request asked for b) urllib
    hands back the compressed bytes untouched c) deflate arrives wrapped or raw so both
    forms are tried.
    """
    name = encoding.strip().lower()
    if name == "gzip":
        return gzip.decompress(body)
    if name == "deflate":
        try:
            return zlib.decompress(body)
        except zlib.error:
            return zlib.decompress(body, -zlib.MAX_WBITS)
    return body


class Cache:
    """Keeps one response body per URL on disk."""

    def __init__(self, directory: Path) -> None:
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)

    def path_for(self, url: str) -> Path:
        digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]
        return self.directory / f"{digest}.json"

    def read(self, url: str) -> bytes | None:
        path = self.path_for(url)
        return path.read_bytes() if path.exists() else None

    def write(self, url: str, body: bytes) -> None:
        self.path_for(url).write_bytes(body)


class Client:
    """Fetches JSON at a pace the service tolerates.

    Because a) the search service answers 429 without a Retry-After header b) a fixed
    gap alone still trips it after a burst c) each refusal doubles the wait until the
    window has moved on.
    """

    def __init__(
        self,
        gap: float = DEFAULT_GAP,
        tries: int = DEFAULT_TRIES,
        timeout: float = DEFAULT_TIMEOUT,
        cache: Cache | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.gap = gap
        self.tries = max(1, tries)
        self.timeout = timeout
        self.cache = cache
        self._sleep = sleep
        self._clock = clock
        self._last: float | None = None
        self.requests = 0
        self.hits = 0
        self.retries = 0

    def get_json(self, url: str) -> Any:
        return json.loads(self.get_bytes(url))

    def get_text(self, url: str, headers: dict[str, str] | None = None) -> str:
        """Read one page as text.

        Because a) a price only reaches the page of a shop that publishes no JSON service
        b) that page still carries the figure inside a script block c) the body is decoded
        once here so every source parses a string.
        """
        return self.get_bytes(url, headers).decode("utf-8", "replace")

    def get_bytes(self, url: str, headers: dict[str, str] | None = None) -> bytes:
        cached = self.cache.read(url) if self.cache else None
        if cached is not None:
            self.hits += 1
            return cached
        body = self._fetch(url, headers)
        if self.cache:
            self.cache.write(url, body)
        return body

    def _fetch(self, url: str, headers: dict[str, str] | None = None) -> bytes:
        last = "no attempt was made"
        status: int | None = None
        for attempt in range(self.tries):
            self._pace()
            try:
                return self._read(url, headers)
            except urllib.error.HTTPError as error:
                status = error.code
                last = f"HTTP {error.code}"
                if error.code not in RETRY_STATUS:
                    raise FetchError(url, last, error.code) from error
                pause = self._pause_for(error, attempt)
            except (urllib.error.URLError, TimeoutError, OSError) as error:
                status = None
                last = str(error)
                pause = self._backoff(attempt)
            if attempt == self.tries - 1:
                break
            self.retries += 1
            self._sleep(pause)
        raise FetchError(url, f"{last} after {self.tries} attempts", status)

    def _read(self, url: str, headers: dict[str, str] | None = None) -> bytes:
        sent = dict(DEFAULT_HEADERS)
        sent.update(headers or {})
        request = urllib.request.Request(url, headers=sent)
        self.requests += 1
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            return _decoded(response.read(), response.headers.get("Content-Encoding", ""))

    def _pace(self) -> None:
        """Hold back until the gap since the last request has passed."""
        if self._last is not None:
            waited = self._clock() - self._last
            if waited < self.gap:
                self._sleep(self.gap - waited)
        self._last = self._clock()

    def _pause_for(self, error: urllib.error.HTTPError, attempt: int) -> float:
        header = error.headers.get("Retry-After") if error.headers else None
        if header:
            try:
                return max(0.0, float(header))
            except ValueError:
                pass
        return self._backoff(attempt)

    def _backoff(self, attempt: int) -> float:
        return self.gap * (2**attempt) + random.uniform(0.0, self.gap)
