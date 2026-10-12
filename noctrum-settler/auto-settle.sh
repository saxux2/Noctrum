#!/usr/bin/env bash
# Stopgap scheduler until the workflows are deployed to Chainlink CRE (`cre account access`).
# Runs the CRE simulations on the deployed cadence against the staging target (the Railway backend):
#   execute-transfers every ~15 s, settle-loans every ~30 s, check-loans every ~60 s.
# Usage (from noctrum-settler/):  bash auto-settle.sh        Stop with Ctrl+C.
# Log: auto-settle.log
cd "$(dirname "$0")" || exit 1
LOG=auto-settle.log
TARGET=${TARGET:-staging-settings}
# The Railway server has its own INTERNAL_API_KEY; .env.staging (gitignored) is a copy of .env with that key, passed with -e.
ENVFILE=(); [[ $TARGET != local-settings && -f .env.staging ]] && ENVFILE=(-e .env.staging)

run() {
  local out
  out=$(cre workflow simulate "./$1" --target="$TARGET" --non-interactive --trigger-index=0 "${ENVFILE[@]}" 2>&1 | grep -E 'result:|rror|^"' | tail -1)
  printf '%s  %-17s %s\n' "$(date '+%H:%M:%S')" "$1" "${out:-no output}" | tee -a "$LOG"
}

echo "auto-settle started ($TARGET). Ctrl+C to stop." | tee -a "$LOG"
tick=0
while true; do
  start=$(date +%s)
  run execute-transfers
  if (( tick % 2 == 0 )); then run settle-loans; fi
  if (( tick % 4 == 0 )); then run check-loans; fi
  tick=$((tick + 1))
  # keep roughly a 15 s cadence (simulations themselves take a few seconds each)
  elapsed=$(( $(date +%s) - start ))
  (( elapsed < 15 )) && sleep $(( 15 - elapsed ))
done
