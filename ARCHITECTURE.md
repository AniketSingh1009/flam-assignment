# QueueCTL Architecture

## System Overview

QueueCTL is a lightweight, file-based job queue system designed for single-machine deployments. It uses JSON files for persistence and provides a CLI interface for all operations.

## Core Components

### 1. Job Queue (`src/queue.js`)

The central component that manages job lifecycle and persistence.

**Key Responsibilities:**
- Job storage and retrieval
- State management (pending → processing → completed/failed/dead)
- Job locking to prevent duplicate processing
- Statistics and reporting

**Data Structure:**
```json
{
  "jobs": {
    "job-id-1": {
      "id": "job-id-1",
      "command": "echo Hello",
      "state": "pending",
      "attempts": 0,
      "max_retries": 3,
      "created_at": "2025-11-10T10:00:00Z",
      "updated_at": "2025-11-10T10:00:00Z",
      "locked_by": null,
      "locked_at": null
    }
  }
}
```

**Job Locking Mechanism:**
- When a worker picks up a job, it sets `locked_by` to its worker ID
- `locked_at` timestamp prevents stale locks (5-minute timeout)
- Atomic read-modify-write operations prevent race conditions

### 2. Worker Manager (`src/worker.js`)

Manages worker processes that execute jobs.

**Worker Lifecycle:**
1. Poll for pending jobs every second
2. Acquire job lock
3. Execute command via `child_process.exec`
4. Handle success/failure
5. Update job state
6. Repeat

**Concurrency Control:**
- Each worker has a unique ID
- Database-level locking prevents duplicate processing
- Workers can run in parallel without conflicts

**Graceful Shutdown:**
- Workers check `isRunning()` flag before each iteration
- Current job completes before worker exits
- No jobs are left in inconsistent state

### 3. Configuration Manager (`src/config.js`)

Manages system configuration with persistence.

**Default Configuration:**
```json
{
  "max-retries": 3,
  "backoff-base": 2
}
```

**Configuration is:**
- Persistent across restarts
- Modifiable via CLI
- Applied to new jobs immediately

### 4. CLI Interface (`src/cli.js`)

Command-line interface for all operations.

**Command Categories:**
- Job management (enqueue, list)
- Worker control (start, stop)
- Monitoring (status)
- DLQ operations (list, retry)
- Configuration (set, get, list)

## Job Lifecycle

```
┌─────────┐
│ pending │ ← Job created
└────┬────┘
     │
     ↓ Worker picks up
┌────────────┐
│ processing │
└─────┬──────┘
      │
      ├─→ Success ──→ ┌───────────┐
      │               │ completed │
      │               └───────────┘
      │
      └─→ Failure ──→ ┌────────┐
                      │ failed │ ← Retry with backoff
                      └────┬───┘
                           │
                           ↓ Max retries exceeded
                      ┌──────┐
                      │ dead │ ← Dead Letter Queue
                      └──────┘
```

## Retry Mechanism

### Exponential Backoff

When a job fails:
1. Increment `attempts` counter
2. Calculate delay: `delay = backoff_base ^ attempts` seconds
3. If `attempts < max_retries`:
   - Mark as 'failed'
   - Schedule retry after delay
4. Else:
   - Move to DLQ (state = 'dead')

**Example with backoff_base=2:**
- Attempt 1: 2^1 = 2 seconds
- Attempt 2: 2^2 = 4 seconds
- Attempt 3: 2^3 = 8 seconds

### Dead Letter Queue (DLQ)

Jobs that exhaust all retries are moved to DLQ:
- State changed to 'dead'
- Visible via `dlq list` command
- Can be manually retried via `dlq retry <job-id>`
- Retry resets attempts to 0 and state to 'pending'

## Persistence Strategy

### File-Based Storage

**Advantages:**
- Zero external dependencies
- Simple setup and deployment
- Human-readable format
- Easy backup and migration
- Cross-platform compatibility

**Trade-offs:**
- Not suitable for high-throughput scenarios (>100 jobs/sec)
- File I/O overhead on each operation
- No built-in replication

### Data Integrity

**Atomic Operations:**
- Read entire file
- Modify in memory
- Write entire file
- Node.js `fs.writeFileSync` is atomic on most systems

**Concurrency:**
- File system provides basic locking
- Worker locking prevents duplicate processing
- Stale lock detection handles crashed workers

## Concurrency Model

### Multiple Workers

Workers can run in parallel:
- Each worker has unique ID
- Job locking prevents conflicts
- Workers poll independently
- No inter-worker communication needed

### Race Condition Prevention

**Scenario:** Two workers try to pick the same job

