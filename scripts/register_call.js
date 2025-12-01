#!/usr/bin/env node
// Helper to call the register script with a provided SHA value via environment variable
// Usage: node scripts/register_call.js <0xhexhash>

const { spawn } = require('child_process');
const hash = process.argv[2];
if (!hash) {
  console.error('Usage: node scripts/register_call.js <0xhexhash>');
  process.exit(1);
}

const child = spawn('npx', ['hardhat', 'run', '--network', 'localhost', 'scripts/register.js'], {
  stdio: 'inherit',
  env: { ...process.env, HASH: hash }
});

child.on('exit', code => process.exit(code));
