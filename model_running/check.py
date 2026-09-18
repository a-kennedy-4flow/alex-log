#!/usr/bin/env python3
"""Tell you whether the machine is ready before you blame the model."""
from __future__ import annotations

import shutil
import subprocess
import sys


def line(label: str, value: str) -> None:
    print(f"  {label:<22} {value}")


def main() -> int:
    problems = []

    if shutil.which("nvidia-smi"):
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,driver_version",
             "--format=csv,noheader"], capture_output=True, text=True).stdout.strip()
        line("driver", out or "nvidia-smi gave nothing back")
    else:
        line("driver", "nvidia-smi missing")
        problems.append("install the NVIDIA driver")

    try:
        import torch
    except ImportError:
        line("torch", "not installed")
        print("\n==> run ./setup.sh transformers")
        return 1

    line("torch", torch.__version__)
    line("torch cuda build", torch.version.cuda or "none which means a CPU only wheel")
    if not torch.version.cuda:
        problems.append("reinstall torch from the CUDA index in setup.sh")

    if torch.cuda.is_available():
        props = torch.cuda.get_device_properties(0)
        line("device", f"{props.name} with {props.total_memory / 1e9:.1f} GB")
        line("compute capability", f"{props.major}.{props.minor}")
        line("bfloat16", "yes" if torch.cuda.is_bf16_supported() else "no so float16 is used")
        free, total = torch.cuda.mem_get_info()
        line("free right now", f"{free / 1e9:.1f} GB of {total / 1e9:.1f} GB")
        if free / total < 0.8:
            problems.append("another process is holding VRAM. check nvidia-smi")
    else:
        line("device", "torch cannot see a GPU")
        problems.append("torch cannot see the card. a driver or a wheel mismatch")

    try:
        import bitsandbytes
        line("bitsandbytes", bitsandbytes.__version__)
    except Exception as exc:  # noqa: BLE001 - it fails in many ways
        line("bitsandbytes", f"broken: {exc}")
        problems.append("4bit and 8bit will not work until bitsandbytes imports")

    if problems:
        print("\n==> fix these:")
        for p in problems:
            print(f"    - {p}")
        return 1

    print("\n==> ready")
    return 0


if __name__ == "__main__":
    sys.exit(main())
