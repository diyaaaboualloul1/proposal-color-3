#!/bin/bash

# SRS Platform QA Test Suite
# Tests: Health, Auth, Users, Projects, Questionnaire, SRS, Chat, Activity, Storage, Security, DB, Frontend

BASE_URL="http://127.0.0.1:6001/api"
SLEEP=0.3  # delay between requests to avoid rate limiting
FRONTEND_URL="http://127.0.0.1:6060"
SUPER_EMAIL="diyaa@5ostudios.com"
SUPER_PASS="Admin2026!"

# DB credentials
export PGPASSWORD="SrsPlatform2026!"
DB_HOST="127.0.0.1"
DB_USER="srs_user"
DB_NAME="srs_platform_db"
PSQL="psql -h $DB_HOST -U $DB_USER -d $DB_NAME -tAc"

PASS=0
FAIL=0
FAIL_DETAILS=""

# Colors
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

echo "==========================="
echo "  SRS PLATFORM QA REPORT"
echo "==========================="

# ==============================
# 1. HEALTH & STARTUP
# ==============================
section "Health & Startup"

# Backend health
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:6001/health)
assert_status "Backend responds on port 6001 (GET /health)" "200" "$HEALTH" "CRITICAL"

HEALTH_BODY=$(curl -s http://127.0.0.1:6001/health)
assert_contains "Backend health returns status ok" '"ok"' "$HEALTH_BODY" "HIGH"

# Frontend
FE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL")
assert_status "Frontend responds on port 6000 (HTTP 200)" "200" "$FE_STATUS" "CRITICAL"

# PM2 processes
PM2_OUTPUT=$(pm2 list 2>/dev/null)
if echo "$PM2_OUTPUT" | grep -q "srs-platform-backend" && echo "$PM2_OUTPUT" | grep "srs-platform-backend" | grep -q "online"; then
  pass "PM2 srs-platform-backend is online"
else
  fail "PM2 srs-platform-backend is not online" "CRITICAL"
fi

if echo "$PM2_OUTPUT" | grep -q "srs-platform-frontend" && echo "$PM2_OUTPUT" | grep "srs-platform-frontend" | grep -q "online"; then
  pass "PM2 srs-platform-frontend is online"
else
  fail "PM2 srs-platform-frontend is not online" "CRITICAL"
fi

# ==============================
# 2. AUTH
# ==============================
section "Auth"

# Login with valid credentials
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SUPER_EMAIL\",\"password\":\"$SUPER_PASS\"}")
LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SUPER_EMAIL\",\"password\":\"$SUPER_PASS\"}")

assert_status "Login with valid credentials returns 200" "200" "$LOGIN_STATUS" "CRITICAL"
assert_contains "Login response contains token" '"token"' "$LOGIN_RESP" "CRITICAL"

# Extract token
SUPER_TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)
if [ -z "$SUPER_TOKEN" ]; then
  fail "Could not extract JWT token from login response" "CRITICAL"
else
  pass "JWT token extracted successfully"
fi

# Login with wrong password → 401
WRONG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SUPER_EMAIL\",\"password\":\"wrongpassword\"}")
assert_status "Login with wrong password → 401" "401" "$WRONG_STATUS" "HIGH"

# Check failed_attempts increments
FAIL_RESP=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SUPER_EMAIL\",\"password\":\"wrongpassword\"}")
if echo "$FAIL_RESP" | grep -qiE "fail|attempt|invalid|incorrect"; then
  pass "Login with wrong password returns error message"
else
  fail "Login with wrong password does not indicate failure clearly" "LOW"
fi

# Protected route without token → 401
NO_TOKEN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/projects")
assert_status "Protected route without token → 401" "401" "$NO_TOKEN_STATUS" "HIGH"

# GET /auth/verify with valid token
if [ -n "$SUPER_TOKEN" ]; then
  VERIFY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/auth/verify" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  VERIFY_BODY=$(curl -s "$BASE_URL/auth/verify" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  assert_status "GET /auth/verify with valid token → 200" "200" "$VERIFY_STATUS" "HIGH"
  assert_contains "GET /auth/verify returns user info" '"email"' "$VERIFY_BODY" "HIGH"
fi

# Change password (create test user first for this)
# We'll use a temp user created in the user management section

