# Tools

| tool | runs in | needs approval | stage |
|---|---|---|---|
| doc_search | api | no | A |
| code_exec (python) | sandbox | only when persist=true | A |
| make_chart | sandbox (matplotlib → PNG artifact) | no | A |
| describe_image | llm-main | no | A |
| memory_search / memory_write | api | no | B2 |
| shell | sandbox | yes | B4 |
| internal HTTP tools | api → allowlisted internal hosts | set by admin | B4 |
| web_search | egress-gateway → SearXNG | yes, and blocked when tainted | B6 |

## sandbox-runner
- Input comes from the api over `core`, authenticated with a shared secret. The request is `{image_id from allowlist, code|command, files[], timeout_s, persist}`. Raw Docker args are never accepted.
- Container flags: `--network none --read-only --tmpfs /work:size=256m --memory 1g --cpus 1 --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges --user 10001`. From B4, add `--runtime runsc` if it is available.
- The image is prebuilt with python, numpy, pandas, matplotlib, and openpyxl. There is no pip at runtime.
- `persist=true` mounts the project volume, but only if policy allows it.
- Returns truncated stdout/stderr, the exit code, and output files. Files become artifacts and inherit classification.
- B4 escape suite: network access, writes outside /work, fork bomb, memory bomb, infinite loop, and reading host paths. Every case must be contained and logged.

## Approvals (B4)
1. Persist the task state.
2. Send `approval_required` with the tool, its args, and a plain-language reason.
3. Wait for the user. Approvals and denials are audited, and a timeout counts as a denial. Pending approvals survive a restart.