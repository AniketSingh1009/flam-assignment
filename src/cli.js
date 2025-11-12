#!/usr/bin/env node
import { JobQueue } from './queue.js';
import { WorkerManager } from './worker.js';
import { Config } from './config.js';

const queue = new JobQueue();
const workerManager = new WorkerManager(queue);
const config = new Config();

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

async function main() {
  try {
    if (command === 'enqueue') {
      const jobData = JSON.parse(args[1]);
      const job = queue.enqueue(jobData);
      console.log(`✓ Job enqueued: ${job.id}`);
    }
    else if (command === 'worker') {
      if (subcommand === 'start') {
        const countIndex = args.indexOf('--count');
        const count = countIndex !== -1 ? parseInt(args[countIndex + 1]) : 1;
        workerManager.start(count);
        console.log(`✓ Started ${count} worker(s)`);
        
        process.on('SIGINT', () => {
          console.log('\n⏳ Gracefully shutting down workers...');
          workerManager.stop();
        });
        
        await new Promise(() => {});
      }
      else if (subcommand === 'stop') {
        workerManager.stop();
        console.log('✓ Workers stopped');
      }
    }
    else if (command === 'status') {
      const stats = queue.getStats();
      const workers = workerManager.getActiveWorkers();
      console.log('\n📊 Queue Status:');
      console.log(`  Pending:    ${stats.pending}`);
      console.log(`  Processing: ${stats.processing}`);
      console.log(`  Completed:  ${stats.completed}`);
      console.log(`  Failed:     ${stats.failed}`);
      console.log(`  Dead:       ${stats.dead}`);
      console.log(`  Workers:    ${workers} active\n`);
    }
    else if (command === 'list') {
      const stateIndex = args.indexOf('--state');
      const state = stateIndex !== -1 ? args[stateIndex + 1] : null;
      const jobs = queue.listJobs(state);
      console.log(`\n📋 Jobs${state ? ` (${state})` : ''}:`);
      jobs.forEach(job => {
        console.log(`  ${job.id} - ${job.state} - attempts: ${job.attempts}/${job.max_retries}`);
      });
      console.log();
    }
    else if (command === 'dlq') {
      if (subcommand === 'list') {
        const jobs = queue.listDLQ();
        console.log('\n💀 Dead Letter Queue:');
        jobs.forEach(job => {
          console.log(`  ${job.id} - ${job.command} - attempts: ${job.attempts}`);
        });
        console.log();
      }
      else if (subcommand === 'retry') {
        const jobId = args[2];
        queue.retryFromDLQ(jobId);
        console.log(`✓ Job ${jobId} moved back to pending`);
      }
    }
    else if (command === 'config') {
      if (subcommand === 'set') {
        const key = args[2];
        const value = args[3];
        config.set(key, value);
        console.log(`✓ Config updated: ${key} = ${value}`);
      }
      else if (subcommand === 'get') {
        const key = args[2];
        console.log(config.get(key));
      }
      else if (subcommand === 'list') {
        const all = config.getAll();
        console.log('\n⚙️  Configuration:');
        Object.entries(all).forEach(([key, value]) => {
          console.log(`  ${key}: ${value}`);
        });
        console.log();
      }
    }
    else {
      showHelp();
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
queuectl - Background Job Queue System

Usage:
  queuectl enqueue '{"id":"job1","command":"sleep 2"}'
  queuectl worker start --count 3
  queuectl worker stop
  queuectl status
  queuectl list [--state pending|processing|completed|failed|dead]
  queuectl dlq list
  queuectl dlq retry <job-id>
  queuectl config set <key> <value>
  queuectl config get <key>
  queuectl config list
  `);
}

main();
