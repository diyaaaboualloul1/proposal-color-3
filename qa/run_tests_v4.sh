#!/bin/bash
# SRS Platform QA Test Suite v4
# Tests: Download Markdown endpoint + Bulk Delete endpoint + Frontend bundle check

PASS=0
FAIL=0
RESULTS=""

log_result() {
  local section="$1"
  local label="$2"
  local status="$3"  # PASS or FAIL
  local detail="$4"
  if [ "$status" = "PASS" ]; then
    PASS=$((PASS+1))
    RESULTS="${RESULTS}\n  ✅ ${label}: ${detail}"
  else
    FAIL=$((FAIL+1))
    RESULTS="${RESULTS}\n  ❌ ${label}: ${detail}"
  fi
}

echo "Getting SRS auth token..."
TOKEN=$(curl -s -X POST http://127.0.0.1:6001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"diyaa@5ostudios.com","password":"Admin2026!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

if [ -z "$TOKEN" ] || [ "$TOKEN" = "None" ]; then
  echo "❌ FATAL: Could not get auth token"
  exit 1
fi
echo "Token acquired: ${TOKEN:0:20}..."

echo ""
echo "==========================="
echo "=== SECTION 1: Download Markdown ==="
echo "==========================="

# Test 1: download-md returns 200
STATUS=$(curl -s -o /tmp/test.md -w "%{http_code}" \
  "http://127.0.0.1:6001/api/projects/71/srs/1.1/download-md" \
  -H "Authorization: Bearer $TOKEN")
echo "download-md status: $STATUS"
if [ "$STATUS" = "200" ]; then
  log_result "Download MD" "download-md returns 200" "PASS" "Got HTTP 200"
else
  log_result "Download MD" "download-md returns 200" "FAIL" "Got HTTP $STATUS (expected 200)"
fi

# Test 2: content is markdown (size > 1000)
SIZE=$(wc -c < /tmp/test.md)
echo "Markdown file size: $SIZE bytes"
if [ "$SIZE" -gt 1000 ]; then
  log_result "Download MD" "Content size > 1000 bytes" "PASS" "Size: $SIZE bytes"
else
  log_result "Download MD" "Content size > 1000 bytes" "FAIL" "Size: $SIZE bytes (expected > 1000)"
fi

# Test 3: non-existent version → 404
STATUS_404=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://127.0.0.1:6001/api/projects/71/srs/9.9/download-md" \
  -H "Authorization: Bearer $TOKEN")
echo "Non-existent version status: $STATUS_404"
if [ "$STATUS_404" = "404" ]; then
  log_result "Download MD" "Non-existent version → 404" "PASS" "Got HTTP 404"
else
  log_result "Download MD" "Non-existent version → 404" "FAIL" "Got HTTP $STATUS_404 (expected 404)"
fi

# Test 4: no auth → 401
STATUS_401=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://127.0.0.1:6001/api/projects/71/srs/1.1/download-md")
echo "No auth status: $STATUS_401"
if [ "$STATUS_401" = "401" ]; then
  log_result "Download MD" "No auth → 401" "PASS" "Got HTTP 401"
else
  log_result "Download MD" "No auth → 401" "FAIL" "Got HTTP $STATUS_401 (expected 401)"
fi

echo ""
echo "==========================="
echo "=== SECTION 2: Bulk Delete ==="
echo "==========================="

# Create test project 1
P1=$(curl -s -X POST http://127.0.0.1:6001/api/projects \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Bulk Test 1","client_name":"Test","description":"test"}')
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('project',{}).get('id'))")
echo "Created project 1 ID: $P1_ID"

# Create test project 2
P2=$(curl -s -X POST http://127.0.0.1:6001/api/projects \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Bulk Test 2","client_name":"Test","description":"test"}')
P2_ID=$(echo "$P2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('project',{}).get('id'))")
echo "Created project 2 ID: $P2_ID"

if [ "$P1_ID" = "None" ] || [ -z "$P1_ID" ] || [ "$P2_ID" = "None" ] || [ -z "$P2_ID" ]; then
  log_result "Bulk Delete" "Create test projects" "FAIL" "Could not create test projects (P1=$P1_ID, P2=$P2_ID)"
else
  log_result "Bulk Delete" "Create test projects" "PASS" "Created P1=$P1_ID, P2=$P2_ID"

  # Test 5: Bulk delete both
  RESULT=$(curl -s -X POST http://127.0.0.1:6001/api/projects/bulk-delete \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"ids\":[$P1_ID,$P2_ID]}")
  echo "Bulk delete result: $RESULT"

  DELETED=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sorted(d.get('deleted',[])))" 2>/dev/null)
  SKIPPED=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('skipped',[]))" 2>/dev/null)
  echo "Deleted: $DELETED, Skipped: $SKIPPED"

  # Check both IDs are in deleted
  HAS_P1=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if $P1_ID in d.get('deleted',[]) else 'no')" 2>/dev/null)
  HAS_P2=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if $P2_ID in d.get('deleted',[]) else 'no')" 2>/dev/null)

  if [ "$HAS_P1" = "yes" ] && [ "$HAS_P2" = "yes" ]; then
    log_result "Bulk Delete" "Bulk delete both projects" "PASS" "Both IDs in deleted list"
  else
    log_result "Bulk Delete" "Bulk delete both projects" "FAIL" "deleted=$DELETED, skipped=$SKIPPED"
  fi

  # Test 6: verify DB shows 0
  DB_COUNT=$(PGPASSWORD=SrsPlatform2026! psql -U srs_user -h 127.0.0.1 -d srs_platform_db -tAc \
    "SELECT COUNT(*) FROM projects WHERE id IN ($P1_ID,$P2_ID);" 2>/dev/null | tr -d ' ')
  echo "DB count after delete: $DB_COUNT"
  if [ "$DB_COUNT" = "0" ]; then
    log_result "Bulk Delete" "Verify deleted from DB" "PASS" "DB count=0"
  else
    log_result "Bulk Delete" "Verify deleted from DB" "FAIL" "DB count=$DB_COUNT (expected 0)"
  fi