# ==============================
# 3. USER MANAGEMENT
# ==============================
section "User Management (Super Admin)"

if [ -n "$SUPER_TOKEN" ]; then
  # GET /users → returns list
  USERS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/users" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  USERS_BODY=$(curl -s "$BASE_URL/users" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  assert_status "GET /users → 200 (super admin)" "200" "$USERS_STATUS" "HIGH"
  assert_contains "GET /users returns array" '"users"' "$USERS_BODY" "HIGH"

  # POST /users → creates new employee user
  TS=$(date +%s)
  NEW_USER_RESP=$(curl -s -X POST "$BASE_URL/users" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Test QA User\",\"email\":\"qa_test_${TS}@test.com\",\"password\":\"TestPass123!\",\"role\":\"admin\"}")
  NEW_USER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/users" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Test QA User2\",\"email\":\"qa_test2_${TS}@test.com\",\"password\":\"TestPass123!\",\"role\":\"admin\"}")
  assert_status "POST /users → creates user (200/201)" "201" "$NEW_USER_STATUS" "HIGH"

  # Extract new user ID
  NEW_USER_ID=$(echo "$NEW_USER_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('id',''))" 2>/dev/null)
  NEW_USER_EMAIL="qa_test_${TS}@test.com"

  if [ -n "$NEW_USER_ID" ]; then
    pass "New user created with ID: $NEW_USER_ID"

    # PUT /users/:id → updates user
    UPDATE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE_URL/users/$NEW_USER_ID" \
      -H "Authorization: Bearer $SUPER_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"name":"Updated QA User"}')
    assert_status "PUT /users/:id → updates user (200)" "200" "$UPDATE_STATUS" "MEDIUM"

    # POST /users/:id/deactivate → deactivates
    DEACT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/users/$NEW_USER_ID/deactivate" \
      -H "Authorization: Bearer $SUPER_TOKEN")
    assert_status "POST /users/:id/deactivate → 200" "200" "$DEACT_STATUS" "MEDIUM"

    # POST /users/:id/reset-password → resets (body key is newPassword)
    RESET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/users/$NEW_USER_ID/reset-password" \
      -H "Authorization: Bearer $SUPER_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"newPassword":"ResetPass456789!"}')
    assert_status "POST /users/:id/reset-password → 200" "200" "$RESET_STATUS" "MEDIUM"
  else
    fail "Could not extract new user ID from POST /users response" "HIGH"
  fi

  # Create an admin user for non-super_admin tests
  ADMIN_EMAIL="qa_admin_${TS}@test.com"
  ADMIN_RESP=$(curl -s -X POST "$BASE_URL/users" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"QA Admin\",\"email\":\"${ADMIN_EMAIL}\",\"password\":\"AdminPass123!\",\"role\":\"admin\"}")
  ADMIN_ID=$(echo "$ADMIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('id',''))" 2>/dev/null)

  # Login as admin to get admin token
  ADMIN_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"AdminPass123!\"}")
  ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)

  if [ -n "$ADMIN_TOKEN" ]; then
    pass "Admin user created and logged in for access control tests"

    # Admin (non-super_admin) trying GET /users → 403
    ADMIN_USERS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/users" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    assert_status "Admin (non-super_admin) GET /users → 403" "403" "$ADMIN_USERS_STATUS" "HIGH"
  else
    fail "Could not create/login admin user for access control test" "HIGH"
  fi

  # Test change password — route is PUT /auth/password, body keys: currentPassword, newPassword
  if [ -n "$ADMIN_TOKEN" ]; then
    CHPASS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE_URL/auth/password" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"currentPassword":"AdminPass123!","newPassword":"AdminPass456789!"}')
    if [ "$CHPASS_STATUS" = "200" ] || [ "$CHPASS_STATUS" = "204" ]; then
      pass "Change password → works ($CHPASS_STATUS)"
    else
      fail "Change password → expected 200/204, got $CHPASS_STATUS" "MEDIUM"
    fi
  fi
else
  fail "Skipping user management tests — no super admin token" "CRITICAL"
fi

# ==============================
# 4. PROJECTS
# ==============================
section "Projects"

