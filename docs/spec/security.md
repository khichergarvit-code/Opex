# Security

## Auth
- Local accounts: argon2id, an httpOnly SameSite=Strict session cookie, a CSRF token, and lockout after repeated failures.
- A1 uses seeded users. B1 adds user and group admin.
- Roles: super_admin, workspace_admin, employee.

## Policy
`can(user, action, resource, ctx)` is the only decision point. It reads from `policies`: allowed models, tools, and agents; daily token quota; upload limits; web access; and approval rules. It is covered by table-driven matrix tests.

## Access requests (B1)
A user submits a request with a reason. An admin approves it with an expiry, which creates an `access_grants` row that retrieval honors until it expires. All of this is audited.

## Audit (B1)
`hash = sha256(prev_hash || canonical row)`. `pnpm audit:verify` reports the first broken link.

## Hardening (B6)
- Injection defense: the suspicious flag, per-agent allowlists, and taint. The injection test suite must record 0 successes.
- Output DLP: detect keys and tokens, Aadhaar, PAN, emails, phone numbers, and admin-defined keywords. Mask or block according to policy.
- Egress gateway:
  - allowlists domains and applies DLP to queries
  - can be toggled per workspace
  - audits every request
  - refuses tainted tasks
- Web: strict CSP, security headers, rate limits, an upload type allowlist, and TLS at the edge using an internal CA.
- Dependencies: run `pnpm audit` and `pip-audit`, and produce a CycloneDX SBOM.