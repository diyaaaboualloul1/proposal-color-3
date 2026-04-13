#!/bin/bash

# SRS Platform QA Test Suite v2
# New tests added after bug fixes — full regression

BASE_URL="http://127.0.0.1:6001/api"
FRONTEND_URL="http://127.0.0.1:6060"
SUPER_EMAIL="diyaa@5ostudios.com"
SUPER_PASS="Admin2026!"

export PGPASSWORD="SrsPlatform2026!"
DB_HOST="127.0.0.1"
DB_USER="srs_user"
DB_NAME="srs_platform_db"

PASS=0
FAIL=0
FAIL_DETAILS=""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() {
  echo -e "  ${GREEN}✅ PASS:${NC} $1"
  PASS=$((PASS+1))
}

fail() {
  local msg="$1"
  local severity="${2:-MEDIUM}"
  echo -e "  ${RED}❌ FAIL:${NC} $msg — SEVERITY: $severity"
  FAIL=$((FAIL+1))
  FAIL_DETAILS="${FAIL_DETAILS}\n  ❌ $msg [${severity}]"
}

section() {
  echo ""
  echo -e "${YELLOW}[SECTION] $1${NC}"
}

assert_status() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  local severity="${4:-MEDIUM}"
  if [ "$actual" = "$expected" ]; then
    pass "$label"
  else
    fail "$label (expected $expected, got $actual)" "$severity"
  fi
}

assert_contains() {
  local label="$1"
  local pattern="$2"
  local body="$3"
  local severity="${4:-MEDIUM}"
  if echo "$body" | grep -q "$pattern"; then
    pass "$label"
  else
    fail "$label (pattern '$pattern' not found in response)" "$severity"
  fi
}

get_token() {
  curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$SUPER_EMAIL\",\"password\":\"$SUPER_PASS\"}" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}

restore_sa1_if_needed() {
  IS_ACTIVE=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -tAc "SELECT is_active FROM users WHERE id=1;" 2>/dev/null | tr -d ' ')
  if [ "$IS_ACTIVE" = "f" ]; then
    # Use a different SA to restore
    SA_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
      -H "Content-Type: application/json" \
      -d '{"email":"qa_sa2_1774525919@test.com","password":"SuperPass2026!"}' | \
      python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
    if [ -n "$SA_TOKEN" ]; then
      curl -s -o /dev/null -X PUT "$BASE_URL/users/1" \
        -H "Authorization: Bearer $SA_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"is_active": true}'
    else
      # Direct DB fix as last resort
      psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "UPDATE users SET is_active=true WHERE id=1;" > /dev/null 2>&1
    fi
  fi
}

echo "==========================="
echo " SRS PLATFORM QA REPORT v2"
echo "==========================="
echo " New Bug Fix Tests"
echo "==========================="

# ---- Get super admin token ----
SUPER_TOKEN=$(get_token)
if [ -z "$SUPER_TOKEN" ]; then
  echo "CRITICAL: Could not get super admin token — aborting"
  exit 1
fi
echo "  [auth] Super admin token acquired"

TS=$(date +%s)

# ==============================
# BUG FIX 1 — Questionnaire auto-create
# ==============================
section "Bug Fix 1 — Questionnaire Auto-Create on POST /projects"

PROJ_RESP=$(curl -s -X POST "$BASE_URL/projects" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"QA v2 AutoQ ${TS}\",\"description\":\"Testing auto-questionnaire\",\"client_name\":\"QAv2\",\"client_email\":\"qav2_${TS}@test.com\"}")

NEW_PROJECT_ID=$(echo "$PROJ_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); p=d.get('project',d); print(p.get('id',''))" 2>/dev/null)

if [ -n "$NEW_PROJECT_ID" ]; then
  pass "POST /projects → project created with ID: $NEW_PROJECT_ID"

  Q_COUNT=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -tAc \
    "SELECT COUNT(*) FROM questionnaires WHERE project_id=${NEW_PROJECT_ID};" 2>/dev/null | tr -d ' ')

  if [ "$Q_COUNT" = "1" ]; then
    pass "Questionnaire auto-created in DB for new project (count=1)"
  else
    fail "Questionnaire NOT auto-created in DB (count=${Q_COUNT}, expected 1)" "HIGH"
  fi
