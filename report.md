# OpeX — Test Pass & Flaw Report

Date: 2026-09-23 (updated same day — fixes applied)
Scope: full repo (TS unit/integration tests, Python service tests, lint,
typecheck, and a manual code-level audit of the frontend). Main focus per
request: the UI. Live browser click-testing was not available in this
environment (no GUI), so UI findings below are from static code review +
the running Docker stack's HTTP/SSE behavior, not a mouse-driven walkthrough.

**Update:** all findings except F8 (no frontend tests), F9 (no routing),
and F11 (no mobile layout) have been fixed in this same session — those
three are left open because each is a real feature/architecture addition,
not a bug fix, and out of scope for a quick pass. Each fixed finding below
is marked **[FIXED]** with what changed and how it was verified.

## Summary

Automated checks are all green. The real problems are UX/UI defects found
by reading the code paths a user actually hits — most are not caught by
`tsc`/`eslint`/unit tests because they're about *what renders when*, not
type or logic errors.

| Check | Result |
|---|---|
| `pnpm test` (apps/api + packages/shared) | 192 passed, 1 intentionally gated (needs a live LLM) — same count after all fixes, no regressions |
| `pnpm lint` / `pnpm typecheck` (all workspaces) | clean, before and after fixes |
| `pnpm --filter @opex/web build` | succeeds, before and after fixes |
| `services/ingest` pytest | 14 passed |
| `services/sandbox-runner` pytest | 23 passed, 10 gated (need real Docker) |
| Frontend unit/component tests | **none exist** (see Finding F8 — left open) |

---

## Findings — UI (main focus)

### F1. [Critical] [FIXED] Refreshing the page force-logs-out every user

`apps/web/src/App.tsx:21` initializes session state as:

```ts
const [user, setUser] = useState<MeResponse | null>(null);
```

There is no `useEffect` anywhere in `App.tsx` that calls `GET /me` on
mount to check for an existing valid session. The session cookie itself
is still valid server-side (httpOnly, not touched by a page reload), but
the moment React remounts — any browser refresh, reopening the tab,
following a bookmarked/shared link — `user` starts at `null` and the app
unconditionally renders `LoginPage`, forcing every user to log in again.

For a tool meant for daily internal use, this means nobody can safely
refresh the page, and there's no deep-linking possible (see F9).

**Fix applied:** `App.tsx` now calls `fetchMe()` in a mount-time
`useEffect`, shows a brief "Loading…" screen while that's in flight, and
hydrates `user` from a 200 or falls back to `LoginPage` on 401.

**Verified live:** logged in via curl, then called `GET /me` again with
the same cookie jar (no new login) — got back the same user, confirming
a "refresh" restores the session instead of forcing a re-login.

### F2. [Critical, compounds F1] [FIXED] `GET /me` didn't return a CSRF token, so a session restore wouldn't have been enough on its own

`apps/api/src/routes/auth.ts:90-98` — `/me` returns only
`{id, email, role, clearance}`. The CSRF token is only ever issued from
`POST /auth/login` (`auth.ts:64,80`) and stored in a module-level JS
variable in `apps/web/src/lib/api.ts:23` (`let csrfToken: string | null
= null`), which is wiped on every page load along with everything else.

Even if F1 is fixed and `/me` is used to restore `user` on mount, every
mutating request (`POST`/`PUT`/`PATCH`/`DELETE` — sending a message,
approving something, editing a policy, uploading a document) would still
403 with a missing/stale CSRF token until the next full login, because
nothing re-issues one on session restore.

