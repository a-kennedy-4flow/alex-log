#!/usr/bin/env python3
"""Pull the weights ahead of time so the first run does not stall on a download.

    ./download.sh                          the model named in model.env
    ./download.sh mistralai/Mistral-7B-v0.3
"""
from __future__ import annotations

import os
import sys

from huggingface_hub import snapshot_download

# Many repos carry the weights a second time in a legacy or a consolidated or a
# runtime specific format. Skipping those cuts the download by half or more.
SKIP = [
    "*.pth", "*.pt", "original/*",          # the consolidated PyTorch copy
    "*.gguf",                               # the llama.cpp copy
    "*.msgpack", "*.h5", "*.tflite",        # Flax and TensorFlow copies
    "onnx/*", "*.onnx", "*.onnx_data",      # the ONNX Runtime copy
    "coreml/*", "openvino/*",               # the Apple and Intel copies
]


def main() -> int:
    repo = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("MODEL_ID")
    if not repo:
        print("give a repo id or set MODEL_ID in model.env", file=sys.stderr)
        return 2

    print(f"==> {repo} into {os.environ.get('HF_HOME', '~/.cache/huggingface')}")
    path = snapshot_download(repo_id=repo, ignore_patterns=SKIP, token=os.environ.get("HF_TOKEN"))
    print(f"==> ready at {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
