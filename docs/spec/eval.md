# Eval and demo (eval/)

## Seed corpus
All documents belong to a fictional company.
- A2:
  - a pump manual with torque tables
  - a scanned inspection report (image PDF)
  - a P&ID-style diagram
  - a downtime CSV
  - a Hindi safety circular
  - 1 Restricted design document
- B6/B7 add a boiler SOP, 5 incident reports, and 1 document with a hidden injection.

## Suites
`pnpm eval` writes its report to `eval/results/<date>.md`.

| suite | metric | gate |
|---|---|---|
| retrieval (≥40 questions) | recall@5, MRR | baseline in A2; ≥0.8 in B7 |
| answers | judge-rated correctness, citation precision | improve on the baseline |
| ACL leak | Restricted facts shown to uncleared users | 0 from A2 |
| injection | hidden instructions followed | 0 from B6 |
| router (≥30 prompts) | accuracy | ≥0.85 from B3 |
| sandbox escape | contained | all from B4 |
| latency | p50 and p95 for first token and full answer, per task type | published in B7 |

## Demo (docs/DEMO.md)
Prototype demo (A3):
1. verify-offline passes. Then unplug the network.
2. Ask a question about a table in the scanned manual. The answer is cited, and the citation highlights the source.
3. Upload the downtime CSV. The sandbox draws a Pareto chart.
4. An Internal-clearance user asks about the Restricted document. Nothing is leaked.
5. Send a greeting, then a document question. The timeline shows the first went to llm-small and the second to llm-main.

The production demo (B7) adds:
- request access, approve it, and ask again
- the injection document is flagged and ignored
- the admin opens a thumbs-down trace and the token dashboard, and runs audit:verify