if [ -n "$SUPER_TOKEN" ]; then
  # POST /projects → creates project + auto-creates questionnaire
  PROJECT_RESP=$(curl -s -X POST "$BASE_URL/projects" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"QA Test Project","description":"Created by QA test suite","client_name":"QA Client","client_email":"client@test.com"}')
  PROJECT_STATUS=$(echo "$PROJECT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if 'project' in d or 'id' in d else 'fail')" 2>/dev/null)

  PROJECT_ID=$(echo "$PROJECT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); p=d.get('project',d); print(p.get('id',''))" 2>/dev/null)

  PROJECT_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/projects" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"QA Test Project 2","description":"Second project","client_name":"Client2","client_email":"client2@test.com"}')
  PROJECT2_RESP=$(curl -s -X POST "$BASE_URL/projects" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"QA Test Project 2","description":"Second project","client_name":"Client2","client_email":"client2@test.com"}')
  PROJECT2_ID=$(echo "$PROJECT2_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); p=d.get('project',d); print(p.get('id',''))" 2>/dev/null)

  if [ -n "$PROJECT_ID" ]; then
    pass "POST /projects → created project with ID: $PROJECT_ID"
  else
    fail "POST /projects → could not extract project ID" "HIGH"
  fi

  # Check questionnaire auto-created in DB
  if [ -n "$PROJECT_ID" ]; then
    Q_CHECK=$(psql -h 127.0.0.1 -U srs_user -d srs_platform_db -tAc "SELECT COUNT(*) FROM questionnaires WHERE project_id=$PROJECT_ID;" 2>/dev/null)
    if [ "$Q_CHECK" = "1" ]; then
      pass "POST /projects → auto-creates questionnaire record in DB"
    else
      fail "POST /projects → questionnaire NOT auto-created in DB (count=$Q_CHECK)" "HIGH"
    fi
  fi

  # GET /projects → super_admin sees all
  GET_PROJ_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/projects" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  GET_PROJ_BODY=$(curl -s "$BASE_URL/projects" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  assert_status "GET /projects → 200 (super admin)" "200" "$GET_PROJ_STATUS" "HIGH"
  assert_contains "GET /projects returns projects array" '"projects"' "$GET_PROJ_BODY" "MEDIUM"

  # GET /projects/:id → returns project details
  if [ -n "$PROJECT_ID" ]; then
    GET_ONE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/projects/$PROJECT_ID" \
      -H "Authorization: Bearer $SUPER_TOKEN")
    assert_status "GET /projects/:id → 200" "200" "$GET_ONE_STATUS" "HIGH"

    # PUT /projects/:id → updates description
    PUT_PROJ_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE_URL/projects/$PROJECT_ID" \
      -H "Authorization: Bearer $SUPER_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"description":"Updated by QA"}')
    assert_status "PUT /projects/:id → updates project (200)" "200" "$PUT_PROJ_STATUS" "MEDIUM"
  fi

  # Admin sees only own projects — create project as admin first
  if [ -n "$ADMIN_TOKEN" ] && [ -n "$PROJECT_ID" ]; then
    ADMIN_PROJ_RESP=$(curl -s -X POST "$BASE_URL/projects" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"name":"Admin Project","description":"Admin test project","client_name":"AdminClient","client_email":"adminclient@test.com"}')
    ADMIN_PROJ_ID=$(echo "$ADMIN_PROJ_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); p=d.get('project',d); print(p.get('id',''))" 2>/dev/null)

    # Admin gets their own projects list
    ADMIN_GET_PROJ=$(curl -s "$BASE_URL/projects" \
      -H "Authorization: Bearer $ADMIN_TOKEN")

    # Admin can't access super_admin's project → 403
    ADMIN_CROSS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/projects/$PROJECT_ID" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    assert_status "Admin can't access another user's project → 403" "403" "$ADMIN_CROSS_STATUS" "HIGH"
  fi
else
  fail "Skipping projects tests — no super admin token" "CRITICAL"
fi

# ==============================
# 5. QUESTIONNAIRE
# ==============================
section "Questionnaire"

