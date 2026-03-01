#!/bin/bash
# Test script for Channel + File-Based Message Storage Implementation
# Tests the new message storage architecture with channels and DM threads

set -e

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

cd "$TMPDIR"

echo "====================================="
echo "Message Storage Test Suite"
echo "====================================="
echo ""

# Helper to run CLI command
run_msg() {
  local session_id="$1"
  local agent_name="$2"
  local agent_dna="$3"
  local target="$4"
  local text="$5"

  TERMLINGS_SESSION_ID="$session_id" \
  TERMLINGS_AGENT_NAME="$agent_name" \
  TERMLINGS_AGENT_DNA="$agent_dna" \
  bun /Users/tommyvedvik/Dev/termlings/bin/termlings.js message "$target" "$text" 2>&1
}

# Test 1: Channel Messages
echo "Test 1: Channel Messages"
echo "------------------------"
run_msg "session-1" "Alice" "dna-alice" "channel:general" "Team standup in 5 mins"
run_msg "session-2" "Bob" "dna-bob" "channel:general" "I will attend"
run_msg "session-1" "Alice" "dna-alice" "channel:engineering" "Deploy ready for review"
echo "✓ Channel messages posted"
echo ""

# Test 2: DM Messages
echo "Test 2: DM Messages"
echo "-------------------"
run_msg "session-1" "Alice" "dna-alice" "agent:dna-bob" "Quick sync needed"
run_msg "session-2" "Bob" "dna-bob" "human:default" "Status update"
echo "✓ DM messages sent"
echo ""

# Test 3: File Structure
echo "Test 3: File Structure"
echo "----------------------"
if [ -f ".termlings/store/messages/channels/general.jsonl" ]; then
  echo "✓ general.jsonl exists"
else
  echo "✗ general.jsonl not found"
  exit 1
fi

if [ -f ".termlings/store/messages/channels/engineering.jsonl" ]; then
  echo "✓ engineering.jsonl exists"
else
  echo "✗ engineering.jsonl not found"
  exit 1
fi

if [ -f ".termlings/store/messages/index.json" ]; then
  echo "✓ index.json exists"
else
  echo "✗ index.json not found"
  exit 1
fi
echo ""

# Test 4: Message Content
echo "Test 4: Message Content"
echo "-----------------------"

# Check general channel has 2 messages
general_count=$(cat .termlings/store/messages/channels/general.jsonl | wc -l)
if [ "$general_count" -eq 2 ]; then
  echo "✓ general channel has 2 messages"
else
  echo "✗ general channel has $general_count messages (expected 2)"
  exit 1
fi

# Check engineering channel has 1 message
eng_count=$(cat .termlings/store/messages/channels/engineering.jsonl | wc -l)
if [ "$eng_count" -eq 1 ]; then
  echo "✓ engineering channel has 1 message"
else
  echo "✗ engineering channel has $eng_count messages (expected 1)"
  exit 1
fi

# Check DM thread exists
if [ -f ".termlings/store/messages/dms/session-2.jsonl" ]; then
  echo "✓ DM thread session-2.jsonl exists"
else
  echo "✗ DM thread not found"
  exit 1
fi
echo ""

# Test 5: Index Content
echo "Test 5: Index Content"
echo "---------------------"

if command -v jq &> /dev/null; then
  channels=$(cat .termlings/store/messages/index.json | jq '.channels | length')
  dms=$(cat .termlings/store/messages/index.json | jq '.dms | length')

  if [ "$channels" -ge 2 ]; then
    echo "✓ Index tracks $channels channels"
  else
    echo "✗ Index has $channels channels (expected >= 2)"
    exit 1
  fi

  if [ "$dms" -ge 1 ]; then
    echo "✓ Index tracks $dms DM threads"
  else
    echo "✗ Index has $dms DM threads (expected >= 1)"
    exit 1
  fi
else
  echo "⚠ jq not installed, skipping detailed index check"
fi
echo ""

# Test 6: Message Fields
echo "Test 6: Message Fields"
echo "----------------------"

# Check channel message has required fields
if cat .termlings/store/messages/channels/general.jsonl | grep -q '"channel":"general"'; then
  echo "✓ Channel messages have channel field"
else
  echo "✗ Channel messages missing channel field"
  exit 1
fi

if cat .termlings/store/messages/channels/general.jsonl | grep -q '"kind":"chat"'; then
  echo "✓ Channel messages have kind:chat"
else
  echo "✗ Channel messages incorrect kind"
  exit 1
fi

if cat .termlings/store/messages/channels/general.jsonl | grep -q '"fromName":"Alice"'; then
  echo "✓ Messages have fromName field"
else
  echo "✗ Messages missing fromName"
  exit 1
fi

if cat .termlings/store/messages/channels/general.jsonl | grep -q '"fromDna":"dna-alice"'; then
  echo "✓ Messages have fromDna field"
else
  echo "✗ Messages missing fromDna"
  exit 1
fi
echo ""

echo "====================================="
echo "All tests passed! ✓"
echo "====================================="
echo ""
echo "Summary:"
echo "- Channel messages: ✓"
echo "- DM messages: ✓"
echo "- File structure: ✓"
echo "- Message content: ✓"
echo "- Index management: ✓"
echo "- Message fields: ✓"