fi

# Test 7: Bulk delete with invalid IDs
RESULT2=$(curl -s -X POST http://127.0.0.1:6001/api/projects/bulk-delete \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"ids":[99999,99998]}')
echo "Invalid IDs result: $RESULT2"
SKIP_COUNT=$(echo "$RESULT2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('skipped',[])))" 2>/dev/null)
DEL_COUNT=$(echo "$RESULT2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('deleted',[])))" 2>/dev/null)
if [ "$DEL_COUNT" = "0" ] && [ "$SKIP_COUNT" = "2" ]; then
  log_result "Bulk Delete" "Invalid IDs → skipped" "PASS" "deleted=[], skipped=[99999,99998]"
else
  log_result "Bulk Delete" "Invalid IDs → skipped" "FAIL" "deleted_count=$DEL_COUNT, skipped_count=$SKIP_COUNT"
fi

# Test 8: Empty ids array → 400
STATUS_400=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:6001/api/projects/bulk-delete \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"ids":[]}')
echo "Empty ids status: $STATUS_400"
if [ "$STATUS_400" = "400" ]; then
  log_result "Bulk Delete" "Empty ids → 400" "PASS" "Got HTTP 400"
else
  log_result "Bulk Delete" "Empty ids → 400" "FAIL" "Got HTTP $STATUS_400 (expected 400)"
fi

# Test 9: No auth → 401
STATUS_BD_401=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:6001/api/projects/bulk-delete \
  -H "Content-Type: application/json" -d '{"ids":[1]}')
echo "No auth bulk-delete status: $STATUS_BD_401"
if [ "$STATUS_BD_401" = "401" ]; then
  log_result "Bulk Delete" "No auth → 401" "PASS" "Got HTTP 401"
else
  log_result "Bulk Delete" "No auth → 401" "FAIL" "Got HTTP $STATUS_BD_401 (expected 401)"
fi

echo ""
echo "==========================="
echo "=== SECTION 3: Frontend Bundle ==="
echo "==========================="

# Test 10: download-md in bundle
DL_MD_COUNT=$(grep -o "download-md" /srs-platform/frontend/dist/assets/*.js 2>/dev/null | wc -l)
echo "download-md refs in bundle: $DL_MD_COUNT"
if [ "${DL_MD_COUNT:-0}" -ge 1 ]; then
  log_result "Frontend Bundle" "download-md in bundle" "PASS" "Found $DL_MD_COUNT references"
else
  log_result "Frontend Bundle" "download-md in bundle" "FAIL" "0 references found"
fi

# Test 11: bulk-delete in bundle
BD_COUNT=$(grep -o "bulk-delete" /srs-platform/frontend/dist/assets/*.js 2>/dev/null | wc -l)
echo "bulk-delete refs in bundle: $BD_COUNT"
if [ "${BD_COUNT:-0}" -ge 1 ]; then
  log_result "Frontend Bundle" "bulk-delete in bundle" "PASS" "Found $BD_COUNT references"
else
  log_result "Frontend Bundle" "bulk-delete in bundle" "FAIL" "0 references found"
fi

# Print final report
TOTAL=$((PASS+FAIL))
echo ""
echo "==========================="
echo "SRS PLATFORM QA REPORT v4"
echo "==========================="
echo ""
echo "[SECTION] Download Markdown"
# Print results for section 1 (lines 1-4)
echo -e "$RESULTS" | grep -E "download-md|Content size|Non-existent|No auth.*401" | head -4
echo ""
echo "[SECTION] Bulk Delete"
echo -e "$RESULTS" | grep -E "Create test|Bulk delete|Verify deleted|Invalid IDs|Empty ids|No auth.*bulk|No auth → 401" | grep -v "download-md"
echo ""
echo "[SECTION] Frontend Bundle"
echo -e "$RESULTS" | grep -E "download-md in bundle|bulk-delete in bundle"
echo ""
echo "==========================="
echo "SUMMARY: $PASS/$TOTAL passed"
echo "==========================="

# Exit code
if [ "$FAIL" -gt 0 ]; then
  exit 1
else
  exit 0
fi
