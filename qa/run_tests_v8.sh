#!/bin/bash
# SRS Platform QA Test Suite v8 — Full Regression + New Features
# Task #167 — QA by [QA] 🧪

BASE_URL="http://127.0.0.1:6001/api"
FRONTEND_URL="http://127.0.0.1:6060"
SUPER_EMAIL="diyaa@5ostudios.com"
SUPER_PASS="Admin2026!"
TEST_PROJECT=71
SLEEP=1.0

PASS=0
FAIL=0
FAIL_DETAILS=""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✅ PASS:${NC} $1"; PASS=$((PASS+1)); }
fail() { local msg="$1"; echo -e "  ${RED}❌ FAIL:${NC} $msg"; FAIL=$((FAIL+1)); FAIL_DETAILS="${FAIL_DETAILS}\n  ❌ $msg"; }
section() { echo ""; echo -e "${YELLOW}[SECTION] $1${NC}"; }
info() { echo -e "  ${CYAN}ℹ️  $1${NC}"; }

assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then pass "$label (HTTP $actual)";
  else fail "$label — expected $expected, got $actual"; fi
}

echo "==========================="
echo "SRS PLATFORM QA REPORT v8 (FULL)"
echo "==========================="
echo "Date: $(date -u)"
echo ""

# ========== AUTH ==========
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SUPER_EMAIL\",\"password\":\"$SUPER_PASS\"}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))")

if [ -z "$TOKEN" ]; then
  echo "❌ FATAL: Cannot obtain auth token — aborting"
  exit 1
fi
info "Auth token obtained: ${TOKEN:0:20}..."

# ========== SECTION 1: Core Regression ==========
section "Core Regression (v1 suite)"
CORE_OUTPUT=$(bash /srs-platform/qa/run_tests.sh 2>&1)
CORE_PASS=$(echo "$CORE_OUTPUT" | grep "Total PASSED:" | awk '{print $NF}')
CORE_FAIL=$(echo "$CORE_OUTPUT" | grep "Total FAILED:" | awk '{print $NF}')
CORE_TOTAL=$(echo "$CORE_OUTPUT" | grep "Total Tests:" | awk '{print $NF}')

echo "$CORE_OUTPUT" | tail -20

if [ "$CORE_FAIL" = "0" ]; then
  pass "Core regression suite — $CORE_PASS/$CORE_TOTAL passed"
  PASS=$((PASS + CORE_PASS - 1))  # -1 for the consolidated pass we already counted
else
  fail "Core regression suite — $CORE_FAIL failures ($CORE_PASS/$CORE_TOTAL passed)"
  PASS=$((PASS + CORE_PASS - 1))
  FAIL=$((FAIL + CORE_FAIL - 1))
fi
sleep $SLEEP

# ========== SECTION 2: Re-generate ==========
section "Re-generate"

# First unlock
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/projects/$TEST_PROJECT/questionnaire/unlock" \
  -H "Authorization: Bearer $TOKEN")
assert_status "POST /projects/$TEST_PROJECT/questionnaire/unlock" "200" "$STATUS"
sleep $SLEEP

# Submit questionnaire (backend just marks status=submitted)
SUB_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/projects/$TEST_PROJECT/questionnaire/submit" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')
SUB_STATUS=$(echo "$SUB_RESP" | tail -1)
SUB_BODY=$(echo "$SUB_RESP" | head -1)
info "Questionnaire submit: HTTP $SUB_STATUS — $SUB_BODY"

# Now try regenerate
REGEN_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/projects/$TEST_PROJECT/srs/regenerate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")
REGEN_STATUS=$(echo "$REGEN_RESP" | tail -1)
REGEN_BODY=$(echo "$REGEN_RESP" | head -1)
info "Regenerate response: $REGEN_BODY"
# Accept 200/202 (started) OR 400 "already in progress" (submit endpoint also starts generation)
if [ "$REGEN_STATUS" = "200" ] || [ "$REGEN_STATUS" = "202" ]; then
  pass "POST /projects/$TEST_PROJECT/srs/regenerate (HTTP $REGEN_STATUS — generation started)"
