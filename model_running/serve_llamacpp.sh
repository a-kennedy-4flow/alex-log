#!/usr/bin/env bash
# Serve a GGUF file on an OpenAI compatible endpoint at http://127.0.0.1:$PORT/v1
# This is the option that still works when the model is larger than the card.
# Layers past $NGL stay in system RAM so a 14B model runs on 10 GB at reduced speed.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./model.env; set +a

mkdir -p models
TARGET="models/$GGUF_FILE"

if [ ! -f "$TARGET" ]; then
  URL="https://huggingface.co/$GGUF_REPO/resolve/main/$GGUF_FILE?download=true"
  echo "==> fetching $GGUF_FILE"
  AUTH=()
  [ -n "${HF_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $HF_TOKEN")
  # -C - resumes a part file so an interrupted 5 GB pull is not repeated.
  curl -L --fail -C - --progress-bar "${AUTH[@]}" -o "$TARGET.part" "$URL"
  mv "$TARGET.part" "$TARGET"
fi

echo "==> serving $TARGET at http://127.0.0.1:$PORT/v1"
echo "==> test it with: ./chat.py"
exec llama.cpp/build/bin/llama-server \
  -m "$TARGET" \
  -ngl "$NGL" \
  -c "$CTX" \
  --host 127.0.0.1 \
  --port "$PORT" \
  --jinja