**Fix applied:** `/me` now calls `issueCsrfToken(req)` (idempotent —
returns the session's existing token if already set) and includes it in
the response, alongside `name` (which `/me` was also silently omitting
despite `MeResponse`'s schema requiring it — `AuthedUser` didn't carry a
`name` field at all; added it as optional there and populated it from
`requireAuth`'s existing user-row query). `apps/web/src/lib/api.ts`'s new
`fetchMe()` calls `setCsrfToken()` from the response, same as `login()`.

**Verified live:** restored a session via `/me` (no fresh login), took
*only* the `csrfToken` from that response, and used it to authorize a
real `POST /auth/logout` — got `204`. Confirms a page refresh no longer
breaks the next mutating request.

### F3. [FIXED] Loading state was missing on ~15 of 19 pages — real data and "empty" rendered as the same message

Every page/component backed by a list starts its state as `useState<T[]>([])`
and renders the **empty-state message unconditionally** until the fetch
resolves. Confirmed in:
- `apps/web/src/components/ui/DataTable.tsx:19-21` — the shared primitive
  itself has no loading concept: `if (rows.length === 0) return
  <EmptyState .../>`. This affects every admin page built on it (Users,
  Groups, Traces, Audit log, Usage, Models, Memory, ...).
- `apps/web/src/pages/DocumentsPage.tsx:176-178` — same pattern
  (`docs.length === 0 ? <EmptyState title="No documents yet" ... />`).
- `apps/web/src/pages/admin/AccessRequestsPage.tsx:39` — same.

So on every page load, a user briefly (or, on a slow connection / slow
admin query, not-so-briefly) sees "No documents yet" / "No pending
requests" / etc. *before* the real data arrives and replaces it — visually
indistinguishable from "there is actually nothing here."

Notably, `apps/web/src/components/MyMemoriesPanel.tsx:14,36` gets this
**right** — it types state as `MyMemoryRow[] | null`, shows `Loading…`
while `rows === null`, and only shows the empty state once the fetch has
actually resolved to zero rows. That's the pattern the rest of the app
should follow; it already existed in the codebase, just not applied
everywhere.

**Fix applied:** `DataTable` now takes a `loading?: boolean` prop and
shows a neutral "Loading…" row instead of the empty state while true;
wired a `loading` state (`useState(true)`, cleared in `.finally()`) into
all 7 `DataTable`-consuming admin pages (Users, Traces, Models, Memory
×2 tables, Audit log, Usage) plus the hand-rolled list pages
(`DocumentsPage`, `AccessRequestsPage`, `ApprovalsPage`, `FeedbackPage`,
`GroupsPage`) and `ConversationViewerPage`'s message pane (which had a
second, subtler bug: switching to a different conversation showed the
*previous* one's messages until the new fetch resolved — now cleared
immediately on selection change).

### F4. [FIXED] Error and "empty" states rendered simultaneously and contradicted each other

`apps/web/src/pages/DocumentsPage.tsx:174-178`:

```tsx
{error && <p className="mb-4 text-sm text-danger-600">{error}</p>}
{docs.length === 0 ? (
  <EmptyState title="No documents yet" description="Upload a document to get started." />
) : ...}
```

If the fetch fails, `error` is set **and** `docs` stays `[]`, so the page
shows a red "failed to load documents" line directly above a friendly
"No documents yet, upload one to get started" empty state — actively
misleading (it reads as "you have no documents," not "we couldn't check").
Same shape recurs anywhere `error` and a `.length === 0` empty-state
check are both driven by unrelated state (most admin pages).

**Fix applied:** `DataTable` also takes an `error?: string | null` prop —
when there are no rows *and* an error is set, it shows the error text
instead of the empty-state message (once real rows exist, the error prop
is ignored, so an unrelated later action's failure — e.g. a toggle — never
hides an already-loaded table). Same `error ? null : <EmptyState .../>`
guard applied to every hand-rolled list page.

### F5. [FIXED] Chat input lost all visible keyboard-focus indication

`apps/web/src/components/Composer.tsx:27`:

```tsx
className="flex-1 rounded-xl px-3 py-2 text-sm outline-none disabled:opacity-50"
```

`outline-none` with no `focus:ring-*`/`focus:border-*` replacement. Every
other input in the app (e.g. `LoginPage.tsx:68,78`:
`focus:border-accent-400 focus:ring-2 focus:ring-accent-100`) has a
visible focus style; the main chat composer — the single most-used
control in the app — did not. A keyboard-only user tabbing to the
composer got no visual confirmation it's focused.

**Fix applied:** added `focus:ring-2 focus:ring-accent-100`, matching the
rest of the app's inputs.

### F6. [FIXED] Raw backend state strings leaked into user-facing text

`apps/web/src/pages/ChatPage.tsx:160`:

```ts
onStatus: (state, model) => setStatus(`${state}: ${model}`),
```

This renders literally as `cold_start: llm-main` or `model_swap:
llm-small` in the UI (`ChatPage.tsx:335`, `{status && <p ...>{status}</p>}`).
An industrial-site employee with no ML background has no way to
interpret `cold_start: llm-main`.

**Fix applied:** a small `STATUS_LABELS` map translates `cold_start` →
"Warming up the model", `model_swap` → "Switching models"; the model
name still shows alongside for anyone who does want it
(`Warming up the model… (llm-main)`).

### F7. [FIXED] Composer was a single-line `<input>`, not a `<textarea>` — no way to write a multi-line question

`apps/web/src/components/Composer.tsx:22-28` uses a plain `<input>`.
Industrial doc-QA questions realistically include pasted multi-line specs,
tag lists, or numbered steps. There's no way to enter a newline (no
Shift+Enter handling because there was no textarea to begin with), and long
single-line text just scrolled horizontally inside a fixed-height box.