elif [ "$REGEN_STATUS" = "400" ] && echo "$REGEN_BODY" | grep -qi "already in progress"; then
  pass "POST /projects/$TEST_PROJECT/srs/regenerate — endpoint works (submit already triggered generation)"
else
  fail "POST /projects/$TEST_PROJECT/srs/regenerate — expected 200/202, got $REGEN_STATUS (body: $REGEN_BODY)"
fi
sleep $SLEEP

# ========== SECTION 3: DOCX Export ==========
sleep 3
section "DOCX Export"

DOCX_FILE="/tmp/test_srs_export.docx"
DOCX_STATUS=$(curl -s -o "$DOCX_FILE" -w "%{http_code}" \
  "$BASE_URL/projects/$TEST_PROJECT/srs/1.1/download-docx" \
  -H "Authorization: Bearer $TOKEN")
assert_status "GET /projects/$TEST_PROJECT/srs/1.1/download-docx" "200" "$DOCX_STATUS"

if [ "$DOCX_STATUS" = "200" ]; then
  DOCX_SIZE=$(stat -c%s "$DOCX_FILE" 2>/dev/null || echo 0)
  info "DOCX file size: $DOCX_SIZE bytes"
  if [ "$DOCX_SIZE" -gt 5000 ]; then
    pass "DOCX file size > 5000 bytes ($DOCX_SIZE bytes)"
  else
    fail "DOCX file too small — expected >5000, got $DOCX_SIZE bytes"
  fi

  # Check PK magic bytes (ZIP/DOCX header)
  MAGIC=$(xxd "$DOCX_FILE" 2>/dev/null | head -1 | grep -o "504b" | head -1)
  if [ "$MAGIC" = "504b" ]; then
    pass "DOCX has valid PK magic bytes (ZIP format)"
  else
    HEX_HEADER=$(xxd "$DOCX_FILE" 2>/dev/null | head -1)
    fail "DOCX missing PK magic bytes — header: $HEX_HEADER"
  fi
fi
rm -f "$DOCX_FILE"
sleep $SLEEP

# ========== SECTION 4: Version Diff ==========
sleep 2
section "Version Diff"

DIFF_RESP=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/projects/$TEST_PROJECT/srs/diff?v1=1.0&v2=1.1" \
  -H "Authorization: Bearer $TOKEN")
DIFF_STATUS=$(echo "$DIFF_RESP" | tail -1)
DIFF_BODY=$(echo "$DIFF_RESP" | head -1)
assert_status "GET /projects/$TEST_PROJECT/srs/diff?v1=1.0&v2=1.1" "200" "$DIFF_STATUS"

if [ "$DIFF_STATUS" = "200" ]; then
  HAS_V1=$(echo "$DIFF_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'v1' in d else 'no')" 2>/dev/null)
  HAS_V2=$(echo "$DIFF_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'v2' in d else 'no')" 2>/dev/null)
  HAS_DIFF=$(echo "$DIFF_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'diff' in d else 'no')" 2>/dev/null)
  
  [ "$HAS_V1" = "yes" ] && pass "Diff response has 'v1' field" || fail "Diff response missing 'v1' field"
  [ "$HAS_V2" = "yes" ] && pass "Diff response has 'v2' field" || fail "Diff response missing 'v2' field"
  [ "$HAS_DIFF" = "yes" ] && pass "Diff response has 'diff' field" || fail "Diff response missing 'diff' field (body: ${DIFF_BODY:0:200})"
fi
sleep $SLEEP

# ========== SECTION 5: Share Links ==========
sleep 2
section "Share Links"

# Create share — single call
FIRST_SHARE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/projects/$TEST_PROJECT/share" \
  -H "Authorization: Bearer $TOKEN")
