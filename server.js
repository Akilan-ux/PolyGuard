const express = require('express');
const { spawn } = require('child_process');
const QRCode = require('qrcode');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 3000;
const path = require('path');
const crypto = require('crypto');

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_FTYS4XhWbd5l@ep-shiny-sunset-ae0ezxj1-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'polyguard-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

// Initialize Neon database pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// CORS middleware - allow requests from Netlify and localhost
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://polyguard.netlify.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Serve static files (frontend) from project root so Render/GitHub can host single service
app.use(express.static(path.join(__dirname)));

// ============= UTILITY FUNCTIONS =============

// PBKDF2 password hashing
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
}

// Generate salt
function generateSalt() {
  return crypto.randomBytes(32).toString('hex');
}

// SHA-256 hash for messages
function sha256Hash(message) {
  return crypto.createHash('sha256').update(message, 'utf8').digest('hex');
}

// Generate JWT token
function generateToken(merchantId, userName, isAdmin) {
  return jwt.sign(
    { merchantId, userName, isAdmin },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// ============= MIDDLEWARE =============

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Admin-only middleware
function requireAdmin(req, res, next) {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Approved merchant middleware
async function requireApprovedMerchant(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT status FROM merchants WHERE id = $1',
      [req.user.merchantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Merchant not found' });
    }
    
    if (result.rows[0].status !== 'approved' && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Merchant account not approved yet' });
    }
    
    next();
  } catch (err) {
    console.error('Error checking merchant status:', err);
    res.status(500).json({ error: 'Failed to verify merchant status' });
  }
}

// Log transaction helper
async function logTransaction(merchantId, type, data = {}) {
  try {
    await pool.query(`
      INSERT INTO transaction_logs 
      (merchant_id, transaction_type, qr_code_id, hash_id, scanned_hash, user_info, ip_address, user_agent, verification_result, result_message)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      merchantId,
      type,
      data.qr_code_id || null,
      data.hash_id || null,
      data.scanned_hash || null,
      JSON.stringify(data.user_info || {}),
      data.ip_address || null,
      data.user_agent || null,
      data.verification_result || null,
      data.result_message || null
    ]);
  } catch (err) {
    console.error('Error logging transaction:', err);
  }
}

// ============= AUTHENTICATION ENDPOINTS =============

// Register new merchant
app.post('/auth/register', async (req, res) => {
  try {
    const {
      user_name,
      password,
      company_uen,
      company_name,
      business_type,
      company_website,
      job_position,
      phone_number,
      email
    } = req.body;

    if (!user_name || !password || !company_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(`
      INSERT INTO merchants (
        user_name, password_hash, password_salt, company_uen, company_name,
        business_type, company_website, job_position, phone_number, email,
        status, is_admin
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', false)
      RETURNING id, user_name, company_name, status, is_admin
    `, [
      user_name, password, '', company_uen, company_name,
      business_type, company_website, job_position, phone_number, email
    ]);

    const merchant = result.rows[0];
    const token = generateToken(merchant.id, merchant.user_name, merchant.is_admin);

    res.json({
      success: true,
      token,
      merchant: {
        id: merchant.id,
        user_name: merchant.user_name,
        company_name: merchant.company_name,
        status: merchant.status,
        is_admin: merchant.is_admin
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  try {
    const { userName, password } = req.body;

    if (!userName || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }

    const result = await pool.query(
      'SELECT * FROM merchants WHERE user_name = $1',
      [userName]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const merchant = result.rows[0];

    if (password !== merchant.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(merchant.id, merchant.user_name, merchant.is_admin);

    res.json({
      success: true,
      token,
      merchant: {
        id: merchant.id,
        user_name: merchant.user_name,
        company_name: merchant.company_name,
        company_uen: merchant.company_uen,
        status: merchant.status,
        is_admin: merchant.is_admin
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ============= MERCHANT ENDPOINTS =============

// Create QR code
app.post('/merchants/create-qr', authenticateToken, requireApprovedMerchant, async (req, res) => {
  try {
    const { label, description, payment_method, payment_details } = req.body;
    const merchantId = req.user.merchantId;

    const merchantResult = await pool.query(
      'SELECT company_name FROM merchants WHERE id = $1',
      [merchantId]
    );

    if (merchantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const companyName = merchantResult.rows[0].company_name;
    const companySlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const qrUrl = `https://polyguard.netlify.app/${companySlug}.html`;

    const qrSvg = await QRCode.toString(qrUrl, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      width: 300
    });

    const result = await pool.query(`
      INSERT INTO merchant_qr_codes (merchant_id, qr_code_svg, qr_url, label, description, payment_method, payment_details)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, qr_url, label, created_at
    `, [merchantId, qrSvg, qrUrl, label || 'Untitled QR', description || null, payment_method, payment_details]);

    const qrCode = result.rows[0];

    await logTransaction(merchantId, 'qr_creation', {
      qr_code_id: qrCode.id,
      result_message: 'QR code created successfully'
    });

    res.json({
      success: true,
      qr_code: {
        id: qrCode.id,
        svg: qrSvg,
        url: qrCode.qr_url,
        label: qrCode.label,
        created_at: qrCode.created_at
      }
    });
  } catch (err) {
    console.error('QR creation error:', err);
    res.status(500).json({ error: 'Failed to create QR code' });
  }
});

// List QR codes
app.get('/merchants/list-qr', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, qr_url, label, description, is_active, scan_count, last_scanned, created_at
      FROM merchant_qr_codes
      WHERE merchant_id = $1
      ORDER BY created_at DESC
    `, [req.user.merchantId]);

    res.json({ success: true, qr_codes: result.rows });
  } catch (err) {
    console.error('List QR error:', err);
    res.status(500).json({ error: 'Failed to list QR codes' });
  }
});

// Create hash
app.post('/merchants/create-hash', authenticateToken, requireApprovedMerchant, async (req, res) => {
  try {
    const { message, purpose } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const messageHash = sha256Hash(message);

    const result = await pool.query(`
      INSERT INTO merchant_hashes (merchant_id, original_message, message_hash, purpose)
      VALUES ($1, $2, $3, $4)
      RETURNING id, original_message, message_hash, purpose, created_at
    `, [req.user.merchantId, message, messageHash, purpose || null]);

    const hash = result.rows[0];

    await logTransaction(req.user.merchantId, 'hash_creation', {
      hash_id: hash.id,
      result_message: 'Hash created successfully'
    });

    res.json({ success: true, hash });
  } catch (err) {
    console.error('Hash creation error:', err);
    res.status(500).json({ error: 'Failed to create hash' });
  }
});

// List hashes
app.get('/merchants/list-hashes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, original_message, message_hash, purpose, verification_count, created_at
      FROM merchant_hashes
      WHERE merchant_id = $1
      ORDER BY created_at DESC
    `, [req.user.merchantId]);

    res.json({ success: true, hashes: result.rows });
  } catch (err) {
    console.error('List hashes error:', err);
    res.status(500).json({ error: 'Failed to list hashes' });
  }
});

