import fs from 'fs';
import { Config } from './config.js';

export class JobQueue {
  constructor(dbPath = 'queue.json') {
    this.dbPath = dbPath;
    this.config = new Config();
    this.initDB();
  }

  initDB() {
    if (!fs.existsSync(this.dbPath)) {
      fs.writeFileSync(this.dbPath, JSON.stringify({ jobs: {} }));
    }
  }

  readDB() {
    const data = fs.readFileSync(this.dbPath, 'utf8');
    return JSON.parse(data);
  }

  writeDB(data) {
    fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
  }

  enqueue(jobData) {
    const db = this.readDB();
    const job = {
      id: jobData.id || `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      command: jobData.command,
      state: 'pending',
      attempts: 0,
      max_retries: jobData.max_retries || this.config.get('max-retries'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      locked_by: null,
      locked_at: null
    };

    db.jobs[job.id] = job;
    this.writeDB(db);
    return job;
  }

  getNextJob(workerId) {
    const db = this.readDB();
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const jobs = Object.values(db.jobs)
      .filter(job => 
        job.state === 'pending' && 
        (!job.locked_by || new Date(job.locked_at) < fiveMinutesAgo)
      )
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    if (jobs.length > 0) {
      const job = jobs[0];
      job.state = 'processing';
      job.locked_by = workerId;
      job.locked_at = now.toISOString();
      job.updated_at = now.toISOString();
      db.jobs[job.id] = job;
      this.writeDB(db);
      return job;
    }
    return null;
  }

  markCompleted(jobId) {
    const db = this.readDB();
    if (db.jobs[jobId]) {
      db.jobs[jobId].state = 'completed';
      db.jobs[jobId].locked_by = null;
      db.jobs[jobId].locked_at = null;
      db.jobs[jobId].updated_at = new Date().toISOString();
      this.writeDB(db);
    }
  }

  markFailed(jobId) {
    const db = this.readDB();
    const job = db.jobs[jobId];
    const newAttempts = job.attempts + 1;
    
    job.attempts = newAttempts;
    job.state = newAttempts >= job.max_retries ? 'dead' : 'failed';
    job.locked_by = null;
    job.locked_at = null;
    job.updated_at = new Date().toISOString();
    
    this.writeDB(db);
    return newAttempts;
  }

  requeueFailed(jobId) {
    const db = this.readDB();
    if (db.jobs[jobId] && db.jobs[jobId].state === 'failed') {
      db.jobs[jobId].state = 'pending';
      db.jobs[jobId].locked_by = null;
      db.jobs[jobId].locked_at = null;
      db.jobs[jobId].updated_at = new Date().toISOString();
      this.writeDB(db);
    }
  }

  getStats() {
    const db = this.readDB();
    const result = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0
    };

    Object.values(db.jobs).forEach(job => {
      result[job.state] = (result[job.state] || 0) + 1;
    });

    return result;
  }

  listJobs(state = null) {
    const db = this.readDB();
    let jobs = Object.values(db.jobs);
    
    if (state) {
      jobs = jobs.filter(job => job.state === state);
    }
    
    return jobs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  listDLQ() {
    const db = this.readDB();
    return Object.values(db.jobs)
      .filter(job => job.state === 'dead')
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }

  retryFromDLQ(jobId) {
    const db = this.readDB();
    if (db.jobs[jobId] && db.jobs[jobId].state === 'dead') {
      db.jobs[jobId].state = 'pending';
      db.jobs[jobId].attempts = 0;
      db.jobs[jobId].locked_by = null;
      db.jobs[jobId].locked_at = null;
      db.jobs[jobId].updated_at = new Date().toISOString();
      this.writeDB(db);
    }
  }
}