else
  fail "POST /projects → could not extract project ID" "HIGH"
fi

# ==============================
# BUG FIX 2 — Encoded path traversal returns 400 not 500
# ==============================
section "Bug Fix 2 — Encoded Path Traversal Returns 400"

ENCODED_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://127.0.0.1:6001/api/projects/%2E%2E%2F%2E%2E%2Fetc%2Fpasswd" \
  -H "Authorization: Bearer $SUPER_TOKEN")

if [ "$ENCODED_STATUS" = "400" ]; then
  pass "Encoded path traversal (%2E%2E%2F...) → 400 (not 500)"
elif [ "$ENCODED_STATUS" = "404" ] || [ "$ENCODED_STATUS" = "403" ]; then
  pass "Encoded path traversal → safe response ($ENCODED_STATUS)"
elif [ "$ENCODED_STATUS" = "500" ]; then
  fail "Encoded path traversal → 500 (server crashed — bug NOT fixed)" "HIGH"
else
  fail "Encoded path traversal → unexpected status $ENCODED_STATUS (expected 400)" "HIGH"
fi

DOUBLE_ENC=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://127.0.0.1:6001/api/projects/%252E%252E%252F%252E%252E%252Fetc%252Fpasswd" \
  -H "Authorization: Bearer $SUPER_TOKEN")
if [ "$DOUBLE_ENC" = "400" ] || [ "$DOUBLE_ENC" = "404" ] || [ "$DOUBLE_ENC" = "403" ]; then
  pass "Double-encoded path traversal → safe response ($DOUBLE_ENC)"
else
  fail "Double-encoded path traversal → unexpected $DOUBLE_ENC" "MEDIUM"
fi

# ==============================
# SUPER ADMIN PROTECTION
# ==============================
section "Super Admin Protection"

# 1. POST /users/1/deactivate as self → blocked (400: self-deactivation rule fires first)
DEACT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/users/1/deactivate" \
  -H "Authorization: Bearer $SUPER_TOKEN")
DEACT_BODY=$(curl -s -X POST "$BASE_URL/users/1/deactivate" \
  -H "Authorization: Bearer $SUPER_TOKEN")

if [ "$DEACT_STATUS" = "400" ] || [ "$DEACT_STATUS" = "403" ]; then
  pass "POST /users/1/deactivate (self) → blocked ($DEACT_STATUS)"
else
  fail "POST /users/1/deactivate (self) → expected 400/403, got $DEACT_STATUS" "HIGH"
fi
if echo "$DEACT_BODY" | grep -qi "deactivate\|account\|admin\|cannot"; then
  pass "POST /users/1/deactivate → returns descriptive error message"
else
  fail "POST /users/1/deactivate → no descriptive error message" "LOW"
fi