// Recent transactions
app.get('/merchants/recent-transactions', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    const result = await pool.query(`
      SELECT *
      FROM transaction_logs
      WHERE merchant_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [req.user.merchantId, limit]);

    res.json({ success: true, transactions: result.rows });
  } catch (err) {
    console.error('Transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// ============= ADMIN ENDPOINTS =============

// List all merchants
app.get('/admin/merchants', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, user_name, company_name, company_uen, business_type, 
             email, phone_number, status, created_at
      FROM merchants
      WHERE is_admin = false
      ORDER BY created_at DESC
    `);

    res.json({ success: true, merchants: result.rows });
  } catch (err) {
    console.error('List merchants error:', err);
    res.status(500).json({ error: 'Failed to list merchants' });
  }
});

// Approve merchant
app.post('/admin/approve/:merchantId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const merchantId = parseInt(req.params.merchantId);

    await pool.query(
      'UPDATE merchants SET status = $1 WHERE id = $2',
      ['approved', merchantId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ error: 'Failed to approve merchant' });
  }
});

// Reject merchant
app.post('/admin/reject/:merchantId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const merchantId = parseInt(req.params.merchantId);

    await pool.query(
      'UPDATE merchants SET status = $1 WHERE id = $2',
      ['rejected', merchantId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Reject error:', err);
    res.status(500).json({ error: 'Failed to reject merchant' });
  }
});

// ============= PUBLIC ENDPOINTS =============

