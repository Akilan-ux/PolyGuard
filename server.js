const express = require('express');
const { spawn } = require('child_process');
const app = express();
const port = process.env.PORT || 3000;
const path = require('path');
const crypto = require('crypto');

app.use(express.json());

// Serve static files (frontend) from project root so Render/GitHub can host single service
app.use(express.static(path.join(__dirname)));

// Basic health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Deploy endpoint: accepts { hash: '0x...' }
app.post('/deploy', async (req, res) => {
  const remoteAddr = req.ip || req.connection.remoteAddress;
  // Only allow localhost calls by default
  if (!(remoteAddr === '::1' || remoteAddr === '127.0.0.1' || remoteAddr === '::ffff:127.0.0.1')) {
    return res.status(403).json({ error: 'Forbidden: only localhost may call this endpoint for security.' });
  }

  const { hash } = req.body || {};
  if (!hash || typeof hash !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid `hash` in request body' });
  }

  // basic validation: make sure it's hex-like
  const hex = hash.startsWith('0x') ? hash.slice(2) : hash;
  if (!/^[0-9a-fA-F]{1,64}$/.test(hex)) {
    return res.status(400).json({ error: 'Invalid hash format. Expected 0xhexstring' });
  }

  // run the register_call.js helper
  const child = spawn(process.platform === 'win32' ? 'node' : 'node', ['scripts/register_call.js', hash], {
    env: process.env
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  child.on('error', (err) => {
    return res.status(500).json({ error: 'Failed to start deployment process', details: err.message });
  });

  child.on('close', (code) => {
    res.json({ exitCode: code, stdout, stderr });
  });

  // set a safety timeout (2 minutes)
  setTimeout(() => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }, 120000);
});

// Hash endpoint (replaces python hash.py for easier deploy)
app.post('/hash', (req, res) => {
  const product_id = (req.body && req.body.product_id) ? String(req.body.product_id) : '';
  if (!product_id) return res.status(400).json({ error: 'Missing product_id' });
  const sha = crypto.createHash('sha256').update(product_id, 'utf8').digest('hex');
  // echo to console for audit
  console.log(`SHA-256 Hash for product_id '${product_id}': ${sha}`);
  res.json({ product_id, sha256: sha });
});

app.listen(port, () => console.log(`API server listening on http://0.0.0.0:${port}`));