**Fix applied:** swapped the `<input>` for a `<textarea>` with Enter-to-
send / Shift+Enter-for-newline handling (`onKeyDown`, preventing default
only on a plain Enter). A follow-up worth doing later: auto-growing the
textarea's height as lines are added — left as a `rows={1}` fixed height
with internal scroll for now, since that's a size/polish decision, not a
correctness bug.

### F8. [Open — feature work, not a bug fix] Zero frontend tests exist

`apps/web/package.json:11`: `"test": "echo 'no web unit tests yet in A1' && exit 0"`.
Every one of the 19 pages and the entire `components/ui/` primitive
library (Button, Card, DataTable, ToggleSwitch, ClassificationBanner, ...)
has no unit or component test coverage at all. `pnpm test` reports green
for the web workspace only because the script is a no-op — it is not
signal that the frontend works, just that nothing is checked.

### F9. [Open — architectural, not fixed] No routing — no deep links, no bookmarks, no working back/forward

`App.tsx` is a hand-rolled `useState<View>` switch with no
`history.pushState`/React Router. The browser URL never changes no matter
which page is open. Combined with F1, this means: you can't bookmark or
share a link to a specific admin section or document, and the browser's
back/forward buttons do nothing inside the app (they'd just re-trigger F1
by reloading, if anything). This was a stated architectural choice, not
an oversight, but it's worth flagging as a real limitation for a tool
with 13 admin pages users will want to jump straight to.

### F10. [FIXED] Accessibility: almost no `aria-label` coverage on icon/emoji-only buttons

Only one `aria-label` existed in the entire `apps/web/src` tree. The
thumbs up/down feedback buttons (`apps/web/src/components/MessageList.tsx:64-69`)
were emoji-only with a `title` attribute (a mouse-hover tooltip, not a
reliable accessible name) — a screen reader user had no dependable label
for "Good answer" / "Bad answer".

**Fix applied:** added `aria-label="Good answer"` / `aria-label="Bad
answer"` alongside the existing `title`s. (This was the one concrete,
scoped a11y gap found; a full accessibility audit is a bigger separate
effort and out of scope here.)

### F11. [Open — feature work, not fixed] No mobile/narrow-viewport handling

`apps/web/src/components/AppShell.tsx:52`: `<aside className="flex w-60
shrink-0 flex-col ...">` — the sidebar is a fixed 240px with no responsive
collapse, hamburger toggle, or `hidden md:flex`. On any viewport narrower
than ~700–800px (a tablet in portrait, or a phone), the sidebar and main
content area will fight for space with no fallback. If this tool is ever
used on-site from a tablet (plausible for an "industrial documents"
workbench), it will be unusable at that width.