**Solution:**
1. Worker A reads job list
2. Worker B reads job list (sees same pending jobs)
3. Worker A locks job-1 and writes to file
4. Worker B tries to lock job-1 but sees it's already locked
5. Worker B picks next available job

**Implementation:**
```javascript
getNextJob(workerId) {
  const db = this.readDB();
  const jobs = Object.values(db.jobs)
    .filter(job => 
      job.state === 'pending' && 
      (!job.locked_by || isStale(job.locked_at))
    );
  
  if (jobs.length > 0) {
    const job = jobs[0];
    job.locked_by = workerId;
    job.locked_at = now();
    this.writeDB(db);
    return job;
  }
}
```

## Error Handling

### Job Execution Errors

**Exit Code Based:**
- Exit code 0 = Success
- Non-zero = Failure

**Error Types:**
- Command not found → Retry
- Command timeout → Retry
- Command crash → Retry
- Max retries → DLQ

### System Errors

**File System Errors:**
- Handled with try-catch
- Reported to user via CLI
- No silent failures

**Worker Crashes:**
- Stale lock detection (5-minute timeout)
- Job automatically becomes available
- No manual intervention needed

## Performance Characteristics

### Throughput

**Expected Performance:**
- 10-50 jobs/second (single worker)
- Scales linearly with worker count
- Limited by file I/O and command execution time

**Bottlenecks:**
- File read/write operations
- Command execution time
- Polling interval (1 second)

### Scalability

**Vertical Scaling:**
- Add more workers on same machine
- Limited by CPU cores and I/O

**Horizontal Scaling:**
- Not supported (single file storage)
- Would require distributed storage (Redis, PostgreSQL)

## Design Decisions

### Why JSON over SQLite?

**Pros:**
- No native dependencies (works on all platforms)
- No build tools required
- Human-readable
- Easy debugging

**Cons:**
- Lower performance
- No transactions
- No complex queries

**Decision:** Simplicity and portability over performance for this use case.

### Why Polling over Events?

**Pros:**
- Simple implementation
- No event bus needed
- Easy to reason about
- Reliable

**Cons:**
- 1-second latency
- Constant CPU usage (minimal)

**Decision:** Polling is sufficient for most use cases and much simpler.

### Why File Locking over Distributed Locks?

**Pros:**
- No external dependencies
- Works out of the box
- Sufficient for single machine

**Cons:**
- Not suitable for distributed systems

**Decision:** Single-machine deployment is the target use case.

## Future Enhancements

### Potential Improvements

1. **Job Priority Queue**
   - Add priority field
   - Sort by priority then created_at

2. **Scheduled Jobs**
   - Add run_at field
   - Skip jobs until scheduled time

3. **Job Output Logging**
   - Capture stdout/stderr
   - Store in job record

4. **Metrics & Monitoring**
   - Job execution time
   - Success/failure rates
   - Worker utilization

5. **Web Dashboard**
   - Real-time status
   - Job management UI
   - Metrics visualization

6. **Job Timeout**
   - Add timeout field
   - Kill long-running jobs

7. **Job Dependencies**
   - Run jobs in sequence
   - Wait for dependencies

8. **Distributed Mode**
   - Replace JSON with Redis/PostgreSQL
   - Support multiple machines

## Testing Strategy

### Unit Tests

Test individual components:
- Job queue operations
- Worker job execution
- Config management
- State transitions

### Integration Tests

Test full workflows:
- Enqueue → Process → Complete
- Enqueue → Fail → Retry → DLQ
- Multiple workers
- Graceful shutdown

### Manual Testing

Verify user experience:
- CLI commands
- Error messages
- Help text
- Edge cases

## Security Considerations

### Command Injection

**Risk:** Malicious commands in job.command

**Mitigation:**
- Commands executed in isolated shell
- No user input interpolation
- Consider command whitelist for production

### File System Access

**Risk:** Unauthorized access to queue.json

**Mitigation:**
- File permissions (OS-level)
- No remote access
- Consider encryption for sensitive data

### Resource Exhaustion

**Risk:** Too many workers or jobs

**Mitigation:**
- Worker count limits
- Job queue size monitoring
- Rate limiting (future enhancement)

## Deployment

### Single Machine

```bash
# Install
git clone <repo>
cd queuectl
npm install

# Start workers
node src/cli.js worker start --count 4

# Enqueue jobs
node enqueue-from-file.js job.json

# Monitor
node src/cli.js status
```

### Production Considerations

1. **Process Management**
   - Use PM2 or systemd for worker processes
   - Auto-restart on crash

2. **Monitoring**
   - Log worker output
   - Alert on DLQ growth
   - Track job completion rates

3. **Backup**
   - Regular backups of queue.json
   - Config version control

4. **Capacity Planning**
   - Monitor queue depth
   - Scale workers based on load
   - Set job retention policies
