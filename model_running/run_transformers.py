#!/usr/bin/env python3
"""Run a Hugging Face safetensors model on one local GPU.

Reads its defaults from model.env by way of run_transformers.sh.
Give it a prompt for one answer or no prompt for a chat session.
"""
from __future__ import annotations

import argparse
import os
import sys
import threading
import time

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("prompt", nargs="*", help="one shot prompt. omit it for a chat session")
    p.add_argument("--model", default=os.environ.get("MODEL_ID", "Qwen/Qwen2.5-7B-Instruct"))
    p.add_argument("--quant", default=os.environ.get("QUANT", "4bit"), choices=["4bit", "8bit", "fp16"])
    p.add_argument("--system", default="You are a helpful assistant.")
    p.add_argument("--max-new-tokens", type=int, default=512)
    p.add_argument("--temperature", type=float, default=0.7)
    p.add_argument("--top-p", type=float, default=0.9)
    return p.parse_args()


def gpu_dtype():
    """bfloat16 on Ampere and newer. float16 on older cards that lack it."""
    if not torch.cuda.is_available():
        return torch.float32
    return torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16


def build_quant_config(quant: str, on_gpu: bool):
    """Return the bitsandbytes config for the chosen weight format."""
    if quant == "fp16" or not on_gpu:
        return None
    from transformers import BitsAndBytesConfig

    if quant == "8bit":
        return BitsAndBytesConfig(load_in_8bit=True)
    return BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",          # nf4 beats plain int4 on quality at the same size
        bnb_4bit_use_double_quant=True,     # quantises the quantisation constants for a further 0.4 GB
        bnb_4bit_compute_dtype=gpu_dtype(),
    )


def load(args):
    on_gpu = torch.cuda.is_available()
    if on_gpu:
        name = torch.cuda.get_device_name(0)
        total = torch.cuda.get_device_properties(0).total_memory / 1e9
        print(f"[gpu] {name} with {total:.1f} GB", file=sys.stderr)
    else:
        print("[gpu] no CUDA device found so this falls back to the CPU and will be slow", file=sys.stderr)

    tok = AutoTokenizer.from_pretrained(args.model)
    started = time.time()
    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        quantization_config=build_quant_config(args.quant, on_gpu),
        dtype=gpu_dtype(),
        device_map="auto" if on_gpu else None,
        low_cpu_mem_usage=True,
    )
    model.eval()
    print(f"[load] {args.model} as {args.quant} in {time.time() - started:.1f} s", file=sys.stderr)
    if on_gpu:
        print(f"[vram] weights hold {torch.cuda.memory_allocated() / 1e9:.2f} GB", file=sys.stderr)
    return tok, model


def generate(tok, model, messages, args) -> str:
    """Stream one reply to stdout and return it."""
    ids = tok.apply_chat_template(
        messages, add_generation_prompt=True, return_tensors="pt", return_dict=True
    ).to(model.device)

    streamer = TextIteratorStreamer(tok, skip_prompt=True, skip_special_tokens=True)
    kwargs = dict(
        **ids,
        streamer=streamer,
        max_new_tokens=args.max_new_tokens,
        do_sample=args.temperature > 0,
        temperature=args.temperature,
        top_p=args.top_p,
        pad_token_id=tok.pad_token_id or tok.eos_token_id,
    )
    thread = threading.Thread(target=model.generate, kwargs=kwargs)
    thread.start()

    started, pieces, count = time.time(), [], 0
    for piece in streamer:
        pieces.append(piece)
        count += 1
        print(piece, end="", flush=True)
    thread.join()
    print()

    elapsed = time.time() - started
    if elapsed > 0:
        print(f"[speed] {count / elapsed:.1f} tokens per second", file=sys.stderr)
    return "".join(pieces)


def main() -> int:
    args = parse_args()
    tok, model = load(args)

    if args.prompt:
        generate(tok, model, [
            {"role": "system", "content": args.system},
            {"role": "user", "content": " ".join(args.prompt)},
        ], args)
        return 0

    print("Chat session. /reset clears the history and /exit quits.", file=sys.stderr)
    history = [{"role": "system", "content": args.system}]
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
            history = history[:1]
            print("[history cleared]", file=sys.stderr)
            continue
        history.append({"role": "user", "content": line})
        history.append({"role": "assistant", "content": generate(tok, model, history, args)})


if __name__ == "__main__":
    sys.exit(main())
