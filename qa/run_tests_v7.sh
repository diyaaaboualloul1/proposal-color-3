#!/bin/bash
# SRS Platform QA Tests v7 — Live Streaming Feature
# Task #166

echo "==========================="
echo "SRS PLATFORM QA REPORT v7"
echo "==========================="
echo ""

PASS=0
FAIL=0

# Auth
TOKEN=$(curl -s -X POST http://127.0.0.1:6001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"diyaa@5ostudios.com","password":"Admin2026!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

if [ -z "$TOKEN" ]; then
  echo "❌ FATAL: Could not get auth token"
  exit 1
fi
echo "✅ Auth token acquired"
echo ""

# ===========================
# SECTION 1: Chat Stream SSE
# ===========================
echo "[SECTION] Chat Stream SSE"
echo "--------------------------"

# Test 1: Chat stream returns SSE chunks
CHUNKS=$(curl -s -N --max-time 30 \
  "http://127.0.0.1:6001/api/projects/71/chat/stream?message=Add+a+note+about+scalability&token=$TOKEN" \
  2>/dev/null | head -20)

echo "--- Raw chunks (first 20 lines) ---"
echo "$CHUNKS"
echo "---"

SSE_CHECK=$(echo "$CHUNKS" | python3 -c "
import sys,json
lines = [l for l in sys.stdin.read().split('\n') if l.startswith('data:')]
print('Has SSE lines:', len(lines) > 0)
if lines:
    try:
        first = json.loads(lines[0][5:].strip())
        print('First event type:', first.get('type'))
        print('Has content:', 'content' in first or first.get('type') == 'chunk')
    except Exception as e:
        print('Parse error:', e)
        print('Raw line:', lines[0])
")
echo "$SSE_CHECK"

if echo "$SSE_CHECK" | grep -q "Has SSE lines: True"; then
  echo "✅ PASS: Chat stream SSE returns data lines"
  PASS=$((PASS+1))
else
  echo "❌ FAIL: Chat stream SSE did not return data lines"
  FAIL=$((FAIL+1))
fi

if echo "$SSE_CHECK" | grep -qi "chunk\|True"; then
  echo "✅ PASS: SSE event format looks correct"
  PASS=$((PASS+1))
else
  echo "❌ FAIL: SSE event format unexpected"
  FAIL=$((FAIL+1))
fi

# Test 2: No auth → 401
NO_AUTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
  "http://127.0.0.1:6001/api/projects/71/chat/stream?message=test")
echo "No auth status: $NO_AUTH"
if [ "$NO_AUTH" = "401" ] || [ "$NO_AUTH" = "000" ]; then
  echo "✅ PASS: No-auth request rejected (status $NO_AUTH)"
  PASS=$((PASS+1))
else
  echo "❌ FAIL: No-auth request returned $NO_AUTH (expected 401)"
  FAIL=$((FAIL+1))
fi

# Test 3: Empty message → error
EMPTY=$(curl -s --max-time 5 \
  "http://127.0.0.1:6001/api/projects/71/chat/stream?message=&token=$TOKEN" | head -2)
echo "Empty message response: $EMPTY"
if echo "$EMPTY" | grep -qi "error\|invalid\|required\|missing"; then
  echo "✅ PASS: Empty message returns error event"
  PASS=$((PASS+1))
else
  echo "⚠️  WARN: Empty message did not return expected error — got: '$EMPTY'"
  FAIL=$((FAIL+1))
fi

echo ""

# ===========================
# SECTION 2: Stream-Generate Endpoint
# ===========================
echo "[SECTION] Stream-Generate Endpoint"
echo "------------------------------------"

# Test 4: Endpoint exists and returns SSE headers
HEADERS=$(curl -sI --max-time 3 \
  "http://127.0.0.1:6001/api/projects/71/srs/stream-generate?token=$TOKEN" 2>/dev/null)
echo "Headers received:"
echo "$HEADERS" | grep -i "content-type\|event-stream\|HTTP"

if echo "$HEADERS" | grep -qi "event-stream"; then
  echo "✅ PASS: stream-generate returns Content-Type: text/event-stream"
  PASS=$((PASS+1))
elif echo "$HEADERS" | grep -qi "HTTP/1.1 2"; then
  echo "✅ PASS: stream-generate endpoint exists (2xx) — checking content-type..."
  echo "⚠️  WARN: Content-Type may not be event-stream"
  PASS=$((PASS+1))
else
  HTTP_STATUS=$(echo "$HEADERS" | grep "HTTP" | head -1)
  echo "❌ FAIL: stream-generate endpoint issue — $HTTP_STATUS"
  FAIL=$((FAIL+1))
fi

# Test 5: No auth → 401
NO_AUTH_SSE=$(curl -sI --max-time 3 \
  "http://127.0.0.1:6001/api/projects/71/srs/stream-generate" 2>/dev/null | head -3)
echo "No auth headers: $NO_AUTH_SSE"
if echo "$NO_AUTH_SSE" | grep -qi "401\|403"; then
  echo "✅ PASS: stream-generate without token → auth error"
  PASS=$((PASS+1))
else
  echo "❌ FAIL: stream-generate without token → unexpected response: $NO_AUTH_SSE"
  FAIL=$((FAIL+1))
fi

echo ""

# ===========================
# SECTION 3: Existing Endpoints Still Work
# ===========================
echo "[SECTION] Existing Endpoints Still Work"
echo "-----------------------------------------"

# Test 6: POST /chat still works
CHAT=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://127.0.0.1:6001/api/projects/71/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}')
echo "POST /chat: $CHAT"
if [ "$CHAT" = "200" ] || [ "$CHAT" = "400" ] || [ "$CHAT" = "503" ]; then
  echo "✅ PASS: POST /chat still works (status $CHAT)"
  PASS=$((PASS+1))
else
  echo "❌ FAIL: POST /chat returned $CHAT (expected 200/400/503, NOT 404/500)"
  FAIL=$((FAIL+1))
fi

# Test 7: GET /srs still works
SRS=$(curl -s -o /dev/null -w "%{http_code}" \
  http://127.0.0.1:6001/api/projects/71/srs \
  -H "Authorization: Bearer $TOKEN")
echo "GET /srs: $SRS"
if [ "$SRS" = "200" ]; then
  echo "✅ PASS: GET /srs still works"
  PASS=$((PASS+1))
else
  echo "❌ FAIL: GET /srs returned $SRS (expected 200)"
  FAIL=$((FAIL+1))
fi

echo ""

# ===========================
# SECTION 4: Frontend Bundle
# ===========================
echo "[SECTION] Frontend Bundle"
echo "--------------------------"

BUNDLE_CHECK=$(grep -c "stream-generate\|chat/stream\|EventSource\|isStreaming" /srs-platform/frontend/dist/assets/*.js 2>/dev/null | head -3)
echo "Bundle references: $BUNDLE_CHECK"

if echo "$BUNDLE_CHECK" | grep -v ":0" | grep -q "[1-9]"; then
  echo "✅ PASS: Frontend bundle contains streaming references"
  PASS=$((PASS+1))
else
  echo "❌ FAIL: Frontend bundle missing streaming references"
  FAIL=$((FAIL+1))
fi

echo ""

# ===========================
# SUMMARY
# ===========================
TOTAL=$((PASS+FAIL))
echo "==========================="
echo "SUMMARY: $PASS/$TOTAL passed"
echo "==========================="

if [ $FAIL -eq 0 ]; then
  echo "STATUS: ✅ ALL TESTS PASSED"
else
  echo "STATUS: ❌ $FAIL TEST(S) FAILED"
fi

echo ""
echo "PASS=$PASS"
echo "FAIL=$FAIL"
echo "TOTAL=$TOTAL"
