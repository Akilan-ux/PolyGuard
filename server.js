const express = require('express');
const { spawn } = require('child_process');
const QRCode = require('qrcode');
const { Pool } = require('pg');
const app = express();
const port = process.env.PORT || 3000;
const path = require('path');
const crypto = require('crypto');

const DATABASE_URL = "postgresql://neondb_owner:npg_FTYS4XhWbd5l@ep-shiny-sunset-ae0ezxj1-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// Initialize Neon database pool
// Initialize Neon database pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

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

// Generate QR code and store in Neon database
app.post('/qr-store', async (req, res) => {
  try {
    const { hash, company, email, fullName } = req.body;
    if (!hash || !company) {
      return res.status(400).json({ error: 'Missing hash or company' });
    }

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(hash, { width: 300, errorCorrectionLevel: 'H' });

    // Store in Neon database
    const query = `
      INSERT INTO qr_registrations (hash, qr_code, company, email, full_name, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, hash, company, created_at;
    `;
    const result = await pool.query(query, [hash, qrDataUrl, company, email, fullName]);

    res.json({ success: true, qrCode: qrDataUrl, dbId: result.rows[0].id });
  } catch (err) {
    console.error('QR store error:', err.message);
    res.status(500).json({ error: 'Failed to store QR code', details: err.message });
  }
});

// Retrieve and verify QR from database
app.post('/qr-verify', async (req, res) => {
  try {
    const { hash } = req.body;
    if (!hash) return res.status(400).json({ error: 'Missing hash' });

    const query = `SELECT * FROM qr_registrations WHERE hash = $1 LIMIT 1;`;
    const result = await pool.query(query, [hash]);

    if (result.rows.length === 0) {
      return res.status(404).json({ verified: false, error: 'QR not found' });
    }

    const row = result.rows[0];
    res.json({
      verified: true,
      hash: row.hash,
      company: row.company,
      email: row.email,
      full_name: row.full_name,
      created_at: row.created_at,
      qrCode: row.qr_code
    });
  } catch (err) {
    console.error('QR verify error:', err.message);
    res.status(500).json({ error: 'Failed to verify QR code' });
  }
});

// Initialize database on startup
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS qr_registrations (
        id SERIAL PRIMARY KEY,
        hash VARCHAR(64) UNIQUE NOT NULL,
        qr_code TEXT NOT NULL,
        company VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        full_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Database table initialized');
  } catch (err) {
    console.error('Database init error:', err.message);
  }
}

initDatabase();

app.listen(port, () => console.log(`API server listening on http://0.0.0.0:${port}`));
