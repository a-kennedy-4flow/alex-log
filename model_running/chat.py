#!/usr/bin/env python3
"""Talk to whichever server is running on $PORT.

vLLM and llama.cpp both speak the OpenAI protocol so this one client drives
either of them. The same three lines work from any other language.

    ./chat.py                     chat session
    ./chat.py summarise this      one question
"""
from __future__ import annotations

import os
import sys

from openai import OpenAI

BASE = f"http://127.0.0.1:{os.environ.get('PORT', '8000')}/v1"


def main() -> int:
    client = OpenAI(base_url=BASE, api_key="not-needed")

    try:
        model = client.models.list().data[0].id
    except Exception as exc:  # noqa: BLE001 - any failure here means no server
        print(f"no server at {BASE}: {exc}", file=sys.stderr)
        print("start one with ./serve_vllm.sh or ./serve_llamacpp.sh", file=sys.stderr)
        return 1

    print(f"[server] {model} at {BASE}", file=sys.stderr)
    history = [{"role": "system", "content": "You are a helpful assistant."}]

    def ask(question: str) -> None:
        history.append({"role": "user", "content": question})
        stream = client.chat.completions.create(
            model=model, messages=history, stream=True, temperature=0.7, max_tokens=1024
        )
        pieces = []
        for chunk in stream:
            piece = chunk.choices[0].delta.content or ""
            pieces.append(piece)
            print(piece, end="", flush=True)
        print()
        history.append({"role": "assistant", "content": "".join(pieces)})

    if len(sys.argv) > 1:
        ask(" ".join(sys.argv[1:]))
        return 0

    print("/reset clears the history and /exit quits.", file=sys.stderr)
    while True:
        try:
            line = input("\n> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if not line:
            continue
        if line == "/exit":
            return 0
        if line == "/reset":
            del history[1:]
            print("[history cleared]", file=sys.stderr)
            continue
        ask(line)


if __name__ == "__main__":
    sys.exit(main())
