import { exec } from 'child_process';
import { Config } from './config.js';

export class WorkerManager {
  constructor(queue) {
    this.queue = queue;
    this.workers = [];
    this.config = new Config();
    this.running = false;
  }

  start(count = 1) {
    this.running = true;
    for (let i = 0; i < count; i++) {
      const workerId = `worker-${i + 1}`;
      const worker = new Worker(workerId, this.queue, this.config, () => this.running);
      this.workers.push(worker);
      worker.start();
    }
  }

  stop() {
    this.running = false;
    console.log('Waiting for workers to finish current jobs...');
    setTimeout(() => {
      console.log('✓ All workers stopped');
      process.exit(0);
    }, 1000);
  }

  getActiveWorkers() {
    return this.workers.filter(w => w.isActive()).length;
  }
}

class Worker {
  constructor(id, queue, config, isRunning) {
    this.id = id;
    this.queue = queue;
    this.config = config;
    this.isRunning = isRunning;
    this.active = false;
  }

  isActive() {
    return this.active;
  }

  async start() {
    while (this.isRunning()) {
      const job = this.queue.getNextJob(this.id);
      
      if (job) {
        this.active = true;
        console.log(`[${this.id}] Processing job ${job.id}: ${job.command}`);
        
        try {
          await this.executeJob(job);
          this.queue.markCompleted(job.id);
          console.log(`[${this.id}] ✓ Job ${job.id} completed`);
        } catch (error) {
          const attempts = this.queue.markFailed(job.id);
          console.log(`[${this.id}] ✗ Job ${job.id} failed (attempt ${attempts}/${job.max_retries})`);
          
          if (attempts < job.max_retries) {
            const backoffBase = this.config.get('backoff-base');
            const delay = Math.pow(backoffBase, attempts) * 1000;
            console.log(`[${this.id}] ⏰ Retrying job ${job.id} in ${delay}ms`);
            
            setTimeout(() => {
              this.queue.requeueFailed(job.id);
            }, delay);
          } else {
            console.log(`[${this.id}] 💀 Job ${job.id} moved to DLQ`);
          }
        }
        
        this.active = false;
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  executeJob(job) {
    return new Promise((resolve, reject) => {
      exec(job.command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }
}