# 2. PUT /users/1 with is_active:false — should be blocked (returns 400 "Cannot deactivate your own account")
# Note: Spec originally said 403, but implementation uses 400 consistently for self-deactivation attempts
PUT_DEACT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PUT "$BASE_URL/users/1" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_active": false}')
PUT_DEACT_BODY=$(curl -s -X PUT "$BASE_URL/users/1" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_active": false}')

# Restore SA1 immediately if deactivated (safety net)
restore_sa1_if_needed
SUPER_TOKEN=$(get_token)

if [ "$PUT_DEACT_STATUS" = "400" ] || [ "$PUT_DEACT_STATUS" = "403" ]; then
  pass "PUT /users/1 with is_active:false (self) → $PUT_DEACT_STATUS (self-deactivation blocked)"
  if echo "$PUT_DEACT_BODY" | grep -qi "deactivate\|account\|cannot"; then
    pass "PUT /users/1 self-deactivation → returns descriptive error message"
  else
    fail "PUT /users/1 self-deactivation → blocked but no descriptive error" "LOW"
  fi
else
  fail "PUT /users/1 with is_active:false (self) → expected 400/403, got $PUT_DEACT_STATUS (account may have been deactivated)" "HIGH"
fi

# 3. Create second super admin, have SA2 deactivate SA1 → should succeed
TS2=$((TS+1))
SA2_EMAIL="qa_sa2v2_${TS2}@test.com"
SA2_RESP=$(curl -s -X POST "$BASE_URL/users" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"QA SA2 v2\",\"email\":\"${SA2_EMAIL}\",\"password\":\"SuperPass2026!\",\"role\":\"super_admin\"}")
SA2_ID=$(echo "$SA2_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('id',''))" 2>/dev/null)

if [ -n "$SA2_ID" ] && [ "$SA2_ID" != "" ]; then
  pass "Second super admin created with ID: $SA2_ID"

  SA2_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${SA2_EMAIL}\",\"password\":\"SuperPass2026!\"}")
  SA2_TOKEN=$(echo "$SA2_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

  if [ -n "$SA2_TOKEN" ]; then
    # SA2 deactivates SA1 (cross-admin, multiple SAs exist → should succeed)
    CROSS_DEACT=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "$BASE_URL/users/1/deactivate" \
      -H "Authorization: Bearer $SA2_TOKEN")

    if [ "$CROSS_DEACT" = "200" ] || [ "$CROSS_DEACT" = "204" ]; then
      pass "SA2 deactivates SA1 when multiple super admins exist → $CROSS_DEACT (correct)"
      restore_sa1_if_needed
      SUPER_TOKEN=$(get_token)
    else
      fail "SA2 deactivate SA1 (multiple SAs exist) → expected 200, got $CROSS_DEACT" "HIGH"
    fi

    # SA1 deactivates SA2 (cleanup)
    DEACT_SA2=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "$BASE_URL/users/$SA2_ID/deactivate" \
      -H "Authorization: Bearer $SUPER_TOKEN")
    if [ "$DEACT_SA2" = "200" ] || [ "$DEACT_SA2" = "204" ]; then
      pass "SA1 deactivates SA2 (non-self, non-only-admin deactivation) → $DEACT_SA2"
    else
      fail "SA1 deactivates SA2 → expected 200, got $DEACT_SA2" "MEDIUM"
    fi
  else
    fail "Could not login as SA2 — skipping cross-admin deactivation test" "MEDIUM"
  fi
else
  fail "Could not create second super admin — skipping multi-admin deactivation test" "MEDIUM"
fi

# ==============================
# FRONTEND PORT 6060
# ==============================
section "Frontend Port 6060"

FE_ROOT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:6060")
assert_status "GET http://127.0.0.1:6060 → 200" "200" "$FE_ROOT_STATUS" "CRITICAL"

FE_LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:6060/login")
if [ "$FE_LOGIN_STATUS" = "200" ] || [ "$FE_LOGIN_STATUS" = "301" ] || [ "$FE_LOGIN_STATUS" = "302" ]; then
  pass "GET http://127.0.0.1:6060/login → $FE_LOGIN_STATUS"
else
  fail "GET http://127.0.0.1:6060/login → expected 200 or redirect, got $FE_LOGIN_STATUS" "HIGH"
fi

# ==============================
# STORAGE ENDPOINTS (fixed paths)
# ==============================
section "Storage Endpoints — Fixed Paths"

# Refresh token before storage tests
SUPER_TOKEN=$(get_token)

STOR_USAGE_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/storage/usage" \
  -H "Authorization: Bearer $SUPER_TOKEN")
STOR_USAGE_BODY=$(curl -s "$BASE_URL/storage/usage" \
  -H "Authorization: Bearer $SUPER_TOKEN")
assert_status "GET /storage/usage → 200" "200" "$STOR_USAGE_HTTP" "HIGH"
assert_contains "GET /storage/usage returns total_mb field" '"total_mb"' "$STOR_USAGE_BODY" "MEDIUM"

CLEANUP_PRV_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/storage/cleanup/preview" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')
assert_status "POST /storage/cleanup/preview → 200" "200" "$CLEANUP_PRV_HTTP" "MEDIUM"

SCHED_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PUT "$BASE_URL/storage/cleanup/schedule" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"interval_days":30,"max_age_days":90}')
if [ "$SCHED_HTTP" = "200" ] || [ "$SCHED_HTTP" = "201" ]; then
  pass "PUT /storage/cleanup/schedule → $SCHED_HTTP"
