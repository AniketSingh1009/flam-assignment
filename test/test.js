import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

async function runCommand(cmd) {
  try {
    const { stdout, stderr } = await execAsync(cmd);
    return { stdout, stderr, success: true };
  } catch (error) {
    return { stdout: error.stdout, stderr: error.stderr, success: false, error };
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('Running queuectl tests...\n');

  if (fs.existsSync('queue.db')) {
    fs.unlinkSync('queue.db');
  }

  console.log('Test 1: Enqueue a job');
  const result1 = await runCommand('node src/cli.js enqueue "{\\"id\\":\\"test-job-1\\",\\"command\\":\\"echo Hello World\\"}"');
  console.log(result1.stdout);
  console.assert(result1.success, 'Enqueue should succeed');

  console.log('Test 2: Check status');
  const result2 = await runCommand('node src/cli.js status');
  console.log(result2.stdout);
  console.assert(result2.stdout.includes('Pending:    1'), 'Should have 1 pending job');

  console.log('Test 3: List jobs');
  const result3 = await runCommand('node src/cli.js list --state pending');
  console.log(result3.stdout);
  console.assert(result3.stdout.includes('test-job-1'), 'Should list test-job-1');

  console.log('Test 4: Enqueue a failing job');
  await runCommand('node src/cli.js enqueue "{\\"id\\":\\"fail-job\\",\\"command\\":\\"invalid-command-xyz\\",\\"max_retries\\":2}"');

  console.log('Test 5: Config management');
  await runCommand('node src/cli.js config set max-retries 5');
  const result5 = await runCommand('node src/cli.js config get max-retries');
  console.log('max-retries:', result5.stdout.trim());

  console.log('Test 6: List all config');
  const result6 = await runCommand('node src/cli.js config list');
  console.log(result6.stdout);

  console.log('\n✅ All tests completed!');
  console.log('\nTo test workers, run in separate terminals:');
  console.log('  Terminal 1: node src/cli.js worker start --count 2');
  console.log('  Terminal 2: node src/cli.js status');
  console.log('  Terminal 3: node src/cli.js enqueue \'{"command":"sleep 3"}\'');
}

runTests().catch(console.error);
