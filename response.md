# SIH 2026 — Idea Submission Responses

Problem Statement: *Sovereign On-Premise Agentic AI Workbench using Open-Weight
Multimodal LLMs for Confidential Industrial Work*

Copy each block below into the matching field on the submission form.

---

## 1. Idea Title
*(Max 100 characters — this fits in 86)*

```
OpeX — Sovereign On-Prem Agentic AI Workbench for Confidential Industrial Documents
```

---

## 2. Technology Bucket
*(Dropdown selection)*

```
AI/ML, Cloud Computing, Blockchain
```

Rationale: OpeX is fundamentally an agentic AI / multimodal-LLM system. There is
no dedicated "on-prem AI" bucket, so the AI/ML option is the correct fit even
though the deployment is on-premise rather than cloud.

---

## 3. Abstract / Summary
*(Max 10000 characters)*

```
OpeX is an offline, on-premise agentic AI workbench that lets engineers and
analysts work with confidential industrial documents — pump manuals, inspection
reports, P&ID diagrams, downtime logs, safety circulars — using open-weight
multimodal LLMs that run entirely inside the customer's own network. Nothing
leaves the room: there is no runtime internet egress, no telemetry, and no CDN
assets. All models are served locally through llama.cpp (llama-server), and each
model is pinned to a SHA-256 hash so only verified, audited weights ever load.

The core problem OpeX solves is that industrial and defence-adjacent
organisations cannot send confidential drawings, SOPs, or failure data to a
public cloud LLM, yet they still need modern AI assistance: answering questions
from scanned manuals, reading tables and diagrams, analysing CSV downtime data,
generating charts, and drafting or running code — all with a verifiable audit
trail and strict access control.

OpeX delivers this with a purpose-built agentic loop (no LangChain). A small
router model classifies each request and dispatches it to one of several agents
(general chat, document Q&A, vision, data analysis, code, files). Document Q&A
uses hybrid retrieval — dense vectors (pgvector HNSW, cosine) fused with
Postgres full-text search via Reciprocal Rank Fusion, then reranked — and
answers with inline [n] citations that highlight the exact page and bounding box
in the source document. Crucially, access-control and classification filters
live inside the retrieval SQL itself, never as an after-the-fact filter, so a
user can never even retrieve a chunk above their clearance. A citation-checking
verifier confirms every claim maps to a real retrieved chunk; if support is weak,
OpeX says it found no support rather than hallucinating from model knowledge.

Ingestion runs on CPU via Docling: it parses PDF/DOCX/PPTX/XLSX/CSV/HTML/images,
OCRs scanned pages in English + Hindi, captions figures with the vision model,
and chunks by layout (400–600 tokens, ~15% overlap, tables kept whole). Every
chunk inherits its source's classification and ACL groups. A prompt-injection
heuristic flags suspicious document text, which is shown with a warning and
treated as untrusted — document, OCR, tool, and web text never enter system
prompts.

Beyond retrieval, OpeX runs generated Python in a locked-down sandbox-runner
(the only Docker-socket user: --network none, read-only FS, dropped
capabilities, no-new-privileges, memory/CPU/pids limits) to analyse data and
draw charts, and it can generate images locally (DreamShaper 8 LCM, ~11 s per
image on an M4). A layered memory system (working summary + long-term episodic
and semantic memory) lets a preference stated in one chat carry into another,
while memory from Restricted sources never reaches an uncleared user.

Every LLM, retrieval, memory, tool, and policy action writes a span with tokens,
latency, and status, and every governance action is recorded in an append-only,
hash-chained audit log. A full evaluation harness measures retrieval recall,
answer correctness and citation precision, ACL-leak count (target 0), prompt-
injection success (target 0), router accuracy, sandbox-escape containment, and
latency percentiles.

The prototype already runs end-to-end with the network physically unplugged:
document questions return cited answers, an uncleared user is correctly denied a
Restricted document, and the timeline shows the router switching between the
small and main models — all in under ~10 seconds per step on a single 16–24 GB
GPU. OpeX brings cloud-grade agentic AI to environments where the cloud is not
an option.
```

---

## 4. Idea Description
*(Max 50000 characters)*

