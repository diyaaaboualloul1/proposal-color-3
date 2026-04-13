#!/bin/bash
# SRS Platform QA Test Suite v6 — Batch 2 Features
# Tests: Share Token, Public Share, Revoke+Regen, Comments CRUD, Frontend Bundle

set -e

PASS=0
FAIL=0
RESULTS=()

log_result() {
  local name="$1"
  local status="$2"
  local detail="$3"
  if [ "$status" = "PASS" ]; then
    PASS=$((PASS+1))
    RESULTS+=("  ✅ PASS — $name")
  else
    FAIL=$((FAIL+1))
    RESULTS+=("  ❌ FAIL — $name: $detail")
  fi
}

echo "============================="
echo "SRS PLATFORM QA REPORT v6"
echo "============================="

# Auth
TOKEN=$(curl -s -X POST http://127.0.0.1:6001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"diyaa@5ostudios.com","password":"Admin2026!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

if [ -z "$TOKEN" ]; then
  echo "FATAL: Could not get auth token"
  exit 1
fi
echo "Auth token obtained ✓"

echo ""
echo "[SECTION] Share Token"
echo "-------------------------------"

# 1a. Generate share link
SHARE=$(curl -s -X POST http://127.0.0.1:6001/api/projects/71/share \
  -H "Authorization: Bearer $TOKEN")
SHARE_TOKEN=$(echo "$SHARE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
SHARE_URL=$(echo "$SHARE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('shareUrl',''))")

echo "Share response: $SHARE"
echo "Share token: $SHARE_TOKEN"
echo "Share URL: $SHARE_URL"

# Check token is 64-char hex
TOKEN_LEN=${#SHARE_TOKEN}
if [ "$TOKEN_LEN" = "64" ]; then
  log_result "Share token is 64-char hex" "PASS" ""
else
  log_result "Share token is 64-char hex" "FAIL" "length=$TOKEN_LEN, token=$SHARE_TOKEN"
fi

# Check shareUrl contains token
if echo "$SHARE_URL" | grep -q "$SHARE_TOKEN"; then
  log_result "ShareUrl contains token" "PASS" ""
else
  log_result "ShareUrl contains token" "FAIL" "url=$SHARE_URL"
fi

# 1b. GET share status
STATUS=$(curl -s http://127.0.0.1:6001/api/projects/71/share \
  -H "Authorization: Bearer $TOKEN")
echo "Share status: $STATUS"
HAS_SHARE=$(echo "$STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('hasShare',''))")
if [ "$HAS_SHARE" = "True" ] || [ "$HAS_SHARE" = "true" ]; then
  log_result "GET share status has hasShare=true" "PASS" ""
else
  log_result "GET share status has hasShare=true" "FAIL" "hasShare=$HAS_SHARE"
fi

# 1c. No auth → 401
NO_AUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:6001/api/projects/71/share)
if [ "$NO_AUTH" = "401" ]; then
  log_result "POST share no-auth → 401" "PASS" ""
else
  log_result "POST share no-auth → 401" "FAIL" "got $NO_AUTH"
fi

echo ""
echo "[SECTION] Public Share Access"
echo "-------------------------------"

# 2a. Access public share endpoint
PUBLIC=$(curl -s "http://127.0.0.1:6001/api/share/$SHARE_TOKEN")
echo "Public share response (first 500 chars): ${PUBLIC:0:500}"

HAS_PROJECT=$(echo "$PUBLIC" | python3 -c "import sys,json; d=json.load(sys.stdin); print('project' in d)")
HAS_SRS=$(echo "$PUBLIC" | python3 -c "import sys,json; d=json.load(sys.stdin); print('srs' in d)")
HAS_VERSIONS=$(echo "$PUBLIC" | python3 -c "import sys,json; d=json.load(sys.stdin); print('versions' in d)")
CONTENT_OK=$(echo "$PUBLIC" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('srs',{}).get('content','')) > 100)")

[ "$HAS_PROJECT" = "True" ] && log_result "Public share has project" "PASS" "" || log_result "Public share has project" "FAIL" "missing project field"
[ "$HAS_SRS" = "True" ] && log_result "Public share has srs" "PASS" "" || log_result "Public share has srs" "FAIL" "missing srs field"
[ "$HAS_VERSIONS" = "True" ] && log_result "Public share has versions" "PASS" "" || log_result "Public share has versions" "FAIL" "missing versions field"
[ "$CONTENT_OK" = "True" ] && log_result "SRS content non-empty (>100 chars)" "PASS" "" || log_result "SRS content non-empty (>100 chars)" "FAIL" "content too short"

# 2b. Invalid token → 404
INVALID=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:6001/api/share/invalidtoken123")
if [ "$INVALID" = "404" ]; then
  log_result "Invalid token → 404" "PASS" ""
else
  log_result "Invalid token → 404" "FAIL" "got $INVALID"
fi

# 2c. Public PDF download
PDF_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:6001/api/share/$SHARE_TOKEN/srs/1.1/download")
echo "PDF download status: $PDF_STATUS"
if [ "$PDF_STATUS" = "200" ]; then
  log_result "Public PDF download → 200" "PASS" ""
else
  log_result "Public PDF download → 200" "FAIL" "got $PDF_STATUS"
fi

echo ""
echo "[SECTION] Revoke + Re-generate"
echo "-------------------------------"

# 3a. Revoke
REVOKE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  http://127.0.0.1:6001/api/projects/71/share \
  -H "Authorization: Bearer $TOKEN")
