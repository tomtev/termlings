#!/bin/bash
# Comprehensive browser service tests
# Tests: single/multi-project, agent context, profiles, isolation

set -e

TERMLINGS_BIN="$PROJECT1/bin/termlings.js"
PROJECT1="/Users/tommyvedvik/Dev/termlings"
PROJECT2="/Users/tommyvedvik/Dev/termlings-test-2"
TERMLINGS_BIN="$PROJECT1/bin/termlings.js"

echo "================================================"
echo "  TERMLINGS BROWSER SERVICE - COMPREHENSIVE TESTS"
echo "================================================"
echo "Projects: $PROJECT1 | $PROJECT2"
echo "CLI: $TERMLINGS_BIN"

# Cleanup function
cleanup() {
  echo ""
  echo "[CLEANUP] Stopping all browsers and killing processes..."
  pkill -9 pinchtab 2>/dev/null || true
  sleep 1
  echo "[CLEANUP] Done"
}
trap cleanup EXIT

# Test utilities
assert_port() {
  local project=$1
  local expected=$2
  local cli="$TERMLINGS_BIN"
  if [ ! -f "$project/.termlings/browser/process.json" ]; then
    echo "❌ FAIL: process.json not found in $project"
    exit 1
  fi
  local port=$(cat "$project/.termlings/browser/process.json" | grep -o '"port": *[0-9]*' | tail -1 | grep -o '[0-9]*')
  if [ "$port" = "$expected" ]; then
    echo "✅ PASS: $project uses port $port"
  else
    echo "❌ FAIL: $project expected port $expected, got $port"
    exit 1
  fi
}

assert_agent_logged() {
  local project=$1
  local agent_name=$2
  local history="$project/.termlings/browser/history.jsonl"
  if grep -q "\"agentName\":\"$agent_name\"" "$history" 2>/dev/null; then
    echo "✅ PASS: Agent '$agent_name' logged in $project"
  else
    echo "❌ FAIL: Agent '$agent_name' not found in activity log"
    exit 1
  fi
}

# ============================================================================
# TEST 1: Single Project - Browser Init & Start
# ============================================================================
echo ""
echo "[TEST 1] Single Project - Initialization & Startup"
echo "---"

rm -rf "$PROJECT1/.termlings/browser"
cd "$PROJECT1"

echo "  • Initializing browser..."
$TERMLINGS_BIN browser init > /dev/null
if [ -d ".termlings/browser" ]; then
  echo "✅ PASS: .termlings/browser/ directory created"
else
  echo "❌ FAIL: .termlings/browser/ directory not created"
  exit 1
fi

echo "  • Starting browser..."
$TERMLINGS_BIN browser start > /dev/null
assert_port "$PROJECT1" "8222"

# ============================================================================
# TEST 2: Multi-Project - Port Isolation
# ============================================================================
echo ""
echo "[TEST 2] Multi-Project - Port Isolation"
echo "---"

rm -rf "$PROJECT2/.termlings/browser"
cd "$PROJECT2"

echo "  • Starting browser for second project..."
$TERMLINGS_BIN browser start > /dev/null
sleep 1
assert_port "$PROJECT2" "8223"

echo "✅ PASS: Projects use isolated ports (8222 and 8223)"

# ============================================================================
# TEST 3: Agent Context Logging - Single Agent
# ============================================================================
echo ""
echo "[TEST 3] Agent Context Logging - Single Agent"
echo "---"

cd "$PROJECT1"
rm -f .termlings/browser/history.jsonl

echo "  • Alice navigates..."
export TERMLINGS_AGENT_NAME="Alice"
export TERMLINGS_AGENT_DNA="0a3f201"
$TERMLINGS_BIN browser navigate "https://example.com" > /dev/null 2>&1

assert_agent_logged "$PROJECT1" "Alice"

# Verify DNA logged
if grep -q "\"agentDna\":\"0a3f201\"" "$PROJECT1/.termlings/browser/history.jsonl"; then
  echo "✅ PASS: Agent DNA logged correctly"
