#!/bin/bash
#
# ==================================================
#   SLAYER TERMINAL - EVERY PROOF, NOT THE FIRST ONE
#   (scripts/run-all-proofs.sh)
# ==================================================
#
#   `npm test` chains the proofs with `&&`, which is right for CI — the
#   build must stop on the first failure — and wrong for a person. One
#   broken assertion in the third script hides the other hundred and thirty,
#   so a change that breaks four things looks like a change that breaks one,
#   and it takes four rounds to find that out.
#
#   This runs all of them, reports each, and lists every failure at the end.
#
#   THE LIST COMES FROM package.json, deliberately. It used to live in a
#   separate file, which is the kind of list that drifts: a proof added to
#   the test chain and not to the list is a proof this never runs, and
#   nothing says so. There is one source of truth and this reads it.
#
#   Exit code is the number of failing scripts, so it can gate something.

set -uo pipefail
cd "$(dirname "$0")/.."

LOG=$(mktemp)
FAIL=$(mktemp)
trap 'rm -f "$LOG" "$FAIL"' EXIT

# Every `tsx scripts/x.ts` in the test chain, in the order it runs there.
mapfile -t PROOFS < <(node -e '
  const pkg = require("./package.json");
  const chain = pkg.scripts?.test ?? "";
  for (const m of chain.matchAll(/tsx\s+(scripts\/[\w.-]+\.ts)/g)) console.log(m[1]);
')

if [ "${#PROOFS[@]}" -eq 0 ]; then
  echo "No proofs found in package.json's test chain." >&2
  exit 1
fi

echo "Running ${#PROOFS[@]} proofs…"
echo

total=0
failed=0
for f in "${PROOFS[@]}"; do
  out=$(npx tsx "$f" </dev/null 2>&1)
  code=$?
  # Every proof ends with "N passed, M failed"; take the last such line.
  summary=$(echo "$out" | grep -E "[0-9]+ passed, [0-9]+ failed" | tail -1)
  n=$(echo "$summary" | grep -oE "^[0-9]+" || echo 0)
  total=$((total + ${n:-0}))
  if [ $code -ne 0 ]; then
    failed=$((failed + 1))
    printf 'FAIL  %-46s %s\n' "$f" "${summary:-did not report a summary}"
    {
      echo "----- $f -----"
      echo "$out" | grep -E "^FAIL|Error" | head -8
    } >> "$FAIL"
  else
    printf 'ok    %-46s %s\n' "$f" "${summary:-no summary}"
  fi
done

echo
echo "${#PROOFS[@]} scripts · ${total} assertions · ${failed} script(s) failing"

if [ "$failed" -gt 0 ]; then
  echo
  cat "$FAIL"
fi

exit "$failed"
