# Running a Hugging Face model locally on a 10 GB RTX 3080

Copy this directory to your machine. Edit one file. Run one script.

Four ways to do it are built here. Because they suit different cases: a) the
transformers path is plain Python that you can edit b) vLLM is the fast server
c) llama.cpp is the only one that runs a model larger than your card d) Ollama
is the one line version of llama.cpp.

## Terms

Defined once so the rest reads cleanly.

- **VRAM** is memory on the graphics card. Yours holds 10 GB and nothing may exceed it.
- **Quantisation** stores each weight in fewer bits than the 16 it was trained in. It takes a 7B model from 15 GB down to 4.6 GB for a small loss of quality.
- **KV cache** is the working memory the model keeps per token while it answers. It grows with the context so it is the second largest claim on the card.
- **Context** is how many tokens the model holds at once.
- **GGUF** is the single file format used by llama.cpp.
- **Offload** puts the layers that do not fit into system RAM. It works and it is slow.

## Quick start

```bash
./fit.py Qwen/Qwen2.5-7B-Instruct   # will it fit. no download and no venv needed
nano model.env                      # put your repo id in MODEL_ID
./setup.sh transformers             # about 3 GB of wheels once
./check.sh                          # driver and CUDA wheel and bitsandbytes
./run_transformers.sh "Explain a B tree in three sentences."
```

That is the whole loop. Swap `MODEL_ID` for any instruct model and repeat.

Every setting in `model.env` is a default that the environment beats. So a
single run can be redirected without editing the file:

```bash
MODEL_ID="microsoft/Phi-4-mini-instruct" QUANT=fp16 ./run_transformers.sh "hello"
CTX=2048 ./serve_vllm.sh
```

## The four variants

| Variant | Reach for it when | Weights | Server |
|---|---|---|---|
| `transformers` | you want readable Python you can change | safetensors | no |
| `vllm` | you want throughput or several clients | safetensors | yes |
| `llamacpp` | the model is bigger than 10 GB | GGUF | yes |
| `ollama` | you want it working in one line | GGUF | yes |

Each installs into its own virtual environment. Because vLLM pins its own build
of PyTorch it must not share with the others.

```bash
./setup.sh transformers      # .venv-transformers
./setup.sh vllm              # .venv-vllm
./setup.sh client            # .venv-client for chat.py
./setup.sh llamacpp          # builds llama.cpp with CUDA into ./llama.cpp
./setup.sh all               # all four
```

Running them:

```bash
./run_transformers.sh "one question"    # answer then exit
./run_transformers.sh                   # chat session
./serve_vllm.sh                         # OpenAI endpoint on 127.0.0.1:8000
./serve_llamacpp.sh                     # same endpoint from a GGUF file
./run_ollama.sh                         # pulls the GGUF from Hugging Face itself
./chat.sh                               # client for either server
./download.sh                           # fetch the weights ahead of time
./check.sh                              # say why the machine is not ready
```

Each `.sh` is a two line wrapper. It loads `model.env` then calls the matching
`.py` from the right environment. Edit the Python and leave the wrappers alone.

Weights land in `~/.cache/huggingface` and are shared by every variant. Budget
about 5 GB for a 7B model at 4 bit. An interrupted GGUF pull resumes rather
than starting again.

Both servers speak the OpenAI protocol. Any tool that talks to the Claude or
OpenAI style endpoints points at `http://127.0.0.1:8000/v1` with any API key.

## What actually fits in 10 GB

| Size | fp16 | 8 bit | 4 bit | Notes |
|---|---|---|---|---|
| 1B to 3B | yes | yes | yes | run it at fp16 for full quality |
| 7B to 8B | no | tight | yes | the sweet spot for this card |
| 13B to 14B | no | no | no | 4 bit still wants about 11.7 GB |
| 20B and up | no | no | no | GGUF with offload or nothing |

Two rules cover almost every failure. First the weights and the KV cache and
about 1.2 GB of overhead must all sit inside 10 GB. Second the context is not
free. A 7B model at 8192 tokens spends 0.5 GB on cache alone. The same model at
32768 tokens spends 1.9 GB.

Run `./fit.py <repo>` before any download. It reads the parameter count and the
attention shape straight from the hub and prints the arithmetic.

## When it does not fit

Do these in order. a) Lower `CTX` in `model.env`. b) Drop `QUANT` to `4bit`.
c) Move to the GGUF path and lower `NGL` until it starts. `NGL` is the number of
layers placed on the card. A 14B model at about 80 percent on the card still
gives useful speed.

## Choosing a model

Pick a repo whose name ends in `Instruct` or `Chat`. A base model has no chat
template so it will complete your text rather than answer you.

Good starting points for this card:

- `Qwen/Qwen2.5-7B-Instruct` general work
- `Qwen/Qwen2.5-Coder-7B-Instruct` code
- `mistralai/Mistral-7B-Instruct-v0.3` small and quick
- `microsoft/Phi-4-mini-instruct` fits at fp16

Repos ending in `-AWQ` or `-GPTQ` arrive already quantised. They load faster
than `4bit` and vLLM prefers them. Repos ending in `-GGUF` are for the
llama.cpp path and the file you want inside them is usually `Q4_K_M`.

## Gated repos

Meta and a few others require you to accept a licence. Get a token from
https://huggingface.co/settings/tokens then uncomment `HF_TOKEN` in `model.env`.
A 401 from any script means this step is missing.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `CUDA out of memory` | lower `CTX` first then `QUANT` then move to GGUF |
| `no available memory for cache blocks` from vLLM | `CTX` is too high for what is left after the weights |
| generation runs at 2 tokens per second | the model went to the CPU. check `nvidia-smi` shows VRAM in use |
| `bitsandbytes` will not import | the CPU build of PyTorch got installed. run `./check.sh` then reinstall with the CUDA index in `setup.sh` |
| the reply ignores the question | a base model rather than an instruct model |
| `nvcc not found` during `setup.sh llamacpp` | `sudo apt install -y nvidia-cuda-toolkit cmake build-essential` |

## What was tested

Proven on a Linux box with Python 3.12 and huggingface_hub 1.31.

- `fit.py` against Qwen 7B and 14B and 3B and a gated repo.
- `run_transformers.py` end to end on a small model. One shot and session and
  `/reset` and `/exit` and the token rate.
- `serve_llamacpp.sh` end to end. It fetched the GGUF then served it then
  `chat.py` held a session against it over the OpenAI protocol.
- `download.py` and `check.py` and every shell script.

Two paths are unproven. Because the test machine carries a 4 GB Turing card
rather than a 10 GB Ampere one: a) the 4 bit CUDA path through bitsandbytes
b) the vLLM server. Run `./check.sh` first and it will name any wheel or driver
problem before a model download does.

## Files

| File | Purpose |
|---|---|
| `model.env` | every setting. the only file you need to edit |
| `fit.py` | VRAM arithmetic before you download anything |
| `check.py` | driver and wheel and bitsandbytes check when something breaks |
| `setup.sh` | installs one variant into its own environment |
| `run_transformers.py` | the readable Python runner with streaming |
| `serve_vllm.sh` | vLLM server |
| `serve_llamacpp.sh` | GGUF download then llama.cpp server |
| `run_ollama.sh` | Ollama against the same GGUF |
| `chat.py` | OpenAI protocol client for either server |
| `download.py` | fetch weights ahead of time |
| `*.sh` | wrappers that load `model.env` and call the matching `.py` |
