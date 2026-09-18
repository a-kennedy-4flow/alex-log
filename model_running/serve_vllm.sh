#!/usr/bin/env bash
# Serve the model on an OpenAI compatible endpoint at http://127.0.0.1:$PORT/v1
# vLLM is the fastest option when the weights fit. It batches many requests at once.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./model.env; set +a

ARGS=(
  --max-model-len "$CTX"
  --gpu-memory-utilization "$GPU_MEM_UTIL"
  --port "$PORT"
  --host 127.0.0.1
  # Skips CUDA graph capture which gives back about 1 GB on a 10 GB card.
  # Delete this line for roughly 15 percent more throughput once you have room.
  --enforce-eager
)

# A repo that is already AWQ or GPTQ needs no flag because vLLM reads the config.
# Anything else is squeezed on the fly by bitsandbytes which is correct but slower.
case "$MODEL_ID:$QUANT" in
  *AWQ*|*awq*|*GPTQ*|*gptq*) ;;
  *:4bit) ARGS+=(--quantization bitsandbytes) ;;
  *:8bit) echo "!! vLLM has no 8 bit bitsandbytes path. Use 4bit or an AWQ repo." >&2; exit 2 ;;
esac

echo "==> serving $MODEL_ID at http://127.0.0.1:$PORT/v1"
echo "==> test it with: ./chat.py"
exec .venv-vllm/bin/vllm serve "$MODEL_ID" "${ARGS[@]}"