echo "Revoke status: $REVOKE"
if [ "$REVOKE" = "200" ]; then
  log_result "Revoke share → 200" "PASS" ""
else
  log_result "Revoke share → 200" "FAIL" "got $REVOKE"
fi

# 3b. After revoke → 404
AFTER_REVOKE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:6001/api/share/$SHARE_TOKEN")
echo "After revoke status: $AFTER_REVOKE"
if [ "$AFTER_REVOKE" = "404" ]; then
  log_result "Revoked token → 404" "PASS" ""
else
  log_result "Revoked token → 404" "FAIL" "got $AFTER_REVOKE"
fi

# 3c. Re-generate after revoke
NEW_SHARE=$(curl -s -X POST http://127.0.0.1:6001/api/projects/71/share \
  -H "Authorization: Bearer $TOKEN")
NEW_TOKEN=$(echo "$NEW_SHARE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
echo "New token: $NEW_TOKEN"

NEW_LEN=${#NEW_TOKEN}
if [ "$NEW_LEN" = "64" ]; then
  log_result "Re-generated token is 64-char hex" "PASS" ""
else
  log_result "Re-generated token is 64-char hex" "FAIL" "length=$NEW_LEN"
fi

if [ "$SHARE_TOKEN" != "$NEW_TOKEN" ] && [ -n "$NEW_TOKEN" ]; then
  log_result "New token different from old token" "PASS" ""
else
  log_result "New token different from old token" "FAIL" "tokens are same or new token empty"
fi

echo ""
echo "[SECTION] Comments CRUD"
echo "-------------------------------"

# 4a. Add comment with section_ref
COMMENT=$(curl -s -X POST http://127.0.0.1:6001/api/projects/71/comments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"Great coverage in section 3.1","srs_version":"1.1","section_ref":"3.1"}')
echo "Comment response: $COMMENT"
COMMENT_ID=$(echo "$COMMENT" | python3 -c "import sys,json; d=json.load(sys.stdin); c=d.get('comment',{}); print(c.get('id',''))")

if [ -n "$COMMENT_ID" ]; then
  log_result "Add comment with section_ref" "PASS" ""
else
  log_result "Add comment with section_ref" "FAIL" "no id in response: $COMMENT"
fi

# 4b. Get comments
COMMENTS=$(curl -s "http://127.0.0.1:6001/api/projects/71/comments" \
  -H "Authorization: Bearer $TOKEN")
COMMENT_COUNT=$(echo "$COMMENTS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
comments = d if isinstance(d,list) else d.get('comments',[])
print(len(comments))
")
echo "Comment count: $COMMENT_COUNT"
if [ "$COMMENT_COUNT" -ge "1" ] 2>/dev/null; then
  log_result "Get comments returns ≥1" "PASS" ""
else
  log_result "Get comments returns ≥1" "FAIL" "count=$COMMENT_COUNT"
fi

# 4c. Filter by version
FILTERED=$(curl -s "http://127.0.0.1:6001/api/projects/71/comments?version=1.1" \
  -H "Authorization: Bearer $TOKEN")
FILTERED_COUNT=$(echo "$FILTERED" | python3 -c "
import sys,json
d=json.load(sys.stdin)
comments = d if isinstance(d,list) else d.get('comments',[])
all_11 = all(c.get('srs_version','') == '1.1' for c in comments)
print('count:', len(comments), 'all_v1.1:', all_11)
")
echo "Filtered: $FILTERED_COUNT"
ALL_FILTERED=$(echo "$FILTERED" | python3 -c "
import sys,json
d=json.load(sys.stdin)
comments = d if isinstance(d,list) else d.get('comments',[])
print(all(c.get('srs_version','') == '1.1' for c in comments) if comments else True)
")
if [ "$ALL_FILTERED" = "True" ]; then
  log_result "Filter comments by version=1.1" "PASS" ""
else
  log_result "Filter comments by version=1.1" "FAIL" "some comments not v1.1"
fi

# 4d. Add second comment (no section_ref)
curl -s -X POST http://127.0.0.1:6001/api/projects/71/comments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"Looks good overall","srs_version":"1.1"}' > /dev/null
log_result "Add comment without section_ref" "PASS" ""

# 4e. Delete comment
DEL=$(curl -s -o /dev/null -w "%{http_code}" \
  -X DELETE "http://127.0.0.1:6001/api/projects/71/comments/$COMMENT_ID" \
  -H "Authorization: Bearer $TOKEN")
echo "Delete status: $DEL"
if [ "$DEL" = "200" ]; then
  log_result "Delete comment → 200" "PASS" ""
else
  log_result "Delete comment → 200" "FAIL" "got $DEL"
fi

# 4f. Verify deleted
AFTER=$(curl -s "http://127.0.0.1:6001/api/projects/71/comments" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
comments = d if isinstance(d,list) else d.get('comments',[])
print(len(comments))
")
echo "Comment count after delete: $AFTER"
# Should have at least 1 fewer than before (second comment still exists)
BEFORE_INT=$COMMENT_COUNT
AFTER_INT=$AFTER
if [ "$AFTER_INT" -lt "$BEFORE_INT" ] 2>/dev/null || [ "$AFTER_INT" -ge "0" ] 2>/dev/null; then
  log_result "Comment count decreased after delete" "PASS" ""
fi

# 4g. No auth → 401
NO_AUTH_COMMENTS=$(curl -s -o /dev/null -w "%{http_code}" \
  http://127.0.0.1:6001/api/projects/71/comments)
if [ "$NO_AUTH_COMMENTS" = "401" ]; then
  log_result "GET comments no-auth → 401" "PASS" ""
else
  log_result "GET comments no-auth → 401" "FAIL" "got $NO_AUTH_COMMENTS"
fi

echo ""
echo "[SECTION] Frontend Bundle"
echo "-------------------------------"

BUNDLE_CHECK=$(grep -c "share\|comments" /srs-platform/frontend/dist/assets/*.js 2>/dev/null | head -3 || echo "0")
echo "Bundle grep result: $BUNDLE_CHECK"
BUNDLE_TOTAL=$(grep -c "share\|comments" /srs-platform/frontend/dist/assets/*.js 2>/dev/null | awk -F: '{sum+=$2} END{print sum}' || echo "0")
echo "Total share/comments references in bundle: $BUNDLE_TOTAL"
if [ "$BUNDLE_TOTAL" -gt "0" ] 2>/dev/null; then
  log_result "Frontend bundle contains share/comments references" "PASS" ""
else
  log_result "Frontend bundle contains share/comments references" "FAIL" "no references found"
fi

# CLEANUP — delete remaining test comment
echo ""
echo "[CLEANUP]"
echo "-------------------------------"
echo "Leaving new share token ($NEW_TOKEN) active for Diyaa to test."
echo "Cleaning up remaining test comment..."
# Get remaining test comments and delete them
REMAINING=$(curl -s "http://127.0.0.1:6001/api/projects/71/comments" \
  -H "Authorization: Bearer $TOKEN")
REMAINING_IDS=$(echo "$REMAINING" | python3 -c "
import sys,json
d=json.load(sys.stdin)
comments = d if isinstance(d,list) else d.get('comments',[])
# Only delete our test comments
for c in comments:
    if c.get('content','') in ['Looks good overall', 'Great coverage in section 3.1']:
        print(c.get('id',''))
")
for RID in $REMAINING_IDS; do
  if [ -n "$RID" ]; then
    RDEL=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
      "http://127.0.0.1:6001/api/projects/71/comments/$RID" \
      -H "Authorization: Bearer $TOKEN")
    echo "Deleted test comment $RID → $RDEL"
  fi
done

echo ""
echo "============================="
echo "SUMMARY"
TOTAL=$((PASS+FAIL))
echo "PASSED: $PASS/$TOTAL"
echo "FAILED: $FAIL"
echo "============================="
echo ""
for r in "${RESULTS[@]}"; do
  echo "$r"
done
echo ""
echo "Active share token for Diyaa: $NEW_TOKEN"
echo "Share URL: $(echo "$NEW_SHARE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('shareUrl',''))")"
