# UI (apps/web)
Bundle all assets, including fonts, icons, and the pdf.js worker. A banner shows the highest classification currently on screen.

## Employee
- A1: login and streaming chat.
- A2: document library with progress and classification, page viewer with bbox highlight, and citation chips.
- A3: agent timeline built from SSE events, and an artifacts panel.
- B: confidence badge, approval cards, a "What OpeX remembers" panel, request access, and thumbs up/down.

## Admin
A3 has read-only views of traces and usage. B1 adds users, groups, and access requests. B5 adds the rest.
- Logs: a live feed of spans, with filters.
- Usage: tokens per user, model, and day; quota burn-down; chat history (viewing it is audited).
- Models and tools: status, VRAM, license and origin, an enable toggle, and a group allowlist.
- Policies: an editor with a "what can this user do" preview.
- Agents: a prompt editor with versions, diffs, and a test chat.
- Memory: TTLs, counts, purge, and per-user inspection (audited).
- Feedback triage: a thumbs-down opens its trace, where the admin tags a root cause and can export the case to eval.
- System: GPU, VRAM, queue depth, and disk usage, with alerts.