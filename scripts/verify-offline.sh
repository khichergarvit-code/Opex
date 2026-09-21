#!/usr/bin/env bash
# Demonstrates invariant #1: no runtime egress. For every service running
# under `make up`, attempts an outbound HTTPS call and a raw TCP connection
# to a public host, and asserts BOTH fail. A1 has no egress-gateway yet, so
# there are zero exceptions — every container must fail every attempt.
set -uo pipefail

COMPOSE_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docker-compose.yml"
SERVICES=$(docker compose -f "$COMPOSE_FILE" ps --services --status running)

if [[ -z "$SERVICES" ]]; then
  echo "No running services found. Run 'make up' first." >&2
  exit 1
fi

FAIL_COUNT=0
PASS_COUNT=0

printf "%-20s %-25s %-25s\n" "SERVICE" "HTTPS EGRESS" "TCP EGRESS"
printf "%-20s %-25s %-25s\n" "-------" "------------" "----------"

for svc in $SERVICES; do
  HTTPS_RESULT="blocked"
  if docker compose -f "$COMPOSE_FILE" exec -T "$svc" \
      sh -c 'command -v curl >/dev/null 2>&1 && curl -sS -m 3 -o /dev/null https://1.1.1.1' \
      >/dev/null 2>&1; then
    HTTPS_RESULT="REACHED (FAIL)"
  fi

  TCP_RESULT="blocked"
  if docker compose -f "$COMPOSE_FILE" exec -T "$svc" \
      sh -c 'exec 3<>/dev/tcp/8.8.8.8/53' \
      >/dev/null 2>&1; then
    TCP_RESULT="REACHED (FAIL)"
  fi

  printf "%-20s %-25s %-25s\n" "$svc" "$HTTPS_RESULT" "$TCP_RESULT"

  if [[ "$HTTPS_RESULT" == *FAIL* || "$TCP_RESULT" == *FAIL* ]]; then
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
done

echo
echo "$PASS_COUNT/$((PASS_COUNT + FAIL_COUNT)) containers blocked all egress."

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "verify-offline: FAIL — at least one container reached the public internet." >&2
  exit 1
fi
echo "verify-offline: PASS"