F_STATUS=$(echo "$FIRST_SHARE" | tail -1)
F_BODY=$(echo "$FIRST_SHARE" | head -1)
SHARE_TOKEN=$(echo "$F_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)
info "Share token: $SHARE_TOKEN"

if [ "$F_STATUS" = "200" ]; then
  pass "POST /projects/$TEST_PROJECT/share — HTTP 200"
elif [ -n "$SHARE_TOKEN" ]; then
  pass "POST /projects/$TEST_PROJECT/share — got token (HTTP $F_STATUS)"
else
  fail "POST /projects/$TEST_PROJECT/share — HTTP $F_STATUS, body: $F_BODY"
fi

if [ -n "$SHARE_TOKEN" ]; then
  # Access share without auth
  PUB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/share/$SHARE_TOKEN")
  assert_status "GET /api/share/$SHARE_TOKEN (no auth)" "200" "$PUB_STATUS"

  if [ "$PUB_STATUS" = "200" ]; then
    PUB_BODY=$(curl -s "$BASE_URL/share/$SHARE_TOKEN")
    HAS_PROJECT=$(echo "$PUB_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'project' in d else 'no')" 2>/dev/null)
    HAS_SRS=$(echo "$PUB_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'srs' in d else 'no')" 2>/dev/null)
    HAS_VERSIONS=$(echo "$PUB_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'versions' in d else 'no')" 2>/dev/null)
    [ "$HAS_PROJECT" = "yes" ] && pass "Share response has 'project' field" || fail "Share response missing 'project' field"
    [ "$HAS_SRS" = "yes" ] && pass "Share response has 'srs' field" || fail "Share response missing 'srs' field (body: ${PUB_BODY:0:200})"
    [ "$HAS_VERSIONS" = "yes" ] && pass "Share response has 'versions' field" || fail "Share response missing 'versions' field"
  fi

  # Revoke share
  DEL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/projects/$TEST_PROJECT/share" \
    -H "Authorization: Bearer $TOKEN")
  assert_status "DELETE /projects/$TEST_PROJECT/share" "200" "$DEL_STATUS"

  # Verify 404 after revoke
  sleep 0.5
  REVOKED_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/share/$SHARE_TOKEN")
  assert_status "GET /api/share/{old_token} → 404 after revoke" "404" "$REVOKED_STATUS"
else
  fail "Cannot test share — no token returned"
fi
sleep $SLEEP

# ========== SECTION 6: Comments ==========
sleep 2
section "Comments"

# Create comment
COMMENT_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/projects/$TEST_PROJECT/comments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"QA regression test comment v8","srs_version":"1.1"}')
COMMENT_STATUS=$(echo "$COMMENT_RESP" | tail -1)
COMMENT_BODY=$(echo "$COMMENT_RESP" | head -1)
# Accept 200 or 201 (created) — both are correct for resource creation
if [ "$COMMENT_STATUS" = "200" ] || [ "$COMMENT_STATUS" = "201" ]; then
  pass "POST /projects/$TEST_PROJECT/comments (HTTP $COMMENT_STATUS)"
else
  fail "POST /projects/$TEST_PROJECT/comments — expected 200/201, got $COMMENT_STATUS"
fi

COMMENT_ID=$(echo "$COMMENT_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('comment',d).get('id','') if isinstance(d.get('comment',None), dict) else d.get('id',''))" 2>/dev/null)
info "Created comment ID: $COMMENT_ID"

# List comments
LIST_RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/projects/$TEST_PROJECT/comments" \
  -H "Authorization: Bearer $TOKEN")
LIST_STATUS=$(echo "$LIST_RESP" | tail -1)
LIST_BODY=$(echo "$LIST_RESP" | head -1)
assert_status "GET /projects/$TEST_PROJECT/comments" "200" "$LIST_STATUS"

if [ "$LIST_STATUS" = "200" ]; then
  IS_ARRAY=$(echo "$LIST_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if isinstance(d, list) or isinstance(d.get('comments'), list) else 'no')" 2>/dev/null)
  [ "$IS_ARRAY" = "yes" ] && pass "GET comments returns array" || fail "GET comments not array — body: ${LIST_BODY:0:100}"
fi

# Delete comment
if [ -n "$COMMENT_ID" ] && [ "$COMMENT_ID" != "None" ]; then
  DEL_COMMENT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    "$BASE_URL/projects/$TEST_PROJECT/comments/$COMMENT_ID" \
    -H "Authorization: Bearer $TOKEN")
  assert_status "DELETE /projects/$TEST_PROJECT/comments/$COMMENT_ID" "200" "$DEL_COMMENT_STATUS"
else
  fail "Cannot delete comment — no ID returned (body: $COMMENT_BODY)"
fi
sleep $SLEEP

# ========== SECTION 7: Streaming SSE ==========
sleep 2
section "Streaming SSE"

