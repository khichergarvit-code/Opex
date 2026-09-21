# Spike B — does llm-main handle image input, json_schema output, and `--jinja` tool calls?

## Prerequisites

llm-main (`Qwen2.5-7B-Instruct-Q4_K_M.gguf`) running with `--jinja` (see
Spike A or `docker compose up llm-main`).

## json_schema output

```bash
curl -s http://localhost:8082/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "messages": [{"role": "user", "content": "Extract: Alice is 30 years old."}],
    "response_format": {
      "type": "json_schema",
      "json_schema": {"name": "person", "schema": {"type": "object", "properties": {"name": {"type": "string"}, "age": {"type": "integer"}}, "required": ["name", "age"]}}
    }
  }' | python3 -m json.tool
```

## `--jinja` tool calls

```bash
curl -s http://localhost:8082/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "messages": [{"role": "user", "content": "What is the weather in Pune?"}],
    "tools": [{"type": "function", "function": {"name": "get_weather", "description": "Get the weather for a city", "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}}}]
  }' | python3 -m json.tool
```

Check the response for a `tool_calls` entry naming `get_weather` with `city: "Pune"`.

## Image input

`Qwen2.5-7B-Instruct` (the model picked for llm-main in A1) is text-only —
no mmproj file. Per the plan's documented fallback, vision support is
**deferred**, not attempted in A1: llm-main serves general/doc_qa/coder
requests as text-only for this milestone. A vision-capable GGUF + mmproj
pair should be evaluated in A2/A3 when doc_qa needs to read scanned pages
directly (Docling's OCR output is text either way, so this isn't a blocker
for A2's cited-answer AC).

## Result

See `scripts/spikes/results/jinja-tool-calls.md` for the outcome of this run.
