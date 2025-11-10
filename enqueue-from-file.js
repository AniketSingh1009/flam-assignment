import { JobQueue } from './src/queue.js';
import fs from 'fs';

const filename = process.argv[2] || 'test-job.json';
const jobData = JSON.parse(fs.readFileSync(filename, 'utf8'));
const queue = new JobQueue();
const job = queue.enqueue(jobData);
console.log(`✓ Job enqueued: ${job.id}`);
console.log(`  Command: ${job.command}`);
console.log(`  Max retries: ${job.max_retries}`);
