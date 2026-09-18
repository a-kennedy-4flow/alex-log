#!/usr/bin/env bash
# The shortest path of all. Ollama pulls the same GGUF straight from Hugging Face.
# Install it once with: curl -fsSL https://ollama.com/install.sh | sh
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./model.env; set +a

# bartowski/Qwen2.5-7B-Instruct-GGUF + Qwen2.5-7B-Instruct-Q4_K_M.gguf -> hf.co/bartowski/...:Q4_K_M
TAG="$(echo "$GGUF_FILE" | sed -E 's/.*-(IQ[0-9].*|Q[0-9].*|BF16|F16|F32)\.gguf$/\1/')"
REF="hf.co/$GGUF_REPO:$TAG"

echo "==> running $REF"
exec ollama run "$REF"
