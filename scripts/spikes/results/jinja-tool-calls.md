# Spike B results — image input, json_schema output, `--jinja` tool calls

Model: llm-main (Qwen2.5-7B-Instruct-Q4_K_M), host-native llama-server
`--jinja`, tested via `curl` against `/v1/chat/completions`.

## json_schema output — **PASS**

Requested `response_format: {type: json_schema, ...}` with a `person`
schema (`name: string, age: integer`). Response:

```json
{ "name": "Alice", "age": 30 }
```

Valid JSON matching the schema, first try, no repair retry needed.

## `--jinja` tool calls — **PASS**

Sent a `get_weather(city)` tool definition and asked "What is the weather in
Pune?". Response came back as a proper `tool_calls` entry:

```json
"tool_calls": [{"type": "function", "function": {"name": "get_weather", "arguments": "{\"city\": \"Pune\"}"}}]
```

`finish_reason: "tool_calls"`, arguments correctly extracted. Qwen2.5's
built-in chat template (loaded via `--jinja`) handles this natively.

## Image input — **deferred, not attempted**

Qwen2.5-7B-Instruct (the model picked for llm-main in A1 — see
`docs/PROGRESS.md` Decisions) is text-only; no mmproj file. Per the plan's
documented fallback: vision support is deferred to A2/A3, when doc_qa needs
to read scanned pages directly. This isn't a blocker for A2's cited-answer
AC since Docling's OCR output is text either way.

## Result

2 of 3 capabilities verified working; vision deferred per the planned
fallback (documented above, not a blocker for A1).