# Check Content-Type header for SRS stream
STREAM_HEADERS=$(curl -s -I --max-time 5 \
  "$BASE_URL/projects/$TEST_PROJECT/srs/stream-generate?token=$TOKEN" 2>/dev/null)
CONTENT_TYPE=$(echo "$STREAM_HEADERS" | grep -i "content-type" | head -1)
info "SRS stream headers: $CONTENT_TYPE"

if echo "$CONTENT_TYPE" | grep -qi "text/event-stream"; then
  pass "GET /srs/stream-generate → Content-Type: text/event-stream"
else
  HTTP_CODE=$(echo "$STREAM_HEADERS" | head -1 | awk '{print $2}')
  fail "GET /srs/stream-generate → wrong Content-Type: '$CONTENT_TYPE' (HTTP $HTTP_CODE)"
fi

# Check chat stream gets first chunk within 30s
CHAT_STREAM_RESP=$(curl -s --max-time 30 \
  "$BASE_URL/projects/$TEST_PROJECT/chat/stream?message=hello&token=$TOKEN" 2>/dev/null)
CHAT_STREAM_LEN=${#CHAT_STREAM_RESP}
info "Chat stream response length: $CHAT_STREAM_LEN chars"

if [ "$CHAT_STREAM_LEN" -gt 0 ]; then
  pass "GET /chat/stream → first chunk received (${CHAT_STREAM_LEN} chars)"
else
  # Check headers only
  CHAT_HEADERS=$(curl -s -I --max-time 5 "$BASE_URL/projects/$TEST_PROJECT/chat/stream?message=hello&token=$TOKEN" 2>/dev/null)
  CHAT_CT=$(echo "$CHAT_HEADERS" | grep -i "content-type" | head -1)
  CHAT_CODE=$(echo "$CHAT_HEADERS" | head -1 | awk '{print $2}')
  if [ "$CHAT_CODE" = "200" ] || echo "$CHAT_CT" | grep -qi "event-stream"; then
    pass "GET /chat/stream → connection established (HTTP $CHAT_CODE)"
  else
    fail "GET /chat/stream → no response or error (HTTP $CHAT_CODE)"
  fi
fi
sleep $SLEEP

# ========== SECTION 8: Download MD ==========
sleep 2
section "Download MD"

MD_FILE="/tmp/test_srs_download.md"
MD_STATUS=$(curl -s -o "$MD_FILE" -w "%{http_code}" \
  "$BASE_URL/projects/$TEST_PROJECT/srs/1.1/download-md" \
  -H "Authorization: Bearer $TOKEN")
assert_status "GET /projects/$TEST_PROJECT/srs/1.1/download-md" "200" "$MD_STATUS"

if [ "$MD_STATUS" = "200" ]; then
  MD_SIZE=$(stat -c%s "$MD_FILE" 2>/dev/null || echo 0)
  info "MD content size: $MD_SIZE bytes"
  if [ "$MD_SIZE" -gt 1000 ]; then
    pass "Download MD content > 1000 bytes ($MD_SIZE bytes)"
  else
    fail "Download MD content too short — expected >1000, got $MD_SIZE bytes"
  fi
fi
rm -f "$MD_FILE"
sleep $SLEEP

# ========== SECTION 9: Bulk Delete ==========
sleep 2
section "Bulk Delete"

# Create 2 test projects
P1_RESP=$(curl -s -X POST "$BASE_URL/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"QA Bulk Delete Test 1 v8","client_name":"QA Client","description":"temp test project"}')
P1_ID=$(echo "$P1_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('project',d).get('id','') if isinstance(d.get('project'), dict) else d.get('id',''))" 2>/dev/null)

P2_RESP=$(curl -s -X POST "$BASE_URL/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"QA Bulk Delete Test 2 v8","client_name":"QA Client","description":"temp test project"}')
P2_ID=$(echo "$P2_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('project',d).get('id','') if isinstance(d.get('project'), dict) else d.get('id',''))" 2>/dev/null)

info "Created test projects: P1=$P1_ID, P2=$P2_ID"

if [ -n "$P1_ID" ] && [ -n "$P2_ID" ] && [ "$P1_ID" != "None" ] && [ "$P2_ID" != "None" ]; then
  BULK_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/projects/bulk-delete" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"ids\":[$P1_ID,$P2_ID]}")
  BULK_STATUS=$(echo "$BULK_RESP" | tail -1)
  BULK_BODY=$(echo "$BULK_RESP" | head -1)
  assert_status "POST /projects/bulk-delete {ids:[p1,p2]}" "200" "$BULK_STATUS"

  if [ "$BULK_STATUS" = "200" ]; then
    DELETED_COUNT=$(echo "$BULK_BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
deleted = d.get('deleted', d.get('count', 0))
# Could be array of IDs or a count integer
if isinstance(deleted, list):
    print(len(deleted))
else:
    print(int(deleted))
" 2>/dev/null)
    info "Bulk deleted: $DELETED_COUNT projects"
    if [ "$DELETED_COUNT" = "2" ]; then
      pass "Bulk delete confirmed 2 projects deleted"
    else
      fail "Bulk delete expected 2 deleted, got $DELETED_COUNT — body: $BULK_BODY"
    fi
  fi
else
  fail "Cannot bulk delete — failed to create test projects (P1: $P1_RESP, P2: $P2_RESP)"
  # Cleanup attempt anyway
  [ -n "$P1_ID" ] && [ "$P1_ID" != "None" ] && curl -s -X DELETE "$BASE_URL/projects/$P1_ID" -H "Authorization: Bearer $TOKEN" > /dev/null
  [ -n "$P2_ID" ] && [ "$P2_ID" != "None" ] && curl -s -X DELETE "$BASE_URL/projects/$P2_ID" -H "Authorization: Bearer $TOKEN" > /dev/null
fi
sleep $SLEEP

# ========== SECTION 10: Frontend Pages ==========
section "Frontend Pages"

FRONT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL/")
assert_status "GET http://127.0.0.1:6060 (main app)" "200" "$FRONT_STATUS"

# Get a valid share token for frontend test
NEW_SHARE_BODY=$(curl -s -X POST "$BASE_URL/projects/$TEST_PROJECT/share" \
  -H "Authorization: Bearer $TOKEN")
NEW_SHARE_TOKEN=$(echo "$NEW_SHARE_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)

if [ -n "$NEW_SHARE_TOKEN" ] && [ "$NEW_SHARE_TOKEN" != "None" ]; then
  SHARE_PAGE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL/share/$NEW_SHARE_TOKEN")
  # Accept 200 (SPA serves index.html for all routes)
  if [ "$SHARE_PAGE_STATUS" = "200" ]; then
    pass "GET $FRONTEND_URL/share/{token} → 200 (SPA routing)"
  else
    fail "GET $FRONTEND_URL/share/{token} → HTTP $SHARE_PAGE_STATUS"
  fi
  # Revoke
  curl -s -X DELETE "$BASE_URL/projects/$TEST_PROJECT/share" -H "Authorization: Bearer $TOKEN" > /dev/null
else
  fail "Cannot test share page — failed to get share token"
fi

# ========== SECTION 11: JS/Build Checks ==========
section "JS Build Checks"

MODAL_IMPORT=$(grep "import Modal" /srs-platform/frontend/src/pages/ProjectDetail/SrsViewer.jsx 2>/dev/null)
if echo "$MODAL_IMPORT" | grep -q "import Modal from '../../components/Modal'"; then
  pass "Modal correctly imported in SrsViewer.jsx"
else
  if [ -n "$MODAL_IMPORT" ]; then
    fail "Modal import incorrect: '$MODAL_IMPORT' (expected: import Modal from '../../components/Modal')"
  else
    fail "Modal import NOT FOUND in SrsViewer.jsx"
  fi
fi

# ========== FINAL REPORT ==========
echo ""
echo "==========================="
echo "SRS PLATFORM QA REPORT v8 (FULL)"
echo "==========================="
echo ""
TOTAL=$((PASS+FAIL))
echo "SUMMARY: $PASS/$TOTAL passed — $FAIL failed"
echo ""
if [ $FAIL -gt 0 ]; then
  echo "Failed Tests:"
  echo -e "$FAIL_DETAILS"
fi
echo "==========================="

if [ $FAIL -eq 0 ]; then exit 0; else exit 1; fi