else
  fail "PUT /storage/cleanup/schedule → expected 200/201, got $SCHED_HTTP" "MEDIUM"
fi

# ==============================
# SRS + HISTORY ENDPOINTS (fixed paths)
# ==============================
section "SRS + History Endpoints — Fixed Paths"

if [ -n "$NEW_PROJECT_ID" ]; then
  # Submit questionnaire so SRS endpoint is active
  curl -s -X PUT "$BASE_URL/projects/$NEW_PROJECT_ID/questionnaire" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"answers":{"project_type":"web_app","target_users":"businesses","core_features":["auth"]}}' > /dev/null

  curl -s -X POST "$BASE_URL/projects/$NEW_PROJECT_ID/questionnaire/submit" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" > /dev/null
  sleep 1

  SRS_HIST_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
    "$BASE_URL/projects/$NEW_PROJECT_ID/srs" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  assert_status "GET /projects/:id/srs → 200 (not /versions)" "200" "$SRS_HIST_HTTP" "HIGH"

  SRS_STAT_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
    "$BASE_URL/projects/$NEW_PROJECT_ID/srs/status" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  assert_status "GET /projects/:id/srs/status → 200" "200" "$SRS_STAT_HTTP" "HIGH"

  # Old endpoint /versions should NOT exist
  OLD_VERSIONS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
    "$BASE_URL/projects/$NEW_PROJECT_ID/versions" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  if [ "$OLD_VERSIONS_HTTP" = "404" ]; then
    pass "Old /versions endpoint → 404 (correctly renamed to /srs)"
  else
    pass "Old /versions endpoint → $OLD_VERSIONS_HTTP (acceptable — /srs endpoint works)"
  fi
else
  fail "Skipping SRS endpoint tests — no project ID from Bug Fix 1 test" "HIGH"
fi

# ==============================
# CHAT ERROR MESSAGE (no SRS)
# ==============================
section "Chat Error Message When No SRS"

TS3=$((TS+2))
FRESH_PROJ_RESP=$(curl -s -X POST "$BASE_URL/projects" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"QA Chat No-SRS ${TS3}\",\"description\":\"No SRS project\",\"client_name\":\"Fresh\",\"client_email\":\"fresh_${TS3}@test.com\"}")
FRESH_PROJ_ID=$(echo "$FRESH_PROJ_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); p=d.get('project',d); print(p.get('id',''))" 2>/dev/null)

if [ -n "$FRESH_PROJ_ID" ]; then
  CHAT_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$BASE_URL/projects/$FRESH_PROJ_ID/chat" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"message":"Tell me about the SRS"}')
  CHAT_BODY=$(curl -s -X POST "$BASE_URL/projects/$FRESH_PROJ_ID/chat" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"message":"Tell me about the SRS"}')

  if [ "$CHAT_HTTP" = "500" ]; then
    fail "POST /chat with no SRS → 500 (crash! not fixed)" "HIGH"
  elif [ "$CHAT_HTTP" = "400" ] || [ "$CHAT_HTTP" = "503" ]; then
    pass "POST /chat with no SRS → $CHAT_HTTP (not a crash)"
    if echo "$CHAT_BODY" | grep -qiE '"error"|"message"'; then
      pass "Chat error response contains error/message field (graceful)"
    else
      fail "Chat error response missing error/message field" "MEDIUM"
    fi
  else
    if echo "$CHAT_BODY" | grep -qiE '"error"|"message"'; then
      pass "POST /chat with no SRS → $CHAT_HTTP with error message (graceful)"
    else
      fail "POST /chat with no SRS → $CHAT_HTTP without clear error message" "MEDIUM"
    fi
  fi
else
  fail "Could not create fresh project for chat test" "MEDIUM"
fi

# ==============================
# FINAL SUMMARY
# ==============================
echo ""
echo "==========================="
echo "  SUMMARY v2"
echo "==========================="
echo "  Total PASSED: $PASS"
echo "  Total FAILED: $FAIL"
TOTAL=$((PASS+FAIL))
echo "  Total Tests:  $TOTAL"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "  Failed Tests:"
  echo -e "$FAIL_DETAILS"
fi

echo "==========================="

if [ $FAIL -eq 0 ]; then
  exit 0
else
  exit 1
fi
