"""The throttled client."""

import gzip
import json
import urllib.error

import pytest

from dmscrape import client as client_module
from dmscrape.client import Cache, Client, FetchError, _decoded


class FakeResponse:
    def __init__(self, body, encoding=""):
        self._body = body
        self.headers = {"Content-Encoding": encoding} if encoding else {}

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *unused):
        return False


class Dial:
    """Stands in for the clock so a test never waits."""

    def __init__(self):
        self.now = 0.0
        self.slept = []

    def sleep(self, seconds):
        self.slept.append(seconds)
        self.now += seconds

    def clock(self):
        return self.now


def answers(monkeypatch, *replies):
    """Hand the client one reply per call."""
    queue = list(replies)
    calls = []

    def fake_urlopen(request, timeout=None):
        calls.append(request.full_url)
        reply = queue.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply

    monkeypatch.setattr(client_module.urllib.request, "urlopen", fake_urlopen)
    return calls


def refusal(code):
    return urllib.error.HTTPError("https://example.invalid", code, "no", {}, None)


def test_reads_plain_json(monkeypatch):
    answers(monkeypatch, FakeResponse(b'{"a": 1}'))
    assert Client(gap=0).get_json("https://example.invalid/a") == {"a": 1}


def test_undoes_gzip(monkeypatch):
    answers(monkeypatch, FakeResponse(gzip.compress(b'{"a": 2}'), "gzip"))
    assert Client(gap=0).get_json("https://example.invalid/a") == {"a": 2}


def test_leaves_an_unencoded_body_alone():
    assert _decoded(b"plain", "") == b"plain"


def test_waits_longer_after_each_refusal(monkeypatch):
    dial = Dial()
    answers(monkeypatch, refusal(429), refusal(429), FakeResponse(b'{"ok": true}'))
    client = Client(gap=1.0, sleep=dial.sleep, clock=dial.clock)
    monkeypatch.setattr(client_module.random, "uniform", lambda low, high: 0.0)
    assert client.get_json("https://example.invalid/a") == {"ok": True}
    assert client.retries == 2
    assert dial.slept == [1.0, 2.0]


def test_honours_a_retry_after_header(monkeypatch):
    dial = Dial()
    error = urllib.error.HTTPError("https://example.invalid", 429, "no", {"Retry-After": "7"}, None)
    answers(monkeypatch, error, FakeResponse(b"{}"))
    client = Client(gap=1.0, sleep=dial.sleep, clock=dial.clock)
    client.get_json("https://example.invalid/a")
    assert 7.0 in dial.slept


def test_gives_up_after_the_last_attempt(monkeypatch):
    dial = Dial()
    answers(monkeypatch, refusal(503), refusal(503))
    client = Client(gap=0.0, tries=2, sleep=dial.sleep, clock=dial.clock)
    with pytest.raises(FetchError) as raised:
        client.get_json("https://example.invalid/a")
    assert raised.value.status == 503


def test_does_not_retry_a_refusal_that_will_not_change(monkeypatch):
    calls = answers(monkeypatch, refusal(404))
    with pytest.raises(FetchError):
        Client(gap=0.0).get_json("https://example.invalid/a")
    assert len(calls) == 1


def test_keeps_the_gap_between_requests(monkeypatch):
    dial = Dial()
    answers(monkeypatch, FakeResponse(b"{}"), FakeResponse(b"{}"))
    client = Client(gap=2.0, sleep=dial.sleep, clock=dial.clock)
    client.get_json("https://example.invalid/a")
    client.get_json("https://example.invalid/b")
    assert dial.slept == [2.0]


def test_a_cached_url_is_asked_for_once(monkeypatch, tmp_path):
    calls = answers(monkeypatch, FakeResponse(b'{"a": 3}'))
    client = Client(gap=0.0, cache=Cache(tmp_path))
    assert client.get_json("https://example.invalid/a") == {"a": 3}
    assert client.get_json("https://example.invalid/a") == {"a": 3}
    assert len(calls) == 1
    assert client.hits == 1


def test_the_cache_holds_the_decoded_body(monkeypatch, tmp_path):
    answers(monkeypatch, FakeResponse(gzip.compress(b'{"a": 4}'), "gzip"))
    cache = Cache(tmp_path)
    Client(gap=0.0, cache=cache).get_json("https://example.invalid/a")
    assert json.loads(cache.read("https://example.invalid/a")) == {"a": 4}
