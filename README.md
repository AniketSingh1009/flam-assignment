# QueueCTL - Background Job Queue System

A production-grade CLI-based background job queue system with worker processes, exponential backoff retry mechanism, and Dead Letter Queue (DLQ) support.

## Features

✅ Job enqueuing and management  
✅ Multiple concurrent worker processes  
✅ Automatic retry with exponential backoff  
✅ Dead Letter Queue for permanently failed jobs  
✅ Persistent storage using SQLite  
✅ Graceful worker shutdown  
✅ Configurable retry and backoff settings  
✅ Job state tracking and monitoring  

## Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Make CLI executable (Unix/Mac)
chmod +x src/cli.js

# Link for global usage (optional)
npm link
```

## Usage Examples

### 1. Enqueue Jobs

**Option A: Using JSON file (recommended for Windows)**
```bash
# Create a job file
echo {"id":"job1","command":"echo Hello"} > job.json

# Enqueue from file
node enqueue-from-file.js job.json

# Or use provided test jobs
node enqueue-from-file.js test-jobs/simple-job.json
node enqueue-from-file.js test-jobs/sleep-job.json
node enqueue-from-file.js test-jobs/fail-job.json
```

**Option B: Direct CLI (Unix/Mac/PowerShell)**
```bash
# Enqueue a simple job
node src/cli.js enqueue '{"id":"job1","command":"echo Hello World"}'

# Enqueue with custom retry limit
node src/cli.js enqueue '{"id":"job2","command":"sleep 2","max_retries":5}'

# Enqueue a job that will fail
node src/cli.js enqueue '{"id":"fail-job","command":"invalid-command"}'
```

### 2. Start Workers

```bash
# Start a single worker
node src/cli.js worker start

# Start multiple workers
node src/cli.js worker start --count 3

# Workers will run until you press Ctrl+C (graceful shutdown)
```

### 3. Monitor Queue Status

```bash
# View queue statistics
node src/cli.js status

# Output:
# Queue Status:
#   Pending:    2
#   Processing: 1
#   Completed:  5
#   Failed:     0
#   Dead:       1
#   Workers:    3 active
```

### 4. List Jobs

```bash
# List all jobs
node src/cli.js list

# List jobs by state
node src/cli.js list --state pending
node src/cli.js list --state completed
node src/cli.js list --state dead
```

### 5. Manage Dead Letter Queue

```bash
# View DLQ jobs
node src/cli.js dlq list

# Retry a job from DLQ
node src/cli.js dlq retry job1
```

### 6. Configuration Management

```bash
# Set max retries
node src/cli.js config set max-retries 5

# Set backoff base (delay = base ^ attempts seconds)
node src/cli.js config set backoff-base 3

# Get a config value
node src/cli.js config get max-retries

# List all configuration
node src/cli.js config list
```

### Job Lifecycle

```
pending → processing → completed
    ↓          ↓
  failed  →  dead (DLQ)
    ↑          ↓
    └─────── retry
```

1. **pending**: Job is waiting to be picked up by a worker
2. **processing**: Job is currently being executed by a worker
3. **completed**: Job executed successfully
4. **failed**: Job failed but can be retried
5. **dead**: Job exhausted all retries and moved to DLQ

### Data Persistence

- Uses JSON file storage (`queue.json`) for persistent storage
- Jobs survive system restarts
- Atomic operations prevent race conditions
- Job locking mechanism prevents duplicate processing

### Worker Logic

- Workers poll for pending jobs every second
- Job locking prevents multiple workers from processing the same job
- Exponential backoff: `delay = backoff_base ^ attempts` seconds
- Graceful shutdown: workers finish current job before exiting
- Stale lock detection (5-minute timeout)

### Retry Mechanism

When a job fails:
1. Increment attempt counter
2. If attempts < max_retries:
   - Mark as 'failed'
   - Calculate backoff delay
   - Requeue after delay
3. If attempts >= max_retries:
   - Move to DLQ (state = 'dead')

Example backoff with base=2:
- Attempt 1: 2^1 = 2 seconds
- Attempt 2: 2^2 = 4 seconds
- Attempt 3: 2^3 = 8 seconds

## Testing Instructions

### Run Automated Tests

```bash
npm test
```

### Manual Testing Scenarios

#### Test 1: Basic Job Completion
```bash
# Terminal 1: Start worker
node src/cli.js worker start

# Terminal 2: Enqueue job
node src/cli.js enqueue '{"command":"echo Success"}'

# Terminal 2: Check status
node src/cli.js status
```

#### Test 2: Failed Job with Retry
```bash
# Terminal 1: Start worker
node src/cli.js worker start

# Terminal 2: Enqueue failing job
node src/cli.js enqueue '{"id":"fail-test","command":"exit 1","max_retries":3}'

# Watch worker logs for retry attempts with backoff
# After 3 attempts, check DLQ
node src/cli.js dlq list
```

#### Test 3: Multiple Workers
```bash
# Terminal 1: Start 3 workers
node src/cli.js worker start --count 3

# Terminal 2: Enqueue multiple jobs
for i in {1..10}; do
  node src/cli.js enqueue "{\"command\":\"sleep 2\"}"
done

# Terminal 2: Monitor status
watch -n 1 'node src/cli.js status'
```

#### Test 4: Persistence Across Restarts
```bash
# Enqueue jobs
node src/cli.js enqueue '{"command":"echo Test"}'
node src/cli.js status

# Restart system (or just check again)
node src/cli.js status  # Jobs still there
```

#### Test 5: Graceful Shutdown
```bash
# Start worker
node src/cli.js worker start

# Enqueue long job
node src/cli.js enqueue '{"command":"sleep 10"}'

# Press Ctrl+C - worker finishes current job before exiting
```

## Project Structure

```
queuectl/
├── src/
│   ├── cli.js              # CLI interface and command routing
│   ├── queue.js            # Job queue management and persistence
│   ├── worker.js           # Worker process and job execution
│   └── config.js           # Configuration 
├── test/
│   └── test.js             # Automated test suite
├── test-jobs/              # Example job files for testing
│   ├── simple-job.json
│   ├── sleep-job.json
│   └── fail-job.json
├── enqueue-from-file.js    # Helper script for enqueuing jobs
├── package.json
├── README.md
├── ARCHITECTURE.md         # Detailed design documentation
├── queue.json              # Job storage (created on first run)
└── config.json             # Configuration storage (created on first run)
```

## Assumptions & Trade-offs

### Assumptions
- Jobs are shell commands that can be executed via `child_process.exec`
- Exit code 0 = success, non-zero = failure
- Single machine deployment (not distributed)
- SQLite is sufficient for job storage

### Trade-offs
- **JSON vs SQLite/Redis**: Chose JSON file storage for zero external dependencies and maximum portability
- **Polling vs Events**: Workers poll every second (simple, reliable, low overhead)
- **File-based locking**: Used database locks instead of file system locks for atomicity
- **No job output storage**: Keeps implementation minimal (can be added as bonus feature)
- **Simple backoff**: Exponential backoff without jitter (sufficient for most cases)

### Edge Cases Handled
- Duplicate job processing prevention via locking
- Stale lock detection (5-minute timeout)
- Graceful shutdown with job completion
- Invalid commands fail gracefully
- Database transaction safety
- Concurrent worker access

## Configuration Options

| Key | Default | Description |
|-----|---------|-------------|
| max-retries | 3 | Maximum retry attempts before moving to DLQ |
| backoff-base | 2 | Base for exponential backoff calculation |
