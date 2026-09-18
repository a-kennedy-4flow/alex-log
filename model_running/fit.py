#!/usr/bin/env python3
"""Say whether a Hugging Face model fits in your VRAM before you download 15 GB.

Standard library only so it runs with plain python3 and no virtual environment.

    ./fit.py Qwen/Qwen2.5-7B-Instruct
    ./fit.py meta-llama/Llama-3.1-8B-Instruct --ctx 16384
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://huggingface.co/api/models/{}"
CONFIG = "https://huggingface.co/{}/resolve/main/config.json"

# Bytes held per weight. 4 bit is not 0.50 because bitsandbytes keeps the
# embedding and the output head in 16 bit and stores the quantisation constants.
BYTES_PER_WEIGHT = {"fp16": 2.0, "8bit": 1.06, "4bit": 0.60}

# CUDA context plus activations plus the allocator that never gives it all back.
OVERHEAD_GB = 1.2


def fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "fit.py"})
    token = os.environ.get("HF_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def model_facts(repo: str) -> tuple[float, dict]:
    """Return the parameter count and the model config."""
    try:
        cfg = fetch(CONFIG.format(repo))
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"cannot read config.json for {repo}: {exc}. A gated repo needs HF_TOKEN.")

    params = 0.0
    try:
        meta = fetch(API.format(repo)).get("safetensors") or {}
        params = float(meta.get("total") or 0)
    except urllib.error.HTTPError:
        pass

    if not params:
        # Fall back to the usual decoder arithmetic when the index is absent.
        text = cfg.get("text_config", cfg)
        h = text["hidden_size"]
        layers = text["num_hidden_layers"]
        inter = text.get("intermediate_size", 4 * h)
        vocab = text.get("vocab_size", 32000)
        params = layers * (4 * h * h + 3 * h * inter) + 2 * vocab * h

    return params, cfg


def kv_bytes_per_token(cfg: dict) -> float:
    text = cfg.get("text_config", cfg)
    layers = text["num_hidden_layers"]
    heads = text["num_attention_heads"]
    kv_heads = text.get("num_key_value_heads", heads)
    head_dim = text.get("head_dim") or text["hidden_size"] // heads
    return 2 * layers * kv_heads * head_dim * 2  # key and value at 16 bit each


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("repo", help="Hugging Face repo id")
    p.add_argument("--vram", type=float, default=10.0, help="card size in GB. default 10 for an RTX 3080")
    p.add_argument("--ctx", type=int, default=8192)
    args = p.parse_args()

    params, cfg = model_facts(args.repo)
    kv = kv_bytes_per_token(cfg) * args.ctx / 1e9

    print(f"{args.repo}")
    print(f"  parameters   {params / 1e9:.2f} B")
    print(f"  kv cache     {kv:.2f} GB at {args.ctx} tokens")
    print(f"  card         {args.vram:.1f} GB")
    print()

    best = None
    for quant, per in BYTES_PER_WEIGHT.items():
        weights = params * per / 1e9
        total = weights + kv + OVERHEAD_GB
        room = args.vram - total
        verdict = "fits" if room > 0.4 else ("tight" if room > 0 else "does not fit")
        print(f"  {quant:<5} weights {weights:5.2f} GB  total {total:5.2f} GB  {verdict}")
        if room > 0.4 and best is None:
            best = quant

    print()
    if best:
        print(f"==> set QUANT=\"{best}\" in model.env")
    else:
        need = params * BYTES_PER_WEIGHT["4bit"] / 1e9 + kv + OVERHEAD_GB
        share = max(0.0, min(1.0, (args.vram - kv - OVERHEAD_GB) / (need - kv - OVERHEAD_GB)))
        print(f"==> too big even at 4 bit which wants {need:.1f} GB")
        print(f"==> use the GGUF path and set NGL to about {int(share * 100)} percent of the layers")
        print(f"==> or drop --ctx which currently costs {kv:.2f} GB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
