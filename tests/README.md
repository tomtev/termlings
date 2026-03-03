# Test Suite

Test scripts for the Termlings project.

## Core Systems

### Message Storage & Streaming

| Test | Purpose | Coverage |
|------|---------|----------|
| `test-message-storage.sh` | Message storage layer with channel/DM splitting | 6 test categories |
| `test-message-watcher.sh` | Smart file watcher with change detection | 8 test categories, 40-53K msgs/sec |
| `test-message-watcher-stress.sh` | File watcher under extreme load | 7 stress tests, 53K msgs/sec |
| `test-delta-streaming-integration.sh` | Client-side delta merging integration | 6 integration scenarios |
| `test-e2e-delta-streaming.sh` | Complete end-to-end workflow | 286K+ messages, 30K+ task updates |

### Load & Performance

| Test | Purpose | Scale |
|------|---------|-------|
| `test-large-project-stress.sh` | Large projects with many messages | 10K-50K messages, 150+ channels |
| `test-task-stress.sh` | Task-heavy projects | 1K-5K tasks, 8000 updates/sec |

### Features

| Test | Purpose |
|------|---------|
| `test-browser.sh` | Browser automation with PinchTab |
| `test-query-patterns.sh` | Query patterns for token-efficient automation |
| `avatar.test.ts` | Avatar rendering system |

---

## Quick Start

### Run All Tests
```bash
cd tests
bash test-delta-streaming-integration.sh      # Integration
bash test-large-project-stress.sh             # Large projects
bash test-task-stress.sh                      # Task-heavy
bash test-e2e-delta-streaming.sh              # End-to-end
```

### Run Specific Test Category
```bash
# Message storage
bash test-message-storage.sh

# Message watcher
bash test-message-watcher.sh
bash test-message-watcher-stress.sh

# Browser automation
bash test-browser.sh
```

---

## Test Results Summary

### ✅ All Passing

**Delta Streaming Tests**:
- ✓ 6 integration scenarios
- ✓ 8 large project stress tests
- ✓ 6 task-heavy stress tests
- ✓ Complete end-to-end workflow with 286K+ messages

**Performance**:
- 40K-50K messages/sec throughput
- 7K-8K task updates/sec
- <1ms delta application time
- 99%+ bandwidth savings

**Scalability**:
- 50K+ messages per project
- 5K+ tasks per project
- 1K+ calendar events per project
- 6.88 MB total project size (smooth)

---

## Continuous Integration

These tests can be run in CI/CD pipelines to verify:
- ✅ Message storage works correctly
- ✅ File watcher detects changes reliably
- ✅ Delta streaming scales to large projects
- ✅ Task system handles high load
- ✅ End-to-end workflow functions correctly

---

## Performance Benchmarks

| Scenario | Rate | Notes |
|----------|------|-------|
| Message creation | 40K-50K msgs/sec | File-based, real-time |
| Task updates | 7K-8K updates/sec | With persistence |
| Delta merging | 100 deltas in <1ms | Client-side |
| File watcher | 38K+ changes/sec | Smart filtering |
| Mixed workload | 28K+ msgs/sec | From e2e test |

---

## Troubleshooting

### Tests Won't Run
1. Ensure Bun is installed: `bun --version`
2. Check disk space for temp files
3. Verify file permissions: `chmod +x tests/test-*.sh`

### Slow Performance
1. Check system CPU/memory: `top`
2. Check disk I/O: `iostat` or `iotop`
3. Run tests on SSD for better performance

### Test Failures
1. Check `.termlings/` directory doesn't exist from previous test
2. Verify Bun has correct TypeScript setup
3. Run single test first: `bash test-message-storage.sh`

---

## Contributing

When adding new tests:
1. Follow naming: `test-{feature}.sh`
2. Use cleanup trap: `trap "rm -rf $TMPDIR" EXIT`
3. Print clear progress: `echo "Test N: Description"`
4. Show results: `✓ Test passed`
5. Document in this README

Example:
```bash
#!/bin/bash
set -e
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "Test: My Feature"
# ... test code ...
echo "✓ Test passed"
```
