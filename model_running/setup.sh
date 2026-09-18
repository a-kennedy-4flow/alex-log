#!/usr/bin/env bash
# Install one variant into its own virtual environment.
# Usage: ./setup.sh transformers | vllm | llamacpp | client | all
set -euo pipefail
cd "$(dirname "$0")"

# CUDA wheel series for an Ampere card such as the RTX 3080.
TORCH_INDEX="https://download.pytorch.org/whl/cu124"

have() { command -v "$1" >/dev/null 2>&1; }

venv() {
  local name="$1"
  if [ ! -d ".venv-$name" ]; then
    python3 -m venv ".venv-$name"
  fi
  # shellcheck disable=SC1090
  . ".venv-$name/bin/activate"
  pip install --quiet --upgrade pip wheel
}

setup_transformers() {
  echo "==> transformers into .venv-transformers"
  venv transformers
  pip install --index-url "$TORCH_INDEX" torch
  pip install "transformers>=4.44" accelerate bitsandbytes sentencepiece protobuf \
              "huggingface_hub[cli]"
  deactivate
  echo "==> done. run: ./run_transformers.sh 'your prompt'"
}

setup_vllm() {
  echo "==> vLLM into .venv-vllm"
  venv vllm
  # vLLM pins its own CUDA build of torch so it must not share the venv above.
  pip install vllm "huggingface_hub[cli]"
  deactivate
  echo "==> done. run: ./serve_vllm.sh"
}

setup_client() {
  echo "==> OpenAI client into .venv-client"
  venv client
  pip install openai
  deactivate
  echo "==> done. run: ./chat.py once a server is up"
}

setup_llamacpp() {
  echo "==> llama.cpp built with CUDA into ./llama.cpp"
  if ! have nvcc; then
    echo "!! nvcc is missing so the build would fall back to CPU only."
    echo "!! Install it first:  sudo apt install -y nvidia-cuda-toolkit cmake build-essential git"
    echo "!! Then run this again."
    exit 1
  fi
  if [ ! -d llama.cpp ]; then
    git clone --depth 1 https://github.com/ggml-org/llama.cpp
  fi
  cmake -S llama.cpp -B llama.cpp/build -DGGML_CUDA=ON -DLLAMA_CURL=OFF \
        -DCMAKE_BUILD_TYPE=Release -DCMAKE_CUDA_ARCHITECTURES=86
  cmake --build llama.cpp/build --config Release -j "$(nproc)" \
        --target llama-server llama-cli
  # The GGUF download uses the same hub tooling as everything else.
  venv transformers >/dev/null 2>&1 || true
  echo "==> done. run: ./serve_llamacpp.sh"
}

case "${1:-}" in
  transformers) setup_transformers ;;
  vllm)         setup_vllm ;;
  client)       setup_client ;;
  llamacpp)     setup_llamacpp ;;
  all)          setup_transformers; setup_client; setup_vllm; setup_llamacpp ;;
  *) echo "Usage: ./setup.sh transformers | vllm | llamacpp | client | all"; exit 2 ;;
esac