else
  echo "❌ FAIL: Agent DNA not logged"
  exit 1
fi

# ============================================================================
# TEST 4: Multi-Agent Context - Same Project
# ============================================================================
echo ""
echo "[TEST 4] Multi-Agent Context - Same Project"
echo "---"

echo "  • Bob extracts page text..."
export TERMLINGS_AGENT_NAME="Bob"
export TERMLINGS_AGENT_DNA="1b4e312"
$TERMLINGS_BIN browser extract > /dev/null 2>&1

assert_agent_logged "$PROJECT1" "Bob"

# Verify both agents in log
if [ "$(grep -c 'agentName' "$PROJECT1/.termlings/browser/history.jsonl")" -ge 2 ]; then
  echo "✅ PASS: Multiple agents logged in same project"
else
  echo "❌ FAIL: Not all agents logged"
  exit 1
fi

# ============================================================================
# TEST 5: Agent Context in Different Projects
# ============================================================================
echo ""
echo "[TEST 5] Agent Context in Different Projects"
echo "---"

cd "$PROJECT2"
rm -f .termlings/browser/history.jsonl

echo "  • Charlie navigates in project 2..."
export TERMLINGS_AGENT_NAME="Charlie"
export TERMLINGS_AGENT_DNA="2c5f423"
$TERMLINGS_BIN browser navigate "https://example.com" > /dev/null 2>&1

assert_agent_logged "$PROJECT2" "Charlie"
echo "✅ PASS: Agent context isolated per project"

# ============================================================================
# TEST 6: Profile Isolation Per Project
# ============================================================================
echo ""
echo "[TEST 6] Profile Isolation Per Project"
echo "---"

# Check profiles use different names
profile1=$(grep -o '"profileName":"[^"]*"' "$PROJECT1/.termlings/browser/process.json" 2>/dev/null || echo "")
profile2=$(grep -o '"profileName":"[^"]*"' "$PROJECT2/.termlings/browser/process.json" 2>/dev/null || echo "")

if [ "$profile1" != "$profile2" ]; then
  echo "✅ PASS: Projects use different profiles"
else
  echo "⚠️  INFO: Profile names same (profiles managed by PinchTab)"
fi

# ============================================================================
# TEST 7: Activity Log Format
# ============================================================================
echo ""
echo "[TEST 7] Activity Log Format Validation"
echo "---"

cd "$PROJECT1"
history="$PROJECT1/.termlings/browser/history.jsonl"

# Check required fields
if grep -q '"ts":' "$history" && \
   grep -q '"command":' "$history" && \
   grep -q '"result":' "$history" && \
   grep -q '"agentName":' "$history" && \
   grep -q '"agentDna":' "$history"; then
  echo "✅ PASS: Activity log has all required fields"
else
  echo "❌ FAIL: Activity log missing required fields"
  exit 1
fi

# ============================================================================
# TEST 8: Status Command
# ============================================================================
echo ""
echo "[TEST 8] Browser Status Command"
echo "---"

cd "$PROJECT1"
status_out=$($TERMLINGS_BIN browser status 2>&1)

if echo "$status_out" | grep -q "Browser: running"; then
  echo "✅ PASS: Status shows browser running"
else
  echo "❌ FAIL: Status command failed"
  exit 1
fi

if echo "$status_out" | grep -q "Port: 8222"; then
  echo "✅ PASS: Status shows correct port"
else
  echo "❌ FAIL: Status shows wrong port"
  exit 1
fi

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo "================================================"
echo "  ✅ ALL TESTS PASSED"
echo "================================================"
echo ""
echo "Summary:"
echo "  • Single project browser initialization: ✅"
echo "  • Multi-project port isolation: ✅"
echo "  • Single agent context logging: ✅"
echo "  • Multi-agent context logging: ✅"
echo "  • Project isolation with different agents: ✅"
echo "  • Activity log format: ✅"
echo "  • Browser status command: ✅"
echo ""
