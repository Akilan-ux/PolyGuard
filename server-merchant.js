// PolyGuard Merchant Dashboard API Server
// Complete backend with JWT authentication, merchant endpoints, and admin endpoints

const express = require('express');
const { Pool } = require('pg');
const QRCode = require('qrcode');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// JWT Secret (In production, use environment variable!)
const JWT_SECRET = process.env.JWT_SECRET || 'polyguard-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

// Database configuration
const DATABASE_URL = "postgresql://neondb_owner:npg_FTYS4XhWbd5l@ep-shiny-sunset-ae0ezxj1-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(express.json());
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
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

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

// ============= HEALTH CHECK =============

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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

    // Validate required fields
    if (!user_name || !password || !company_uen || !company_name || !business_type || !job_position || !phone_number) {
      return res.status(400).json({ error: 'All required fields must be filled' });
    }

    // Check if username already exists
    const existingUser = await pool.query(
      'SELECT id FROM merchants WHERE user_name = $1',
      [user_name]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password with PBKDF2
    const salt = generateSalt();
    const password_hash = hashPassword(password, salt);

    // Insert new merchant
    const result = await pool.query(`
      INSERT INTO merchants (
        user_name, password_hash, password_salt, company_uen, company_name,
        business_type, company_website, job_position, phone_number, email, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
      RETURNING id, user_name, company_name, status, created_at
    `, [
      user_name,
      password_hash,
      salt,
      company_uen,
      company_name,
      business_type,
      company_website || null,
      job_position,
      phone_number,
      email || null
    ]);

    const merchant = result.rows[0];

    console.log('New merchant registered:', merchant.user_name);

    res.json({
      success: true,
      message: 'Registration successful! Your account is pending approval.',
      merchant: {
        id: merchant.id,
        user_name: merchant.user_name,
        company_name: merchant.company_name,
        status: merchant.status,
        created_at: merchant.created_at
      }
    });

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed', details: err.message });
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  try {
    const { user_name, password } = req.body;

    if (!user_name || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Get merchant from database
    const result = await pool.query(
      'SELECT id, user_name, password_hash, password_salt, company_name, status, is_admin FROM merchants WHERE user_name = $1',
      [user_name]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const merchant = result.rows[0];

    // Verify password
    const inputHash = hashPassword(password, merchant.password_salt);
    if (inputHash !== merchant.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await pool.query(
      'UPDATE merchants SET last_login = NOW() WHERE id = $1',
      [merchant.id]
    );

    // Generate JWT token
    const token = generateToken(merchant.id, merchant.user_name, merchant.is_admin);

    console.log('Merchant logged in:', merchant.user_name);

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
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ============= MERCHANT ENDPOINTS =============

// Create QR code
app.post('/merchants/create-qr', authenticateToken, requireApprovedMerchant, async (req, res) => {
  try {
    const { label, description } = req.body;
    const merchantId = req.user.merchantId;

    // Get merchant company name
    const merchantResult = await pool.query(
      'SELECT company_name FROM merchants WHERE id = $1',
      [merchantId]
    );

    if (merchantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const companyName = merchantResult.rows[0].company_name;
    const companySlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Generate QR URL - links to company-name.html
    const qrUrl = `https://polyguard.netlify.app/${companySlug}.html`;

    // Generate QR code SVG
    const qrSvg = await QRCode.toString(qrUrl, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      width: 300
    });

    // Store in database
    const result = await pool.query(`
      INSERT INTO merchant_qr_codes (merchant_id, qr_code_svg, qr_url, label, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, qr_url, label, created_at
    `, [merchantId, qrSvg, qrUrl, label || 'Untitled QR', description || null]);

    const qrCode = result.rows[0];

    // Log transaction
    await logTransaction(merchantId, 'qr_creation', {
      qr_code_id: qrCode.id,
      result_message: 'QR code created successfully'
    });

    console.log(`QR code created for merchant ${merchantId}:`, qrCode.id);

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
    res.status(500).json({ error: 'Failed to create QR code', details: err.message });
  }
});

// List all QR codes for merchant
app.get('/merchants/list-qr', authenticateToken, async (req, res) => {
  try {
    const merchantId = req.user.merchantId;

    const result = await pool.query(`
      SELECT id, qr_url, label, description, is_active, scan_count, last_scanned, created_at, regenerated_at
      FROM merchant_qr_codes
      WHERE merchant_id = $1
      ORDER BY created_at DESC
    `, [merchantId]);

    res.json({
      success: true,
      qr_codes: result.rows
    });

  } catch (err) {
    console.error('List QR error:', err);
    res.status(500).json({ error: 'Failed to fetch QR codes' });
  }
});

// Get QR code SVG by ID
app.get('/merchants/qr/:id', authenticateToken, async (req, res) => {
  try {
    const qrId = req.params.id;
    const merchantId = req.user.merchantId;

    const result = await pool.query(
      'SELECT qr_code_svg FROM merchant_qr_codes WHERE id = $1 AND merchant_id = $2',
      [qrId, merchantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('QR code not found');
    }

    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(result.rows[0].qr_code_svg);

  } catch (err) {
    console.error('Get QR SVG error:', err);
    res.status(500).send('Failed to retrieve QR code');
  }
});

// Regenerate QR code
app.post('/merchants/regenerate-qr/:id', authenticateToken, requireApprovedMerchant, async (req, res) => {
  try {
    const qrId = req.params.id;
    const merchantId = req.user.merchantId;

    // Check if QR belongs to merchant
    const existing = await pool.query(
      'SELECT qr_url FROM merchant_qr_codes WHERE id = $1 AND merchant_id = $2',
      [qrId, merchantId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    const qrUrl = existing.rows[0].qr_url;

    // Generate new QR code SVG
    const qrSvg = await QRCode.toString(qrUrl, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      width: 300
    });

    // Update in database
    await pool.query(`
      UPDATE merchant_qr_codes 
      SET qr_code_svg = $1, regenerated_at = NOW()
      WHERE id = $2
    `, [qrSvg, qrId]);

    console.log(`QR code regenerated: ${qrId}`);

    res.json({
      success: true,
      message: 'QR code regenerated successfully',
      svg: qrSvg
    });

  } catch (err) {
    console.error('Regenerate QR error:', err);
    res.status(500).json({ error: 'Failed to regenerate QR code' });
  }
});

// Create hash for SMS authenticity
app.post('/merchants/create-hash', authenticateToken, requireApprovedMerchant, async (req, res) => {
  try {
    const { message, purpose } = req.body;
    const merchantId = req.user.merchantId;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Generate SHA-256 hash
    const messageHash = sha256Hash(message);

    // Store in database
    const result = await pool.query(`
      INSERT INTO merchant_hashes (merchant_id, original_message, message_hash, purpose)
      VALUES ($1, $2, $3, $4)
      RETURNING id, message_hash, purpose, created_at
    `, [merchantId, message, messageHash, purpose || null]);

    const hash = result.rows[0];

    // Log transaction
    await logTransaction(merchantId, 'hash_creation', {
      hash_id: hash.id,
      result_message: 'Hash created successfully'
    });

    console.log(`Hash created for merchant ${merchantId}:`, hash.id);

    res.json({
      success: true,
      hash: {
        id: hash.id,
        message_hash: hash.message_hash,
        original_message: message,
        purpose: hash.purpose,
        created_at: hash.created_at
      }
    });

  } catch (err) {
    console.error('Hash creation error:', err);
    res.status(500).json({ error: 'Failed to create hash' });
  }
});

// List all hashes for merchant
app.get('/merchants/list-hashes', authenticateToken, async (req, res) => {
  try {
    const merchantId = req.user.merchantId;

    const result = await pool.query(`
      SELECT id, original_message, message_hash, purpose, is_verified, verification_count, created_at, expires_at
      FROM merchant_hashes
      WHERE merchant_id = $1
      ORDER BY created_at DESC
    `, [merchantId]);

    res.json({
      success: true,
      hashes: result.rows
    });

  } catch (err) {
    console.error('List hashes error:', err);
    res.status(500).json({ error: 'Failed to fetch hashes' });
  }
});

// Get recent transactions for merchant
app.get('/merchants/recent-transactions', authenticateToken, async (req, res) => {
  try {
    const merchantId = req.user.merchantId;
    const limit = parseInt(req.query.limit) || 50;

    const result = await pool.query(`
      SELECT 
        id, transaction_type, scanned_hash, user_info, ip_address, 
        verification_result, result_message, created_at
      FROM transaction_logs
      WHERE merchant_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [merchantId, limit]);

    res.json({
      success: true,
      transactions: result.rows
    });

  } catch (err) {
    console.error('Recent transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// ============= ADMIN ENDPOINTS =============

// Get all merchants
app.get('/admin/merchants', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM merchant_usage_stats
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      merchants: result.rows
    });

  } catch (err) {
    console.error('Admin merchants list error:', err);
    res.status(500).json({ error: 'Failed to fetch merchants' });
  }
});

// Approve merchant
app.post('/admin/approve/:merchantId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const merchantId = req.params.merchantId;
    const adminId = req.user.merchantId;

    const result = await pool.query(`
      UPDATE merchants 
      SET status = 'approved', approved_by = $1, approved_at = NOW()
      WHERE id = $2 AND status = 'pending'
      RETURNING id, user_name, company_name, status
    `, [adminId, merchantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Merchant not found or already processed' });
    }

    const merchant = result.rows[0];

    console.log(`Merchant ${merchant.user_name} approved by admin ${adminId}`);

    res.json({
      success: true,
      message: 'Merchant approved successfully',
      merchant
    });

  } catch (err) {
    console.error('Approve merchant error:', err);
    res.status(500).json({ error: 'Failed to approve merchant' });
  }
});

// Reject merchant
app.post('/admin/reject/:merchantId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const merchantId = req.params.merchantId;
    const { reason } = req.body;

    const result = await pool.query(`
      UPDATE merchants 
      SET status = 'rejected', rejection_reason = $1
      WHERE id = $2 AND status = 'pending'
      RETURNING id, user_name, company_name, status
    `, [reason || 'No reason provided', merchantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Merchant not found or already processed' });
    }

    const merchant = result.rows[0];

    console.log(`Merchant ${merchant.user_name} rejected`);

    res.json({
      success: true,
      message: 'Merchant rejected',
      merchant
    });

  } catch (err) {
    console.error('Reject merchant error:', err);
    res.status(500).json({ error: 'Failed to reject merchant' });
  }
});

// ============= PUBLIC VERIFICATION ENDPOINTS =============

// Verify hash (public endpoint for customers)
app.post('/public/verify-hash', async (req, res) => {
  try {
    const { hash } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (!hash) {
      return res.status(400).json({ error: 'Hash is required' });
    }

    // Lookup hash in database
    const result = await pool.query(`
      SELECT 
        h.id, h.merchant_id, h.original_message, h.purpose, h.created_at,
        m.company_name, m.company_uen
      FROM merchant_hashes h
      JOIN merchants m ON h.merchant_id = m.id
      WHERE h.message_hash = $1 AND m.status = 'approved'
      ORDER BY h.created_at DESC
      LIMIT 1
    `, [hash]);

    if (result.rows.length === 0) {
      // Log failed verification
      await pool.query(`
        INSERT INTO transaction_logs (merchant_id, transaction_type, scanned_hash, ip_address, user_agent, verification_result, result_message)
        VALUES (NULL, 'hash_verification', $1, $2, $3, 'failed', 'Hash not found')
      `, [hash, ip, userAgent]);

      return res.status(404).json({
        verified: false,
        error: 'Hash not found or merchant not approved'
      });
    }

    const hashData = result.rows[0];

    // Update verification count
    await pool.query(
      'UPDATE merchant_hashes SET is_verified = TRUE, verification_count = verification_count + 1 WHERE id = $1',
      [hashData.id]
    );

    // Log successful verification
    await logTransaction(hashData.merchant_id, 'hash_verification', {
      hash_id: hashData.id,
      scanned_hash: hash,
      ip_address: ip,
      user_agent: userAgent,
      verification_result: 'success',
      result_message: 'Hash verified successfully'
    });

    console.log(`Hash verified: ${hash} from merchant ${hashData.company_name}`);

    res.json({
      verified: true,
      merchant: {
        company_name: hashData.company_name,
        company_uen: hashData.company_uen
      },
      message: hashData.original_message,
      purpose: hashData.purpose,
      created_at: hashData.created_at
    });

  } catch (err) {
    console.error('Hash verification error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Log QR scan (public endpoint)
app.post('/public/log-qr-scan', async (req, res) => {
  try {
    const { qr_url } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (!qr_url) {
      return res.status(400).json({ error: 'QR URL is required' });
    }

    // Find QR code
    const result = await pool.query(
      'SELECT id, merchant_id FROM merchant_qr_codes WHERE qr_url = $1',
      [qr_url]
    );

    if (result.rows.length > 0) {
      const qrData = result.rows[0];

      // Update scan count
      await pool.query(
        'UPDATE merchant_qr_codes SET scan_count = scan_count + 1, last_scanned = NOW() WHERE id = $1',
        [qrData.id]
      );

      // Log transaction
      await logTransaction(qrData.merchant_id, 'qr_scan', {
        qr_code_id: qrData.id,
        ip_address: ip,
        user_agent: userAgent,
        verification_result: 'success',
        result_message: 'QR code scanned'
      });

      console.log(`QR scan logged: ${qrData.id}`);
    }

    res.json({ success: true });

  } catch (err) {
    console.error('QR scan log error:', err);
    res.status(500).json({ error: 'Failed to log scan' });
  }
});

// ============= START SERVER =============

app.listen(port, () => {
  console.log(`\n🚀 PolyGuard Merchant API Server running at http://0.0.0.0:${port}`);
  console.log(`📊 Database: Neon PostgreSQL`);
  console.log(`🔐 Authentication: JWT (${JWT_EXPIRES_IN} expiry)`);
  console.log(`\nEndpoints ready:`);
  console.log(`  - POST /auth/register`);
  console.log(`  - POST /auth/login`);
  console.log(`  - POST /merchants/create-qr`);
  console.log(`  - GET  /merchants/list-qr`);
  console.log(`  - POST /merchants/create-hash`);
  console.log(`  - GET  /merchants/list-hashes`);
  console.log(`  - GET  /merchants/recent-transactions`);
  console.log(`  - GET  /admin/merchants`);
  console.log(`  - POST /admin/approve/:merchantId`);
  console.log(`  - POST /admin/reject/:merchantId`);
  console.log(`  - POST /public/verify-hash`);
  console.log(`  - POST /public/log-qr-scan\n`);
});