### F12. [FIXED] Minor CSP inconsistency between `index.html` and `nginx.conf`

`apps/web/index.html:8`'s CSP meta tag includes `font-src 'self'`, but the
CSP actually served by nginx in production
(`add_header Content-Security-Policy ...` in `apps/web/nginx.conf`) did
**not** include `font-src`. Harmless in practice (`default-src 'self'`
covers fonts as a fallback when `font-src` is unset), but the two
policies had drifted apart, which is exactly the kind of thing that
silently breaks later when someone changes one file and not the other.

**Fix applied:** added `font-src 'self'` to `nginx.conf`'s header.
**Verified live:** `curl -I http://localhost:8080/` now shows
`font-src 'self'` in the served `Content-Security-Policy` header.

### F13. [FIXED] `AgentTimeline` could render an unbounded raw JSON blob

`apps/web/src/components/AgentTimeline.tsx:23`:

```ts
return `${event.data.toolName}(${JSON.stringify(event.data.args)})`;
```

No truncation. A tool call with a large argument (e.g. a chunk of
document text passed to `code_exec`) rendered as one giant unbroken string
in the Activity Run panel, pushing the rest of the timeline out of view
and making the panel unreadable for that turn.

**Fix applied:** truncates the stringified args to 200 characters with a
trailing `…` before building the description string.

---

## Findings — Backend / cross-cutting (secondary focus)

### F14. "Stop" only stops the client, not the model

(Already known/documented from this session's earlier fix, restated here
for completeness.) Clicking Stop aborts the browser's SSE connection but
the backend has no cancellation path — for non-token-streaming agent
paths (doc_qa, executor/tool agents, multi-step plans), the server keeps
generating and burning CPU/tokens after the user has given up watching.
Acceptable for a Stage-A prototype, but should be tracked as real debt
before this ships past prototype.

### F15. `pnpm eval` full-suite regeneration is stale

Already tracked in `docs/PROGRESS.md`'s Debt section — restated here
because it means the eval numbers currently on record predate every
change in this session (frontend redesign, `/memory/mine`, nginx fix) and
predate several earlier B2–B4 commits. Nothing in this session's testing
contradicts the existing eval results, but they haven't been re-run
against current `main`.

---

## What's verified working / not broken

- Server-side admin authorization is real (routes gate through `can()` in
  `apps/api/src/policy/`, not just hidden client-side nav — checked
  `adminUsers.ts` directly).
- No `dangerouslySetInnerHTML` anywhere in the frontend; citation
  rendering builds React text/element nodes, not raw HTML — no XSS
  surface found there.
- Cross-user memory isolation on `GET /memory/mine` was verified live
  against two real seeded users in this session (disjoint rows, no leak).
- `LoginPage`'s animated background correctly no-ops under
  `prefers-reduced-motion` (checked via `useReducedMotion()` gating the
  `animate` prop).
- 192 API tests, 14 ingest tests, 23 sandbox-runner tests all pass; full
  `typecheck`/`lint` clean across every workspace.

---

## What's still open

- **F8** — no frontend unit/component tests. Real feature work (a test
  harness + coverage for 19 pages and the `components/ui/` library), not
  a quick fix; recommend doing this before adding more UI surface.
- **F9** — no client-side routing (deep links, bookmarks, back/forward).
  A stated architectural choice for this stage, but worth revisiting if
  users start asking for it.
- **F11** — no mobile/narrow-viewport layout (fixed 240px sidebar, no
  collapse). Only matters if this is ever used from a tablet/phone
  on-site; low priority for a desktop-first internal tool otherwise.

## Fix verification summary

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (all workspaces) — clean/green
  after every fix, same 192/192 API test count throughout.
- `pnpm --filter @opex/web build` — succeeds.
- `web`/`api` Docker images rebuilt and redeployed; live-verified:
  session restore + CSRF-on-restore (F1/F2) end-to-end with real login/
  logout calls, and the corrected nginx CSP header (F12).