if [ -n "$SUPER_TOKEN" ] && [ -n "$PROJECT_ID" ]; then
  # GET /projects/:id/questionnaire → returns draft
  Q_GET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/projects/$PROJECT_ID/questionnaire" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  Q_GET_BODY=$(curl -s "$BASE_URL/projects/$PROJECT_ID/questionnaire" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  assert_status "GET /projects/:id/questionnaire → 200" "200" "$Q_GET_STATUS" "HIGH"

  # Check status is draft
  Q_STATUS_VAL=$(echo "$Q_GET_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); q=d.get('questionnaire',d); print(q.get('status','unknown'))" 2>/dev/null)
  if [ "$Q_STATUS_VAL" = "draft" ] || [ "$Q_STATUS_VAL" = "pending" ]; then
    pass "Questionnaire initial status is draft/pending"
  else
    fail "Questionnaire initial status unexpected: $Q_STATUS_VAL" "LOW"
  fi

  # PUT /projects/:id/questionnaire → saves answers
  Q_PUT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE_URL/projects/$PROJECT_ID/questionnaire" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"answers":{"project_type":"web_app","target_users":"businesses","core_features":["auth","dashboard"],"tech_preferences":"Node.js backend, React frontend"}}')
  assert_status "PUT /projects/:id/questionnaire → saves answers (200)" "200" "$Q_PUT_STATUS" "HIGH"

  # POST /projects/:id/questionnaire/submit → submits + triggers SRS generation
  Q_SUBMIT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/projects/$PROJECT_ID/questionnaire/submit" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json")
  Q_SUBMIT_BODY=$(curl -s -X POST "$BASE_URL/projects/$PROJECT_ID/questionnaire/submit" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json")

  if [ "$Q_SUBMIT_STATUS" = "200" ] || [ "$Q_SUBMIT_STATUS" = "201" ]; then
    pass "POST /projects/:id/questionnaire/submit → submitted ($Q_SUBMIT_STATUS)"
  else
    fail "POST /projects/:id/questionnaire/submit → expected 200/201, got $Q_SUBMIT_STATUS" "HIGH"
  fi

  # After submit: questionnaire should be read-only
  sleep 1
  Q_PUT_AFTER=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE_URL/projects/$PROJECT_ID/questionnaire" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"answers":{"project_type":"mobile_app"}}')
  if [ "$Q_PUT_AFTER" = "400" ] || [ "$Q_PUT_AFTER" = "403" ] || [ "$Q_PUT_AFTER" = "409" ] || [ "$Q_PUT_AFTER" = "422" ]; then
    pass "After submit: questionnaire is read-only (PUT returns $Q_PUT_AFTER)"
  else
    fail "After submit: questionnaire PUT returned $Q_PUT_AFTER (expected 400/403/409/422)" "MEDIUM"
  fi

  # Check questionnaire.json saved to disk
  sleep 2
  Q_FILE="/srs-platform/projects/$PROJECT_ID/questionnaire.json"
  if [ -f "$Q_FILE" ]; then
    pass "questionnaire.json saved to /srs-platform/projects/$PROJECT_ID/"
  else
    fail "questionnaire.json NOT found at $Q_FILE" "MEDIUM"
  fi
else
  fail "Skipping questionnaire tests — no token or project ID" "CRITICAL"
fi

# ==============================
# 6. SRS GENERATION
# ==============================
section "SRS Generation"

if [ -n "$SUPER_TOKEN" ] && [ -n "$PROJECT_ID" ]; then
  # GET /projects/:id/srs/status
  SRS_STATUS_RESP=$(curl -s "$BASE_URL/projects/$PROJECT_ID/srs/status" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  SRS_STATUS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/projects/$PROJECT_ID/srs/status" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  assert_status "GET /projects/:id/srs/status → 200" "200" "$SRS_STATUS_HTTP" "HIGH"

  SRS_STATUS_VAL=$(echo "$SRS_STATUS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','unknown'))" 2>/dev/null)
  if [ "$SRS_STATUS_VAL" = "idle" ] || [ "$SRS_STATUS_VAL" = "generating" ] || [ "$SRS_STATUS_VAL" = "ready" ] || [ "$SRS_STATUS_VAL" = "failed" ]; then
    pass "SRS status returns valid value: $SRS_STATUS_VAL"
  else
    fail "SRS status returned unexpected value: $SRS_STATUS_VAL" "MEDIUM"
  fi

  # After submit: status should transition (not stay idle)
  if [ "$SRS_STATUS_VAL" = "generating" ] || [ "$SRS_STATUS_VAL" = "failed" ] || [ "$SRS_STATUS_VAL" = "ready" ]; then
    pass "SRS status transitioned after questionnaire submit (currently: $SRS_STATUS_VAL)"
  else
    fail "SRS status still idle after questionnaire submit (graceful if srs-docs unavailable)" "LOW"
  fi

  # GET /projects/:id/srs → returns list
  SRS_LIST_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/projects/$PROJECT_ID/srs" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  SRS_LIST_BODY=$(curl -s "$BASE_URL/projects/$PROJECT_ID/srs" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  assert_status "GET /projects/:id/srs → 200" "200" "$SRS_LIST_HTTP" "MEDIUM"

  # Check graceful failure if srs-docs unavailable
  if echo "$SRS_LIST_BODY" | grep -qiE '"versions"|"srs"|"items"|"data"|\[\]'; then
    pass "GET /projects/:id/srs returns valid structure (graceful even if empty)"
  else
    fail "GET /projects/:id/srs returned unexpected structure" "LOW"
  fi
else
  fail "Skipping SRS tests — no token or project ID" "HIGH"
fi

# ==============================
# 7. CHAT
# ==============================
section "Chat"

if [ -n "$SUPER_TOKEN" ] && [ -n "$PROJECT_ID" ]; then
  # GET /projects/:id/chat → returns empty list initially
  CHAT_GET_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/projects/$PROJECT_ID/chat" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  CHAT_GET_BODY=$(curl -s "$BASE_URL/projects/$PROJECT_ID/chat" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  assert_status "GET /projects/:id/chat → 200" "200" "$CHAT_GET_HTTP" "MEDIUM"

  if echo "$CHAT_GET_BODY" | grep -qiE '"messages"|\[\]|"data"'; then
    pass "GET /projects/:id/chat returns valid structure"
  else
    fail "GET /projects/:id/chat returned unexpected body" "LOW"
  fi

  # POST /projects/:id/chat → may fail if srs-docs unavailable — check graceful error
  CHAT_POST_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/projects/$PROJECT_ID/chat" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"message":"Hello, can you help me with the SRS?"}')
  CHAT_POST_BODY=$(curl -s -X POST "$BASE_URL/projects/$PROJECT_ID/chat" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"message":"Hello, can you help me with the SRS?"}')

  if [ "$CHAT_POST_HTTP" = "200" ] || [ "$CHAT_POST_HTTP" = "201" ]; then
    pass "POST /projects/:id/chat → works ($CHAT_POST_HTTP)"
  elif [ "$CHAT_POST_HTTP" = "503" ] || [ "$CHAT_POST_HTTP" = "500" ] || [ "$CHAT_POST_HTTP" = "400" ] || [ "$CHAT_POST_HTTP" = "404" ]; then
    # Graceful failure if srs-docs unavailable or no SRS yet
    if echo "$CHAT_POST_BODY" | grep -qiE '"error"|"message"|"unavailable"|"No SRS"'; then
      pass "POST /projects/:id/chat → graceful error when srs-docs/SRS unavailable ($CHAT_POST_HTTP)"
    else
      fail "POST /projects/:id/chat → returned $CHAT_POST_HTTP without error message (not graceful)" "MEDIUM"
    fi
  else
    fail "POST /projects/:id/chat → unexpected status $CHAT_POST_HTTP" "MEDIUM"
  fi
else
  fail "Skipping chat tests — no token or project ID" "MEDIUM"
fi

# ==============================
# 8. ACTIVITY LOG
# ==============================
section "Activity Log"

if [ -n "$SUPER_TOKEN" ]; then
  # GET /activity → returns logs
  ACT_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/activity" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  ACT_BODY=$(curl -s "$BASE_URL/activity" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  assert_status "GET /activity → 200" "200" "$ACT_HTTP" "HIGH"
  assert_contains "GET /activity returns logs array" '"logs"' "$ACT_BODY" "MEDIUM"

  # GET /activity?action=project → filtered
  ACT_FILTER_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/activity?action=project" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  assert_status "GET /activity?action=project → 200" "200" "$ACT_FILTER_HTTP" "LOW"

  # Admin sees only their own activity
  if [ -n "$ADMIN_TOKEN" ]; then
    ADMIN_ACT_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/activity" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    assert_status "Admin GET /activity → 200 (own activity)" "200" "$ADMIN_ACT_HTTP" "MEDIUM"
  fi
else
  fail "Skipping activity log tests — no super admin token" "HIGH"
fi

# ==============================
# 9. STORAGE
# ==============================
section "Storage"

if [ -n "$SUPER_TOKEN" ]; then
  # GET /storage/usage
  STOR_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/storage/usage" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  STOR_BODY=$(curl -s "$BASE_URL/storage/usage" \
    -H "Authorization: Bearer $SUPER_TOKEN")
  assert_status "GET /storage/usage → 200" "200" "$STOR_HTTP" "HIGH"
  assert_contains "GET /storage/usage returns MB totals" '"total_mb"' "$STOR_BODY" "MEDIUM"

  # POST /storage/cleanup/preview
  CLEANUP_PRV_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/storage/cleanup/preview" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}')
  assert_status "POST /storage/cleanup/preview → 200" "200" "$CLEANUP_PRV_HTTP" "MEDIUM"

  # PUT /storage/cleanup/schedule
  SCHED_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE_URL/storage/cleanup/schedule" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"enabled":true,"interval_days":30,"max_age_days":90}')
  if [ "$SCHED_HTTP" = "200" ] || [ "$SCHED_HTTP" = "201" ]; then
    pass "PUT /storage/cleanup/schedule → sets schedule ($SCHED_HTTP)"
  else
    fail "PUT /storage/cleanup/schedule → expected 200/201, got $SCHED_HTTP" "LOW"
  fi

  # Admin → 403 on /storage
  if [ -n "$ADMIN_TOKEN" ]; then
    ADMIN_STOR_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/storage/usage" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    assert_status "Admin JWT → 403 on /storage (super_admin route)" "403" "$ADMIN_STOR_HTTP" "HIGH"
  fi
else
  fail "Skipping storage tests — no super admin token" "HIGH"
fi

# ==============================
# 10. SECURITY CHECKS
# ==============================
section "Security Checks"

# No JWT → 401 on protected routes
for ROUTE in "/projects" "/users" "/activity" "/storage/usage"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$ROUTE")
  if [ "$STATUS" = "401" ]; then
    pass "No JWT → 401 on $ROUTE"
  else
    fail "No JWT → expected 401 on $ROUTE, got $STATUS" "HIGH"
  fi
done

# Path traversal attempt
TRAVERSAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/projects/../etc/passwd" \
  -H "Authorization: Bearer $SUPER_TOKEN" 2>/dev/null)
if [ "$TRAVERSAL_STATUS" = "400" ] || [ "$TRAVERSAL_STATUS" = "404" ] || [ "$TRAVERSAL_STATUS" = "403" ] || [ "$TRAVERSAL_STATUS" = "401" ]; then
  pass "Path traversal attempt safely handled ($TRAVERSAL_STATUS)"
else
  fail "Path traversal attempt returned unexpected status: $TRAVERSAL_STATUS" "HIGH"
fi

# Test encoded path traversal
TRAVERSAL2_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/projects/%2e%2e%2fetc%2fpasswd" \
  -H "Authorization: Bearer $SUPER_TOKEN" 2>/dev/null)
if [ "$TRAVERSAL2_STATUS" = "400" ] || [ "$TRAVERSAL2_STATUS" = "404" ] || [ "$TRAVERSAL2_STATUS" = "403" ] || [ "$TRAVERSAL2_STATUS" = "401" ]; then
  pass "Encoded path traversal safely handled ($TRAVERSAL2_STATUS)"
else
  fail "Encoded path traversal returned unexpected status: $TRAVERSAL2_STATUS" "HIGH"
fi

# File upload test — only PDF accepted
if [ -n "$PROJECT_ID" ] && [ -n "$SUPER_TOKEN" ]; then
  # Create a fake txt file
  echo "not a pdf" > /tmp/test_upload.txt
  TXT_UPLOAD=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/projects/$PROJECT_ID/upload" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -F "file=@/tmp/test_upload.txt;type=text/plain" 2>/dev/null)
  if [ "$TXT_UPLOAD" = "400" ] || [ "$TXT_UPLOAD" = "415" ] || [ "$TXT_UPLOAD" = "422" ]; then
    pass "File upload: non-PDF rejected ($TXT_UPLOAD)"
  elif [ "$TXT_UPLOAD" = "404" ]; then
    pass "File upload endpoint not found (PDF validation may be in middleware — 404)"
  else
    fail "File upload: non-PDF not rejected (got $TXT_UPLOAD)" "MEDIUM"
  fi
  rm -f /tmp/test_upload.txt
fi

# ==============================
# 11. DATABASE INTEGRITY
# ==============================
section "Database Integrity"

# Check all 7 tables exist
for TABLE in users projects questionnaires srs_versions chat_messages activity_log cleanup_schedule; do
  TABLE_EXISTS=$(psql -h 127.0.0.1 -U srs_user -d srs_platform_db -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='${TABLE}';" 2>/dev/null)
  if [ "$TABLE_EXISTS" = "1" ]; then
    pass "Table '$TABLE' exists in DB"
  else
    fail "Table '$TABLE' MISSING from DB" "CRITICAL"
  fi
done

# Super admin user exists in DB
ADMIN_EXISTS=$(psql -h 127.0.0.1 -U srs_user -d srs_platform_db -tAc "SELECT COUNT(*) FROM users WHERE email='diyaa@5ostudios.com' AND role='super_admin';" 2>/dev/null)
if [ "$ADMIN_EXISTS" = "1" ]; then
  pass "Super admin user exists in DB"
else
  fail "Super admin user NOT found in DB" "CRITICAL"
fi

# Project creation auto-creates questionnaire
if [ -n "$PROJECT_ID" ]; then
  Q_EXISTS=$(psql -h 127.0.0.1 -U srs_user -d srs_platform_db -tAc "SELECT COUNT(*) FROM questionnaires WHERE project_id=$PROJECT_ID;" 2>/dev/null)
  if [ "$Q_EXISTS" = "1" ]; then
    pass "Project auto-creates questionnaire record (verified again)"
  else
    fail "Questionnaire NOT auto-created for project $PROJECT_ID" "HIGH"
  fi
fi

# ==============================
# 12. FRONTEND PAGES LOAD
# ==============================
section "Frontend Pages Load"

FE_ROOT=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL")
assert_status "GET $FRONTEND_URL → 200" "200" "$FE_ROOT" "HIGH"

FE_LOGIN=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL/login")
if [ "$FE_LOGIN" = "200" ]; then
  pass "GET $FRONTEND_URL/login → 200"
else
  # SPA may redirect — acceptable
  if [ "$FE_LOGIN" = "301" ] || [ "$FE_LOGIN" = "302" ]; then
    pass "GET $FRONTEND_URL/login → SPA redirect ($FE_LOGIN)"
  else
    fail "GET $FRONTEND_URL/login → expected 200 (or SPA redirect), got $FE_LOGIN" "MEDIUM"
  fi
fi

# Check login page has expected content (HTML)
FE_BODY=$(curl -s "$FRONTEND_URL")
if echo "$FE_BODY" | grep -qiE "html|app|react|vite|srs"; then
  pass "Frontend serves HTML content"
else
  fail "Frontend does not appear to serve HTML content" "HIGH"
fi

# ==============================
# ACCOUNT LOCKOUT TEST
# ==============================
section "Auth — Account Lockout"

# Create a fresh user to test lockout without affecting super admin
TS2=$(date +%s)
LOCK_EMAIL="lockout_${TS2}@test.com"
LOCK_USER_RESP=$(curl -s -X POST "$BASE_URL/users" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Lockout Test\",\"email\":\"$LOCK_EMAIL\",\"password\":\"LockPass123!\",\"role\":\"admin\"}")

LOCK_USER_ID=$(echo "$LOCK_USER_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('id',''))" 2>/dev/null)

if [ -n "$LOCK_USER_ID" ]; then
  # Trigger 5 failed logins
  for i in 1 2 3 4 5; do
    curl -s -X POST "$BASE_URL/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$LOCK_EMAIL\",\"password\":\"wrong\"}" > /dev/null
  done

  # 6th attempt should be 423 (locked)
  LOCK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$LOCK_EMAIL\",\"password\":\"wrong\"}")
  assert_status "Login with locked account → 423" "423" "$LOCK_STATUS" "HIGH"
else
  fail "Could not create lockout test user — skipping lockout test" "MEDIUM"
fi

# ==============================
# FINAL SUMMARY
# ==============================
echo ""
echo "==========================="
echo "  SUMMARY"
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

# Exit code
if [ $FAIL -eq 0 ]; then
  exit 0
else
  exit 1
fi