```
=====================================================================
OpeX — Sovereign On-Premise Agentic AI Workbench
=====================================================================

1. THE PROBLEM
---------------------------------------------------------------------
Industrial, defence, energy, and manufacturing organisations sit on large
archives of confidential documents: equipment manuals with torque tables,
scanned inspection reports, P&ID process diagrams, downtime and failure CSV
logs, multilingual safety circulars, and restricted design documents. Modern
LLM assistants would be transformative for this work — answering "what is the
bolt torque for the 200mm flange on pump P-14?" from a scanned manual, or
"draw a Pareto chart of last quarter's downtime causes" — but these documents
CANNOT be sent to a public cloud LLM. The data is confidential, often
export-controlled or safety-critical, and the organisations are frequently on
air-gapped or heavily restricted networks.

Existing SaaS AI tools assume internet egress, phone-home telemetry, and CDN-
served assets. None of that is acceptable here. What these teams need is a
sovereign, self-hosted, agentic AI workbench that runs entirely on their own
hardware, with verifiable guarantees that nothing leaves the room, strict
per-document access control, and a complete audit trail.

2. THE SOLUTION: OpeX
---------------------------------------------------------------------
OpeX is a fully offline, on-premise agentic AI workbench built around open-
weight multimodal LLMs served locally via llama.cpp. It is designed from the
ground up around a set of hard invariants that are never weakened:

  - No runtime egress. Core Docker networks are internal-only. Only an optional
    egress-gateway (off by default) can ever reach out.
  - No telemetry and no CDN assets anywhere. Every asset — fonts, icons, the
    pdf.js worker — is bundled.
  - Models load only from a local models/ directory and must match the SHA-256
    hash pinned in a signed manifest.
  - Access-control (ACL) and classification filters live INSIDE the retrieval
    SQL, never as an after-the-fact filter.
  - Document, OCR, tool, and web text is untrusted: it goes in clearly labeled
    blocks inside user content, never in system prompts.
  - Every LLM, retrieval, memory, tool, and policy action writes an
    observability span with tokens, latency, and status.
  - The audit log is append-only, enforced by a database trigger, with a
    SHA-256 hash chain.
  - Generated code runs ONLY via a sandbox-runner, the single Docker-socket
    user.
  - Derived data (chunks, memories, summaries, artifacts) inherits the highest
    classification of its sources.
  - Once a task touches Confidential+ data, outbound tools are disabled for
    that task.

3. ARCHITECTURE
---------------------------------------------------------------------
Stack: React + TypeScript + Vite (web) · Express 5 + TypeScript, Zod, Drizzle
(API) · Python FastAPI + Docling (ingestion, CPU) · Postgres 16 with pgvector
and full-text search (also the job queue) · llama-server for all models ·
Docker Compose. The agent loop is our own — deliberately NOT LangChain — for
full control over policy, tainting, and observability.

Services (all containerised):
  - web        : static build, strict CSP, all assets bundled (edge network)
  - api        : the only service users reach (edge + core)
  - postgres   : pgvector image (core, internal)
  - llm-small  : router + simple chat (3–4B instruct, Q4_K_M)
  - llm-main   : general, doc_qa, vision, coder (multimodal ~8–12B + mmproj)
  - llm-embed  : embeddings (bge-m3 class, multilingual)
  - llm-rerank : reranker (bge-reranker-v2-m3 class, optional)
  - ingest     : Python worker polling the jobs table
  - sandbox-runner : the only Docker-socket user; runs generated code
  - egress-gateway : off by default, allowlisted + DLP + audited (B6)

The reference hardware target is a single 16–24 GB GPU with no model swapping in
the prototype stage. Model role-to-endpoint mapping is pure configuration; a
larger box can add a llama-swap slot without any code change.

Request lifecycle:
  1. Authentication and can() authorisation.
  2. Input guardrails: size, quota, policy, injection heuristic.
  3. The router produces a RouteDecision.
  4. Simple tasks go to one agent; multi_step tasks go to a planner.
  5. The context builder assembles context within strict token budgets.
  6. The executor runs tools, up to 8 iterations.
  7. The verifier checks the result, with at most 2 revisions.
  8. Output guardrails: DLP, a classification label, and citation validation.
  9. Stream the result over SSE, close the trace, enqueue memory jobs.

4. DOCUMENT INGESTION AND CHUNKING
---------------------------------------------------------------------
Ingestion is a Python worker (services/ingest) that runs entirely on CPU so it
never contends with the GPU serving models:

  1. Upload through the API. Magic-byte and size checks, dedupe by SHA-256.
     Files stored at data/files/{workspace}/{sha}. Classification comes from the
     uploader, defaulting to the project's.
  2. Parse with Docling. Supported inputs: PDF, DOCX, PPTX, XLSX/CSV, HTML, and
     images. Extract text blocks with page and bounding box, tables as a grid
     plus markdown, and figure crops.
  3. OCR scanned pages with Tesseract (eng+hin) for English + Hindi documents.
  4. Caption each figure with the vision model (llm-main) at low priority; the
     caption is stored as a figure_caption chunk linked to its crop.
  5. CHUNK BY LAYOUT: 400–600 tokens with ~15% overlap. Each table gets its own
     chunk, and the header row repeats when a table has to be split across
     chunks. Every chunk keeps page, bbox, section_path, and kind.
  6. Copy workspace_id, project_id, classification, and acl_group_ids onto every
     chunk — classification is carried at the chunk level so retrieval can
     filter in SQL.
  7. Embed in batches. Build the full-text tsv with to_tsvector('simple', ...),
     because the 'english' config breaks Hindi stemming.
  8. Run the injection heuristic. A match sets suspicious=true: the chunk stays
     retrievable but is shown with a warning and treated as untrusted.
  9. Set status=ready and emit a progress event per page.

Jobs run from a Postgres jobs table using FOR UPDATE SKIP LOCKED, with retries
and a dead-letter state — Postgres is the queue, so there is no extra broker to
deploy or secure.

5. RETRIEVAL (HYBRID + ACL-IN-SQL)
---------------------------------------------------------------------
The retrieval pipeline (apps/api/src/retrieval) is where confidentiality is
enforced and where answer quality is won:

  1. Take vector top-k (pgvector HNSW, cosine distance) and FTS top-k
     (websearch_to_tsquery).
  2. Fuse the two ranked lists with Reciprocal Rank Fusion (RRF, k=60).
  3. Rerank the top 30 candidates and keep the best 6–8.

Every single query carries the access predicate INLINE:
  workspace_id = $w
  AND project_id = ANY($p)
  AND classification <= $clearance
  AND (acl_group_ids && $groups OR acl_group_ids = '{}')
plus any unexpired access_grants.

Because this filter is part of the SQL WHERE clause, an uncleared user cannot
even retrieve a chunk above their clearance — there is no window in which
sensitive text exists in memory and is filtered out later. This is the single
most important design decision for confidentiality.

hnsw.iterative_scan is set to relaxed_order (pgvector >= 0.8) so filtered vector
queries still return a full k rows. Each [n] citation marker maps to a document,
page, and bounding box, and the viewer highlights that bbox. If the best rerank
score is below a threshold, doc_qa explicitly says it found no support and does
NOT answer from model knowledge — refusing to hallucinate is a feature.

6. THE AGENTIC LOOP: ROUTER, AGENTS, VERIFIER
---------------------------------------------------------------------
Agents are configuration, stored in a versioned agents table, editable by
admins. Each agent has a name, system-prompt template, model role, tool
allowlist, memory policy, max iterations, approval-required tools, and an
allowed-groups list.

Router: deterministic rules run first (an image attachment routes to vision; a
CSV/XLSX attachment routes to analysis; /doc or /code forces that agent).
Otherwise the small model returns schema-constrained JSON:
  { task_type, complexity: simple|multi_step, agent,
    needs: { documents, memory[], tools[] }, reason }
If the JSON fails to parse, OpeX falls back to the rules. Plain chat skips the
router call entirely (~2 ms vs seconds) as a latency optimisation.

Planner (multi-step): returns up to 6 steps; independent steps run concurrently
within the model's concurrency limit; outputs pass between steps as labeled
blocks; the general agent writes the final synthesis.

Executor: uses native tool calls via llama.cpp --jinja, with a JSON fallback.
Hard limits: 8 iterations, a wall-clock limit, and a token budget. Before every
tool call it checks the agent's allowlist AND can().

Verifier: at minimum, a deterministic check that every [n] citation maps to a
real retrieved chunk. The fuller version checks each sentence for groundedness
(supported / partial / unsupported), requires exit code 0 and referenced
artifacts for code tasks, and runs policy and format checks. Any unsupported
claim triggers a revise-with-feedback; after at most 2 revisions the answer is
returned with confidence: low rather than silently shipped.

7. TOOLS AND THE SANDBOX
---------------------------------------------------------------------
Tools available to agents:
  - doc_search      (api)           — the retrieval pipeline above
  - code_exec       (sandbox)       — runs Python; approval only if persisting
  - make_chart      (sandbox)       — matplotlib -> PNG artifact
  - describe_image  (llm-main)      — vision captioning / VQA
  - generate_image  (image agent)   — local image generation
  - memory_search / memory_write    — long-term memory access
  - shell           (sandbox)       — approval required
  - internal HTTP tools             — allowlisted internal hosts only
  - web_search      (egress-gateway)— approval required, BLOCKED when tainted

sandbox-runner is the security centrepiece for code execution. The API talks to
it over the internal core network with a shared secret; the request is a
structured { image_id from allowlist, code|command, files[], timeout_s, persist }
— raw Docker args are NEVER accepted. Container flags:
  --network none --read-only --tmpfs /work:size=256m --memory 1g --cpus 1
  --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges --user 10001
(and --runtime runsc / gVisor where available). The image is prebuilt with
python, numpy, pandas, matplotlib, and openpyxl; there is no pip at runtime.
Output files become artifacts and inherit the task's classification. A dedicated
escape suite tests network access, writes outside /work, fork bombs, memory
bombs, infinite loops, and host-path reads — every case must be contained and
logged.

Approvals: risky tools (shell, persisting code, web search) persist task state,
send an approval_required event with a plain-language reason, and wait for the
user. Approvals and denials are audited, a timeout counts as a denial, and
pending approvals survive an API restart.

8. IMAGE GENERATION AND MULTIMODAL VISION
---------------------------------------------------------------------
OpeX is multimodal in both directions. On input, the vision model reads images,
scanned pages, and diagrams (describe_image / VQA), and figures inside ingested
documents are auto-captioned. On output, OpeX generates images entirely locally
via a dedicated image role/agent and a generate_image tool (DreamShaper 8 LCM,
roughly 11 seconds per image on an Apple M4-class GPU). Everything — text,
vision, embeddings, reranking, and image generation — is served from local
weights with zero external calls.

9. MEMORY
---------------------------------------------------------------------
Working memory: the last N turns plus a rolling summary. When it exceeds 60% of
its budget, the LLM folds the oldest turns into the summary, preserving numbers,
names, decisions, and open questions.

Long-term memory:
  - episodic (per user, optionally per project): goal, actions, outcome,
    entities, written when a conversation closes or goes idle.
  - semantic (user / project / workspace): extracted after each episode.
  - project notes: human-edited markdown, always injected within that project.

The semantic write pipeline extracts candidates, DROPS anything containing
secrets or PII, drops low-confidence candidates, dedupes by cosine similarity
(merging/superseding with versioning), and stores each memory with provenance
and a classification equal to the maximum classification of its source context.
On read, the top semantic and episodic memories above a threshold are injected —
always inside a labeled user-turn block, never the system prompt. Every injected
memory and its score is logged in the trace. Memory derived from Restricted
sources never reaches an uncleared user, and users can view, edit, and delete
their own memories (all audited).

10. SECURITY AND GOVERNANCE
---------------------------------------------------------------------
  - Auth: local accounts with argon2id hashing, httpOnly SameSite=Strict session
    cookies, CSRF tokens, and lockout after repeated failures. Roles:
    super_admin, workspace_admin, employee. Clearances: Public (0), Internal (1),
    Confidential (2), Restricted (3).
  - Policy: a single decision point, can(user, action, resource, ctx), covered by
    table-driven matrix tests. It governs allowed models/tools/agents, daily
    token quota, upload limits, web access, and approval rules.
  - Access requests: a user requests access with a reason; an admin approves with
    an expiry, creating an access_grants row that retrieval honours until it
    expires. All audited.
  - Audit: append-only, hash-chained (hash = sha256(prev_hash || canonical row));
    audit:verify reports the first broken link.
  - Hardening: the suspicious/injection flag, per-agent tool allowlists, and task
    tainting; output DLP that detects keys, tokens, Aadhaar, PAN, emails, phone
    numbers, and admin keywords; an egress gateway that allowlists domains,
    applies DLP, is toggleable per workspace, audits every request, and refuses
    tainted tasks; strict CSP, security headers, rate limits, upload-type
    allowlisting, and TLS at the edge via an internal CA; dependency scanning
    (pnpm audit, pip-audit) and a CycloneDX SBOM.

11. EVALUATION
---------------------------------------------------------------------
OpeX ships with a real evaluation harness (pnpm eval) over a seeded corpus of a
fictional company: a pump manual with torque tables, a scanned inspection report
(image PDF), a P&ID diagram, a downtime CSV, a Hindi safety circular, and a
Restricted design document (plus boiler SOP, incident reports, and an injection
document for later stages). The suites and gates:

  suite           metric                                   gate
  -------------   --------------------------------------   ---------------------
  retrieval       recall@5, MRR                            baseline, >=0.8 target
  answers         judge-rated correctness, cite precision  improve on baseline
  ACL leak        Restricted facts shown to uncleared      0
  injection       hidden instructions followed             0
  router          classification accuracy (>=30 prompts)   >=0.85
  sandbox escape  contained                                all
  latency         p50/p95 first-token and full-answer      published

12. OBSERVABILITY AND ADMIN CONSOLE
---------------------------------------------------------------------
Every action writes a span (kind, model, tokens_in/out, latency_ms, status,
attrs), assembled into traces. The employee UI shows a live agent timeline built
from SSE events (route, plan, step_start, retrieval, memory_used, tool_call,
approval_required, tool_result, citation, verify, done), a document library with
per-page ingestion progress and a bbox-highlighting page viewer, citation chips,
an artifacts panel, a confidence badge, a "What OpeX remembers" panel, request-
access, and thumbs up/down feedback. The admin console adds a live span feed with
filters, per-user/model/day token usage and quota burn-down, model/tool status
with VRAM/license/origin and enable toggles, a policy editor with a "what can
this user do" preview, a versioned agent prompt editor with diffs and a test
chat, memory TTLs and per-user inspection, feedback triage that opens a thumbs-
down trace and exports the case to eval, and a system dashboard (GPU, VRAM,
queue depth, disk) with alerts.

13. CURRENT STATUS
---------------------------------------------------------------------
The prototype is working end-to-end. Measured on an Apple M4-class machine with
the native-GPU path (Qwen3-VL-4B default at ~33 tok/s): a greeting answers in
~5.5 s, a cited document answer in ~14 s, and a map-reduce document summary in
~19 s. The scripted offline demo runs with the network physically unplugged:
verify-offline passes, a scanned-manual table question returns a cited answer
that highlights its source, a downtime CSV is turned into a Pareto chart in the
sandbox, an Internal-clearance user asking about the Restricted document leaks
nothing, and the timeline shows the router sending a greeting to the small model
and a document question to the main model. Governance (append-only hash-chained
audit, access grants with expiry), the reworked memory layer, orchestration, and
the sandbox are all built and evidenced.

14. WHY IT MATTERS / IMPACT
---------------------------------------------------------------------
OpeX makes cloud-grade agentic AI usable exactly where the cloud is forbidden:
defence, atomic and space research, power and process industries, and any
enterprise handling export-controlled or safety-critical documents. It removes
the false choice between "modern AI productivity" and "keep our confidential
data inside the building." Because it is open-weight, self-hosted, air-gappable,
fully audited, and access-controlled at the SQL layer, an organisation can adopt
it on their own hardware, on their own network, with verifiable proof that
nothing ever leaves the room.
```

---

## 5. YouTube Link
*(Optional — leave blank unless you have a demo video)*

```
(optional — add your demo video URL here, or leave empty)
```

---

## 6. Idea Template (PDF upload)

The form also asks for a PDF "Idea Template" (Download Template on the form,
upload the filled PDF, up to 10 MB). This response file only covers the text
fields — fill the official template PDF separately using the same content above.
