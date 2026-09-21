# Models

## Registry
At boot, `infra/models/manifest.yaml` is loaded into the `models` table. Each entry has these fields:
- id, role (router|general|coder|vision|embed|rerank), endpoint
- gguf_path, mmproj_path?, sha256
- ctx_len, capabilities[tools,vision,json_schema], vram_mb
- license, origin, enabled

The admin UI shows license and origin, and admins can allowlist models by origin.

## Reference build: one 16–24 GB GPU, no swapping in Stage A
| endpoint | roles | model class | quant | est. VRAM |
|---|---|---|---|---|
| llm-small | router, simple chat | 3–4B instruct | Q4_K_M | 2.5–3.5 GB |
| llm-main | general, doc_qa, vision, coder | multimodal instruct + mmproj, ~8B on 16 GB, ~12B on 24 GB | Q4_K_M | 7–11 GB at 16k ctx |
| llm-embed | embed | bge-m3-class, multilingual | Q8_0 | ~1 GB |
| llm-rerank | rerank | bge-reranker-v2-m3-class | Q8_0 | ~1 GB |

- The VRAM figures are estimates. Measure them in A1.
- Pick current open-weight GGUFs at build time.
- The role-to-endpoint mapping is config only. B4 adds a llama-swap slot on 24 GB cards without code changes.

## Gateway
File: `apps/api/src/models/gateway.ts`
- Exposes `chat({role,messages,tools?,jsonSchema?,stream,budget})`, `embed`, `rerank`, and `tokenize`. `tokenize` uses llama-server `/tokenize`.
- Every call checks policy and writes a span.
- Per-endpoint concurrency equals llama-server's `--parallel`.
- Calls have timeouts and retry with backoff on 5xx, behind a circuit breaker.
- Emits a `status` event on cold start or model swap.
- JSON responses: request `response_format` json_schema, validate with Zod, allow 1 repair retry, then fall back deterministically.