// Verify hash
app.post('/public/verify-hash', async (req, res) => {
  try {
    const { hash } = req.body;

    if (!hash) {
      return res.status(400).json({ error: 'Hash is required' });
    }

    // Normalize hash to lowercase for consistent comparison
    const normalizedHash = hash.toLowerCase().trim();

    const result = await pool.query(
      'SELECT * FROM merchant_hashes WHERE LOWER(message_hash) = $1',
      [normalizedHash]
    );

    if (result.rows.length === 0) {
      return res.json({ verified: false });
    }

    const hashData = result.rows[0];

    await pool.query(
      'UPDATE merchant_hashes SET verification_count = verification_count + 1 WHERE id = $1',
      [hashData.id]
    );

    await logTransaction(hashData.merchant_id, 'hash_verification', {
      hash_id: hashData.id,
      scanned_hash: normalizedHash,
      verification_result: 'success',
      result_message: 'Hash verified successfully',
      ip_address: req.ip
    });

    res.json({
      verified: true,
      message: hashData.original_message,
      merchant_id: hashData.merchant_id
    });
  } catch (err) {
    console.error('Verify hash error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Get merchant data by company slug (for payment page)
app.get('/public/merchant-data/:companySlug', async (req, res) => {
  try {
    const { companySlug } = req.params;

    const result = await pool.query(`
      SELECT m.id, m.company_name, m.email, 
             qr.payment_method, qr.payment_details
      FROM merchants m
      LEFT JOIN merchant_qr_codes qr ON qr.merchant_id = m.id
      WHERE LOWER(REPLACE(m.company_name, ' ', '-')) = $1 
        AND m.status = 'approved'
        AND qr.is_active = true
      ORDER BY qr.created_at DESC
      LIMIT 1
    `, [companySlug.toLowerCase()]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get merchant data error:', err);
    res.status(500).json({ error: 'Failed to fetch merchant data' });
  }
});

// Log QR scan
app.post('/public/log-qr-scan', async (req, res) => {
  try {
    const { qr_url } = req.body;

    if (qr_url) {
      const result = await pool.query(
        'SELECT * FROM merchant_qr_codes WHERE qr_url = $1',
        [qr_url]
      );

      if (result.rows.length > 0) {
        const qrData = result.rows[0];

        await pool.query(
          'UPDATE merchant_qr_codes SET scan_count = scan_count + 1, last_scanned = NOW() WHERE id = $1',
          [qrData.id]
        );

        await logTransaction(qrData.merchant_id, 'qr_scan', {
          qr_code_id: qrData.id,
          ip_address: req.ip,
          verification_result: 'success',
          result_message: 'QR code scanned'
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('QR scan log error:', err);
    res.status(500).json({ error: 'Failed to log scan' });
  }
});

// Basic health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Deploy endpoint: accepts { hash: '0x...' }
app.post('/deploy', async (req, res) => {
  const remoteAddr = req.ip || req.remoteAddress;
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

// Generate QR code and store hash + company + SVG to Neon database
app.post('/qr-store', async (req, res) => {
  try {
    const { hash, company, email, fullName } = req.body;
    if (!hash) return res.status(400).json({ error: 'Missing hash' });

    const rawHash = String(hash).trim();
    const normalized = rawHash.startsWith('0x') ? rawHash.slice(2) : rawHash;
    const norm = normalized.toLowerCase();

    if (!/^[0-9a-f]{1,64}$/.test(norm)) {
      return res.status(400).json({ error: 'Invalid hash format' });
    }

    // Generate QR code SVG text
    const qrSvg = await QRCode.toString(norm, { type: 'svg', errorCorrectionLevel: 'H', width: 256 });

    const query = `
      INSERT INTO qr_registrations (hash, qr_code, company, email, full_name, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (hash) DO UPDATE 
        SET qr_code = EXCLUDED.qr_code,
            company = EXCLUDED.company,
            email = EXCLUDED.email,
            full_name = EXCLUDED.full_name
      RETURNING id, hash, company;
    `;

    const result = await pool.query(query, [norm, qrSvg, company, email, fullName]);
    res.json({
      success: true,
      qrEndpoint: `/qr/${norm}`,
      dbId: result.rows[0].id,
      company: result.rows[0].company
    });
  } catch (err) {
    console.error('QR store error:', err.message);
    res.status(500).json({ error: 'Failed to store QR code', details: err.message });
  }
});

// Retrieve and verify QR from database
app.post('/qr-verify', async (req, res) => {
  const { hash } = req.body; // scanned hash from QR
  if (!hash) return res.status(400).json({ error: 'Missing hash' });

  // Normalize the hash same way as storage
  const norm = hash.startsWith('0x') ? hash.slice(2).toLowerCase() : hash.toLowerCase();

  const query = `SELECT * FROM qr_registrations WHERE hash = $1 LIMIT 1;`;
  const result = await pool.query(query, [norm]);

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
    qr_code: row.qr_code, // optional: return SVG for display
    created_at: row.created_at
  });
});


// Initialize database on startup
async function initDatabase() {
  try {
    // Original QR registrations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS qr_registrations (
        id SERIAL PRIMARY KEY,
        hash VARCHAR(64) UNIQUE NOT NULL,
        qr_code TEXT,
        company VARCHAR(255),
        email VARCHAR(255),
        full_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Merchants table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchants (
        id SERIAL PRIMARY KEY,
        user_name VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        company_uen VARCHAR(50),
        company_name VARCHAR(255) NOT NULL,
        business_type VARCHAR(100),
        company_website VARCHAR(255),
        job_position VARCHAR(100),
        phone_number VARCHAR(20),
        email VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending',
        is_admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Merchant QR codes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchant_qr_codes (
        id SERIAL PRIMARY KEY,
        merchant_id INTEGER REFERENCES merchants(id) ON DELETE CASCADE,
        qr_code_svg TEXT NOT NULL,
        qr_url TEXT NOT NULL,
        label VARCHAR(255),
        description TEXT,
        payment_method VARCHAR(20),
        payment_details VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        scan_count INTEGER DEFAULT 0,
        last_scanned TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        regenerated_at TIMESTAMP
      );
    `);

    // Add payment columns if they don't exist (for existing tables)
    try {
      await pool.query(`
        ALTER TABLE merchant_qr_codes 
        ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20);
      `);
      await pool.query(`
        ALTER TABLE merchant_qr_codes 
        ADD COLUMN IF NOT EXISTS payment_details VARCHAR(255);
      `);
    } catch (err) {
      // Columns might already exist, ignore error
    }

    // Merchant hashes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchant_hashes (
        id SERIAL PRIMARY KEY,
        merchant_id INTEGER REFERENCES merchants(id) ON DELETE CASCADE,
        original_message TEXT NOT NULL,
        message_hash TEXT NOT NULL,
        purpose VARCHAR(255),
        verification_count INTEGER DEFAULT 0,
        last_verified TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Transaction logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transaction_logs (
        id SERIAL PRIMARY KEY,
        merchant_id INTEGER REFERENCES merchants(id) ON DELETE CASCADE,
        transaction_type VARCHAR(50) NOT NULL,
        qr_code_id INTEGER REFERENCES merchant_qr_codes(id) ON DELETE SET NULL,
        hash_id INTEGER REFERENCES merchant_hashes(id) ON DELETE SET NULL,
        scanned_hash TEXT,
        user_info JSONB,
        ip_address VARCHAR(50),
        user_agent TEXT,
        verification_result VARCHAR(20),
        result_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_merchant_qr_merchant ON merchant_qr_codes(merchant_id);
      CREATE INDEX IF NOT EXISTS idx_merchant_hash_merchant ON merchant_hashes(merchant_id);
      CREATE INDEX IF NOT EXISTS idx_transaction_merchant ON transaction_logs(merchant_id);
      CREATE INDEX IF NOT EXISTS idx_transaction_type ON transaction_logs(transaction_type);
    `);

    console.log('✓ Database tables initialized successfully');

    // Create default admin if not exists
    const adminCheck = await pool.query(
      "SELECT * FROM merchants WHERE user_name = 'admin'"
    );

    if (adminCheck.rows.length === 0) {
      await pool.query(`
        INSERT INTO merchants (
          user_name, password_hash, password_salt, company_name,
          status, is_admin
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, ['admin', 'Admin123!', '', 'PolyGuard Admin', 'approved', true]);

      console.log('✓ Default admin account created (admin/Admin123!)');
    }
  } catch (err) {
    console.error('Database init error:', err.message);
  }
}

initDatabase();

// Root endpoint - API status
app.get('/', (req, res) => {
  res.json({
    name: 'PolyGuard Blockchain API',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      authentication: [
        'POST /auth/register',
        'POST /auth/login'
      ],
      blockchain: [
        'POST /merchants/create-qr',
        'GET /merchants/list-qr',
        'POST /merchants/create-hash',
        'GET /merchants/list-hashes',
        'GET /merchants/recent-transactions'
      ],
      admin: [
        'GET /admin/merchants',
        'POST /admin/approve/:merchantId',
        'POST /admin/reject/:merchantId'
      ],
      public: [
        'POST /public/verify-hash',
        'POST /public/log-qr-scan',
        'GET /public/merchant-data/:companySlug'
      ]
    },
    documentation: 'https://github.com/Akilan-ux/PolyGuard'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`\n🚀 PolyGuard Blockchain API Server running on port ${port}`);
  console.log(`📊 Database: ${DATABASE_URL ? 'Connected to Neon PostgreSQL' : 'No DATABASE_URL set'}`);
  console.log(`🔐 Authentication: JWT (${JWT_EXPIRES_IN} expiry)`);
  console.log(`\nEndpoints ready:`);
  console.log(`  Authentication:`);
  console.log(`    - POST /auth/register`);
  console.log(`    - POST /auth/login`);
  console.log(`  Blockchain Operations:`);
  console.log(`    - POST /merchants/create-qr`);
  console.log(`    - GET  /merchants/list-qr`);
  console.log(`    - POST /merchants/create-hash`);
  console.log(`    - GET  /merchants/list-hashes`);
  console.log(`    - GET  /merchants/recent-transactions`);
  console.log(`  Admin:`);
  console.log(`    - GET  /admin/merchants`);
  console.log(`    - POST /admin/approve/:merchantId`);
  console.log(`    - POST /admin/reject/:merchantId`);
  console.log(`  Public:`);
  console.log(`    - POST /public/verify-hash`);
  console.log(`    - POST /public/log-qr-scan`);
  console.log(`    - GET  /public/merchant-data/:companySlug`);
  console.log(`  Legacy:`);
  console.log(`    - POST /deploy`);
  console.log(`    - POST /hash`);
  console.log(`    - POST /qr-store`);
  console.log(`    - POST /qr-verify\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server gracefully...');
  server.close(() => {
    console.log('Server closed');
    pool.end();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, closing server gracefully...');
  server.close(() => {
    console.log('Server closed');
    pool.end();
    process.exit(0);
  });
});

// Serve QR code from database
app.get('/qr/:hash', async (req, res) => {
  try {
    const raw = String(req.params.hash || '').trim();
    const normalized = raw.startsWith('0x') ? raw.slice(2) : raw;
    const norm = normalized.toLowerCase();

    if (!/^[0-9a-f]{1,64}$/.test(norm)) {
      return res.status(400).send('Invalid hash format');
    }

    const query = `SELECT qr_code FROM qr_registrations WHERE hash = $1 LIMIT 1;`;
    const result = await pool.query(query, [norm]);

    if (result.rows.length === 0) {
      return res.status(404).send('QR not found');
    }

    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(result.rows[0].qr_code);
  } catch (err) {
    console.error('QR fetch error:', err.message);
    res.status(500).send('Failed to retrieve QR');
  }
});


// Resolve short link /q/<short_id> to QR SVG
app.get('/q/:id', async (req, res) => {
  try {
    const shortId = String(req.params.id || '').trim().toLowerCase();
    
    if (!/^[a-z0-9]{10,12}$/.test(shortId)) {
      return res.status(400).send('Invalid short link format');
    }

    const query = `SELECT hash FROM qr_registrations WHERE short_id = $1 LIMIT 1;`;
    const result = await pool.query(query, [shortId]);

    if (result.rows.length === 0) {
      return res.status(404).send('Short link not found');
    }

    const hash = result.rows[0].hash;
    // Generate and return SVG for this hash
    const svg = await QRCode.toString(hash, { type: 'svg', errorCorrectionLevel: 'H', width: 256 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err) {
    console.error('Short link resolution error:', err.message);
    res.status(500).send('Failed to resolve short link');
  }
});


