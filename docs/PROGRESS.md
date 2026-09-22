# Progress

## Status
A1–A3 done — see `docs/archive/a1-a3.md` (one AC still fails on this
CPU-only dev machine: doc_qa latency, not a code fix — see `docs/DEMO.md`).

**B1 (Governance) + B5 (Admin console) done, merged as one milestone at
the user's request** (`docs/plan.md`'s original B1/B5 rows are unchanged;
this note records the merge). All 3 B1 ACs demonstrated live: 55-case
`policyMatrix.test.ts` green; `pnpm audit:verify` OK on a real chain, then
correctly detects a real raw-SQL tamper; an access grant appears (403→200)
and expires (200→403) for real. All 6 B5 admin pages (Models, Policies,
Agents, Memory, Feedback, System) plus users/groups/access-requests/
conversations/audit-log verified live through the actual web UI (nginx on
:8080), not just direct API calls — every response checked against a real
DB query, no fabricated fields (Models/System show `"N/A — CPU-only
stack"` literally, Memory shows a banner that B2 doesn't exist yet).
148 API tests green.

## Decisions
- Policy: `policies` table is now actually read at runtime
  (`loadPolicyRules.ts`), not just a static default. `document:upload`'s
  size check and `model:invoke`'s quota check moved inside `can()`.
- Audit: `audit_log`'s `hash`/`prev_hash` are real now (`writeAudit.ts`,
  `sha256(prevHash + canonicalRow)`). Canonicalization sorts object keys
  recursively — Postgres's `jsonb` does **not** preserve key insertion
  order, so plain `JSON.stringify` on a round-tripped row produced a
  different string than at write time, falsely flagging untampered rows
  as a broken chain. Found via a live run, fixed in `audit/canonical.ts`.
- Access grants: `can()`'s `document:read` case didn't check
  `access_grants` at all (only retrieval's SQL did) — an approved grant
  worked for chunk retrieval but not the raw file route. Fixed by having
  `documents.ts` query the grant and pass `hasActiveAccessGrant` in.
- User/group admin: disable-not-delete (`users.status`), since
  `audit_log`/`traces`/`access_grants`/`feedback` all FK to `users.id`.
  Both `super_admin` and `workspace_admin` can create/disable users and
  manage groups (user's explicit call — no split by role).
- Memory admin is scoped to A3's real per-conversation `working_summary`
  only — B2's long-term store doesn't exist; the page says so, no
  fabricated TTLs/purge-counts.
- Feedback export-to-eval needs `docker-compose.yml` to mount
  `./eval/questions` into the api container — that dir isn't in the image
  at all (only `dist/` is), found before shipping by tracing the
  Dockerfile's COPY list.
- `git`: `models/docling-cache/` (150–212MB HF cache files) had been
  committed into history, bloating `.git` to 490MB, over GitHub's 100MB
  push limit. Fixed on a clean branch (soft-reset, gitignore, re-commit).

## Debt
- No per-task classification tracking for tool calls (invariant #10's
  gate defaults to Public until B4 computes a real floor).
- `answers` eval suite scores by keyword containment, not LLM-judge.
- TLS not in front of the API (B6). `apps/web` admin pages are plain
  inline-styled tables/forms, no design pass yet.
- Agents admin's "test-chat" span isn't tagged in `attrs` (no passthrough
  on `gateway.ChatRequest` yet) — shows up in `/admin/logs` like a real turn.
- gVisor not wired into sandbox-runner yet (B4).

## Open questions
- Real production GPU box specs. Tesseract's Hindi OCR on a *rasterized* page.
