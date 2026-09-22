#!/usr/bin/env bash
# Acceptance checks for the abuse-hardening requirements (section 11 of the
# build brief). Run against a locally running `wrangler dev` by default, or
# point WORKER_URL at a deployed Worker.
#
# Usage:
#   wrangler dev
#   scripts/hardening-check.sh
#
# Against a deployed Worker (uses real Turnstile + Anthropic, so the
# "happy path" checks that need a valid token will fail unless
# DUMMY_TURNSTILE_TOKEN below is swapped for a real one):
#   WORKER_URL=https://your-worker.your-subdomain.workers.dev scripts/hardening-check.sh
#
# Note: the /generate checks below use Cloudflare's published Turnstile
# dummy token/secret pair, so they only pass as-is against a Worker
# configured with the matching dummy TURNSTILE_SECRET_KEY (see
# .dev.vars.example) — i.e. local `wrangler dev`, not production.

set -u

WORKER_URL="${WORKER_URL:-http://localhost:8787}"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-https://olindvall.se}"
DUMMY_TURNSTILE_TOKEN="XXXX.DUMMY.TOKEN.XXXX"

pass=0
fail=0

check() {
  local description="$1"
  local expected_status="$2"
  local actual_status="$3"

  if [ "$actual_status" = "$expected_status" ]; then
    echo "PASS  $description (got $actual_status)"
    pass=$((pass + 1))
  else
    echo "FAIL  $description (expected $expected_status, got $actual_status)"
    fail=$((fail + 1))
  fi
}

post() {
  # post <path> <json-body> [extra curl args...]
  local path="$1"
  local body="$2"
  shift 2
  curl -s -o /tmp/hardening-check-response.json -w '%{http_code}' \
    -X POST "${WORKER_URL}${path}" \
    -H "Content-Type: application/json" \
    -H "Origin: ${ALLOWED_ORIGIN}" \
    "$@" \
    -d "$body"
}

echo "Running hardening checks against ${WORKER_URL}"
echo

# 1. Missing Turnstile token -> 403
status=$(post /generate '{"topic":"test","goal":"Understand it broadly","model":"ChatGPT"}')
check "Missing Turnstile token -> 403" 403 "$status"

# 2. Invalid Turnstile token -> 403
status=$(post /generate '{"topic":"test","goal":"Understand it broadly","model":"ChatGPT","turnstileToken":"not-a-real-token"}')
check "Invalid Turnstile token -> 403" 403 "$status"

# 3. Topic over 1,000 characters -> 400
long_topic=$(python3 -c "print('a' * 1001)" 2>/dev/null || printf 'a%.0s' $(seq 1 1001))
payload=$(python3 -c "import json; print(json.dumps({'topic': '$long_topic', 'goal': 'Understand it broadly', 'model': 'ChatGPT', 'turnstileToken': '$DUMMY_TURNSTILE_TOKEN'}))" 2>/dev/null)
status=$(post /generate "$payload")
check "Topic over 1,000 characters -> 400" 400 "$status"

# 4. Body over 8,000 characters -> 413
long_body=$(python3 -c "print('a' * 8500)" 2>/dev/null)
payload=$(python3 -c "import json; print(json.dumps({'topic': '$long_body', 'goal': 'Understand it broadly', 'model': 'ChatGPT', 'turnstileToken': '$DUMMY_TURNSTILE_TOKEN'}))" 2>/dev/null)
status=$(post /generate "$payload")
check "Body over 8,000 characters -> 413" 413 "$status"

# 5. Invalid goal string -> 400
status=$(post /generate "{\"topic\":\"test\",\"goal\":\"not a real goal\",\"model\":\"ChatGPT\",\"turnstileToken\":\"$DUMMY_TURNSTILE_TOKEN\"}")
check "Invalid goal string -> 400" 400 "$status"

# 6. Invalid model string -> 400
status=$(post /generate "{\"topic\":\"test\",\"goal\":\"Understand it broadly\",\"model\":\"Not A Model\",\"turnstileToken\":\"$DUMMY_TURNSTILE_TOKEN\"}")
check "Invalid model string -> 400" 400 "$status"

# 7. Disallowed Origin header -> 403
status=$(post /generate "{\"topic\":\"test\",\"goal\":\"Understand it broadly\",\"model\":\"ChatGPT\",\"turnstileToken\":\"$DUMMY_TURNSTILE_TOKEN\"}" -H "Origin: https://evil.example")
check "Disallowed Origin header -> 403" 403 "$status"

# 8. Rating of 7 -> 400
status=$(post /feedback '{"rating":7}')
check "Rating of 7 -> 400" 400 "$status"

# 9. Non-integer rating -> 400
status=$(post /feedback '{"rating":3.5}')
check "Non-integer rating -> 400" 400 "$status"

# 10. Comment over 500 characters -> 400
long_comment=$(python3 -c "print('a' * 501)" 2>/dev/null)
payload=$(python3 -c "import json; print(json.dumps({'rating': 3, 'comment': '$long_comment'}))" 2>/dev/null)
status=$(post /feedback "$payload")
check "Comment over 500 characters -> 400" 400 "$status"

# 11. Valid feedback -> 200
status=$(post /feedback '{"rating":4,"comment":"Solid starting point."}')
check "Valid feedback -> 200" 200 "$status"

# 12. Rapid repeated requests -> 429 eventually
echo
echo "Sending rapid repeated /feedback requests (limit is 3/60s per IP)..."
last_status="unknown"
saw_429="no"
for i in 1 2 3 4 5; do
  last_status=$(post /feedback '{"rating":1}')
  echo "  request $i -> $last_status"
  if [ "$last_status" = "429" ]; then
    saw_429="yes"
    break
  fi
done
if [ "$saw_429" = "yes" ]; then
  echo "PASS  Rapid repeated requests -> 429"
  pass=$((pass + 1))
else
  echo "FAIL  Rapid repeated requests -> 429 (never saw a 429; note: ENVIRONMENT=development skips rate limiting)"
  fail=$((fail + 1))
fi

echo
echo "Secrets hygiene (static checks, no server required):"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if git -C "$repo_root" grep -Ilq -e 'sk-ant-api' -- . 2>/dev/null; then
  echo "FAIL  Anthropic key pattern found in repository"
  fail=$((fail + 1))
else
  echo "PASS  No Anthropic key pattern in repository"
  pass=$((pass + 1))
fi

if git -C "$repo_root" grep -Ilq -e '^TURNSTILE_SECRET_KEY=0x[0-9A-Za-z_-]+$' -- . 2>/dev/null; then
  echo "FAIL  A real-looking Turnstile secret key found in repository"
  fail=$((fail + 1))
else
  echo "PASS  No real-looking Turnstile secret key in repository"
  pass=$((pass + 1))
fi

for entry in .dev.vars .env .wrangler node_modules quality-output design-reference; do
  if grep -qxF "$entry/" "$repo_root/.gitignore" 2>/dev/null || grep -qxF "$entry" "$repo_root/.gitignore" 2>/dev/null || grep -q "^${entry}" "$repo_root/.gitignore" 2>/dev/null; then
    echo "PASS  .gitignore covers $entry"
    pass=$((pass + 1))
  else
    echo "FAIL  .gitignore does not cover $entry"
    fail=$((fail + 1))
  fi
done

echo
echo "${pass} passed, ${fail} failed."
[ "$fail" -eq 0 ]
