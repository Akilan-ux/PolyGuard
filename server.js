// const express = require('express');
// const { spawn } = require('child_process');
// const QRCode = require('qrcode');
// const { Pool } = require('pg');
// const app = express();
// const port = process.env.PORT || 3000;
// const path = require('path');
// const crypto = require('crypto');

// const DATABASE_URL = "postgresql://neondb_owner:npg_FTYS4XhWbd5l@ep-shiny-sunset-ae0ezxj1-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// // Initialize Neon database pool
// const pool = new Pool({
//   connectionString: DATABASE_URL,
//   ssl: {
//     rejectUnauthorized: false
//   }
// });

// app.use(express.json());

// // Serve static files (frontend) from project root so Render/GitHub can host single service
// app.use(express.static(path.join(__dirname)));

// // Basic health endpoint
// app.get('/health', (req, res) => {
//   res.json({ status: 'ok' });
// });

// // Deploy endpoint: accepts { hash: '0x...' }
// app.post('/deploy', async (req, res) => {
//   const remoteAddr = req.ip || req.remoteAddress;
//   // Only allow localhost calls by default  
//   if (!(remoteAddr === '::1' || remoteAddr === '127.0.0.1' || remoteAddr === '::ffff:127.0.0.1')) {
//     return res.status(403).json({ error: 'Forbidden: only localhost may call this endpoint for security.' });
//   }

//   const { hash } = req.body || {};
//   if (!hash || typeof hash !== 'string') {
//     return res.status(400).json({ error: 'Missing or invalid `hash` in request body' });
//   }

//   // basic validation: make sure it's hex-like
//   const hex = hash.startsWith('0x') ? hash.slice(2) : hash;
//   if (!/^[0-9a-fA-F]{1,64}$/.test(hex)) {
//     return res.status(400).json({ error: 'Invalid hash format. Expected 0xhexstring' });
//   }

//   // run the register_call.js helper
//   const child = spawn(process.platform === 'win32' ? 'node' : 'node', ['scripts/register_call.js', hash], {
//     env: process.env
//   });

//   let stdout = '';
//   let stderr = '';

//   child.stdout.on('data', (data) => {
//     stdout += data.toString();
//   });

//   child.stderr.on('data', (data) => {
//     stderr += data.toString();
//   });

//   child.on('error', (err) => {
//     return res.status(500).json({ error: 'Failed to start deployment process', details: err.message });
//   });

//   child.on('close', (code) => {
//     res.json({ exitCode: code, stdout, stderr });
//   });

//   // set a safety timeout (2 minutes)
//   setTimeout(() => {
//     if (!child.killed) {
//       child.kill('SIGTERM');
//     }
//   }, 120000);
// });

// // Hash endpoint (replaces python hash.py for easier deploy)
// app.post('/hash', (req, res) => {
//   const product_id = (req.body && req.body.product_id) ? String(req.body.product_id) : '';
//   if (!product_id) return res.status(400).json({ error: 'Missing product_id' });
//   const sha = crypto.createHash('sha256').update(product_id, 'utf8').digest('hex');
//   // echo to console for audit
//   console.log(`SHA-256 Hash for product_id '${product_id}': ${sha}`);
//   res.json({ product_id, sha256: sha });
// });

// // Generate QR code and store hash + company to Neon database
// app.post('/qr-store', async (req, res) => {
//   try {
//     const { hash, company, email, fullName } = req.body;
//     if (!hash) {
//       return res.status(400).json({ error: 'Missing hash' });
//     }

//     // Normalize hash (trim, lowercase, remove 0x)
//     const rawHash = String(hash || '').trim();
//     const normalized = rawHash.startsWith('0x') ? rawHash.slice(2) : rawHash;
//     const norm = normalized.toLowerCase();
//     console.log('Preparing QR endpoint for normalized hash:', norm);

//     // Store hash and company info in Neon database (do not store large image strings)
//     if (company) {
//       try {
//         // Generate short ID
//         const shortId = generateShortId();

//         const query = `
//           INSERT INTO qr_registrations (hash, short_id, company, email, full_name, created_at)
//           VALUES ($1, $2, $3, $4, $5, NOW())
//           ON CONFLICT (hash) DO UPDATE SET company = EXCLUDED.company, email = EXCLUDED.email, full_name = EXCLUDED.full_name, short_id = EXCLUDED.short_id
//           RETURNING id, hash, company, short_id;
//         `;
//         console.log('Storing hash, short_id and company to database...');
//         const result = await pool.query(query, [norm, shortId, company, email, fullName]);
//         console.log('Database insert successful, id:', result.rows[0].id, 'short_id:', result.rows[0].short_id);
//         // Return both full and short endpoints for the QR image
//         res.json({ 
//           success: true, 
//           qrEndpoint: `/qr/${norm}`, 
//           shortLink: `/q/${result.rows[0].short_id}`,
//           dbId: result.rows[0].id, 
//           company: result.rows[0].company 
//         });
//       } catch (dbErr) {
//         console.warn('Database storage failed, returning QR endpoint only:', dbErr.message);
//         res.json({ success: true, qrEndpoint: `/qr/${norm}`, warning: 'QR endpoint provided but database save failed' });
//       }
//     } else {
//       // No company provided — still return endpoint for QR image
//       res.json({ success: true, qrEndpoint: `/qr/${norm}` });
//     }
//   } catch (err) {
//     console.error('QR generation error:', err.message);
//     res.status(500).json({ error: 'Failed to generate QR code', details: err.message });
//   }
// });

// // Retrieve and verify QR from database
// app.post('/qr-verify', async (req, res) => {
//   try {
//     const { hash } = req.body;
//     if (!hash) return res.status(400).json({ error: 'Missing hash' });

//     // Normalize incoming hash same as storage: trim, remove 0x, lowercase
//     const rawHash = String(hash || '').trim();
//     const normalized = rawHash.startsWith('0x') ? rawHash.slice(2) : rawHash;
//     const norm = normalized.toLowerCase();

//     console.log('QR verify request. raw:', rawHash, 'normalized:', norm);

//     // Basic pattern check: must be hex characters (allow short test values too)
//     if (!/^[0-9a-f]+$/.test(norm)) {
//       console.warn('QR verify failed: normalized value not hex:', norm);
//       return res.status(400).json({ error: 'Invalid hash format after normalization', received: rawHash, normalized: norm });
//     }

//     const query = `SELECT * FROM qr_registrations WHERE hash = $1 LIMIT 1;`;
//     const result = await pool.query(query, [norm]);

//     if (result.rows.length === 0) {
//       return res.status(404).json({ verified: false, error: 'QR not found' });
//     }

//     const row = result.rows[0];
//     res.json({
//       verified: true,
//       hash: row.hash,
//       company: row.company,
//       email: row.email,
//       full_name: row.full_name,
//       created_at: row.created_at,
//       qrEndpoint: `/qr/${row.hash}`
//     });
//   } catch (err) {
//     console.error('QR verify error:', err.message);
//     res.status(500).json({ error: 'Failed to verify QR code' });
//   }
// });

// // Initialize database on startup
// async function initDatabase() {
//   try {
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS qr_registrations (
//         id SERIAL PRIMARY KEY,
//         hash VARCHAR(64) UNIQUE NOT NULL,
//         qr_code TEXT,
//         company VARCHAR(255),
//         email VARCHAR(255),
//         full_name VARCHAR(255),
//         created_at TIMESTAMP DEFAULT NOW()
//       );
//     `);
//     console.log('Database table initialized');
//   } catch (err) {
//     console.error('Database init error:', err.message);
//   }
// }

// initDatabase();

// // Helper: generate a short random ID (e.g. "abc123def456")
// function generateShortId() {
//   return Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 8);
// }

// app.listen(port, () => console.log(`API server listening on http://0.0.0.0:${port}`));

// // Serve QR as compact SVG at /qr/:hash (generates on-demand, no large DB blobs)
// app.get('/qr/:hash', async (req, res) => {
//   try {
//     const raw = String(req.params.hash || '').trim();
//     const normalized = raw.startsWith('0x') ? raw.slice(2) : raw;
//     const norm = normalized.toLowerCase();

//     if (!/^[0-9a-f]+$/.test(norm)) {
//       return res.status(400).send('Invalid hash format');
//     }

//     // Generate SVG string for the QR code
//     const svg = await QRCode.toString(norm, { type: 'svg', errorCorrectionLevel: 'H', width: 256 });
//     res.setHeader('Content-Type', 'image/svg+xml');
//     res.send(svg);
//   } catch (err) {
//     console.error('QR SVG generation error:', err.message);
//     res.status(500).send('Failed to generate QR');
//   }
// });

// // Resolve short link /q/<short_id> to QR SVG
// app.get('/q/:id', async (req, res) => {
//   try {
//     const shortId = String(req.params.id || '').trim().toLowerCase();
    
//     if (!/^[a-z0-9]{10,12}$/.test(shortId)) {
//       return res.status(400).send('Invalid short link format');
//     }

//     const query = `SELECT hash FROM qr_registrations WHERE short_id = $1 LIMIT 1;`;
//     const result = await pool.query(query, [shortId]);

//     if (result.rows.length === 0) {
//       return res.status(404).send('Short link not found');
//     }

//     const hash = result.rows[0].hash;
//     // Generate and return SVG for this hash
//     const svg = await QRCode.toString(hash, { type: 'svg', errorCorrectionLevel: 'H', width: 256 });
//     res.setHeader('Content-Type', 'image/svg+xml');
//     res.send(svg);
//   } catch (err) {
//     console.error('Short link resolution error:', err.message);
//     res.status(500).send('Failed to resolve short link');
//   }
// });





// full-qr-server.js


// CHAT GPT GENERATED CODE BELOW://


// const express = require('express');
// const { Pool } = require('pg');
// const QRCode = require('qrcode');
// const path = require('path');
// const crypto = require('crypto');

// const app = express();
// const port = process.env.PORT || 3000;

// // --- DATABASE CONFIG ---
// const DATABASE_URL = "postgresql://neondb_owner:npg_FTYS4XhWbd5l@ep-shiny-sunset-ae0ezxj1-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// const pool = new Pool({
//   connectionString: DATABASE_URL,
//   ssl: {
//     rejectUnauthorized: false
//   }
// });

// // --- MIDDLEWARE ---
// app.use(express.json());
// app.use(express.static(path.join(__dirname)));

// // --- HELPER FUNCTIONS ---
// function generateShortId() {
//   return Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 8);
// }

// // --- DATABASE INIT ---
// async function initDatabase() {
//   try {
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS qr_registrations (
//         id SERIAL PRIMARY KEY,
//         hash VARCHAR(64) UNIQUE NOT NULL,
//         short_id VARCHAR(12) UNIQUE,
//         company VARCHAR(255),
//         email VARCHAR(255),
//         full_name VARCHAR(255),
//         created_at TIMESTAMP DEFAULT NOW()
//       );
//     `);
//     console.log('Database table initialized');
//   } catch (err) {
//     console.error('Database init error:', err.message);
//   }
// }
// initDatabase();

// // --- HEALTH CHECK ---
// app.get('/health', (req, res) => res.json({ status: 'ok' }));

// // --- HASH GENERATION (SHA-256) ---
// app.post('/hash', (req, res) => {
//   const product_id = String(req.body?.product_id || '');
//   if (!product_id) return res.status(400).json({ error: 'Missing product_id' });

//   const sha = crypto.createHash('sha256').update(product_id, 'utf8').digest('hex');
//   console.log(`SHA-256 Hash for product_id '${product_id}': ${sha}`);
//   res.json({ product_id, sha256: sha });
// });

// // --- STORE QR INFO ---
// app.post('/qr-store', async (req, res) => {
//   try {
//     const { hash, company, email, fullName } = req.body;
//     if (!hash) return res.status(400).json({ error: 'Missing hash' });

//     const rawHash = String(hash).trim();
//     const normalized = rawHash.startsWith('0x') ? rawHash.slice(2) : rawHash;
//     const norm = normalized.toLowerCase();

//     const shortId = generateShortId();

//     const query = `
//       INSERT INTO qr_registrations (hash, short_id, company, email, full_name, created_at)
//       VALUES ($1, $2, $3, $4, $5, NOW())
//       ON CONFLICT (hash) DO UPDATE
//       SET company = EXCLUDED.company, email = EXCLUDED.email, full_name = EXCLUDED.full_name, short_id = EXCLUDED.short_id
//       RETURNING id, hash, company, short_id;
//     `;
//     const result = await pool.query(query, [norm, shortId, company, email, fullName]);
//     const row = result.rows[0];

//     res.json({
//       success: true,
//       qrEndpoint: `/qr/${norm}`,
//       shortLink: `/q/${row.short_id}`,
//       dbId: row.id,
//       company: row.company
//     });
//   } catch (err) {
//     console.error('QR store error:', err.message);
//     res.status(500).json({ error: 'Failed to store QR info', details: err.message });
//   }
// });

// // --- VERIFY QR ---
// app.get('/qr-verify/:hash', async (req, res) => {
//   try {
//     const rawHash = String(req.params.hash || '').trim();
//     const normalized = rawHash.startsWith('0x') ? rawHash.slice(2) : rawHash;
//     const norm = normalized.toLowerCase();

//     if (!/^[0-9a-f]+$/.test(norm)) return res.status(400).send('Invalid hash format');

//     const query = `SELECT * FROM qr_registrations WHERE hash = $1 LIMIT 1;`;
//     const result = await pool.query(query, [norm]);

//     if (result.rows.length === 0) return res.status(404).send('<h1>QR Not Found</h1>');

//     const row = result.rows[0];

//     res.send(`
//       <html>
//         <head>
//           <title>QR Verification</title>
//           <style>
//             body { font-family: Arial, sans-serif; padding: 20px; }
//             .card { border: 1px solid #ccc; padding: 20px; border-radius: 8px; max-width: 400px; }
//             h1 { color: #333; }
//             p { margin: 5px 0; }
//           </style>
//         </head>
//         <body>
//           <div class="card">
//             <h1>QR Verified ✅</h1>
//             <p><strong>Company:</strong> ${row.company || 'N/A'}</p>
//             <p><strong>Full Name:</strong> ${row.full_name || 'N/A'}</p>
//             <p><strong>Email:</strong> ${row.email || 'N/A'}</p>
//             <p><strong>Hash:</strong> ${row.hash}</p>
//             <p><strong>Created At:</strong> ${new Date(row.created_at).toLocaleString()}</p>
//           </div>
//         </body>
//       </html>
//     `);
//   } catch (err) {
//     console.error('QR verification error:', err.message);
//     res.status(500).send('Failed to verify QR code');
//   }
// });

// // --- GENERATE QR CODE AS SVG ---
// app.get('/qr/:hash', async (req, res) => {
//   try {
//     const raw = String(req.params.hash || '').trim();
//     const normalized = raw.startsWith('0x') ? raw.slice(2) : raw;
//     const norm = normalized.toLowerCase();

//     if (!/^[0-9a-f]+$/.test(norm)) return res.status(400).send('Invalid hash format');

//     // Encode full verification URL in QR code
//     const qrContent = `https://polyguard.netlify.app/qr-verify/${norm}`;
//     const svg = await QRCode.toString(qrContent, { type: 'svg', errorCorrectionLevel: 'H', width: 256 });

//     res.setHeader('Content-Type', 'image/svg+xml');
//     res.send(svg);
//   } catch (err) {
//     console.error('QR SVG generation error:', err.message);
//     res.status(500).send('Failed to generate QR');
//   }
// });

// // --- SHORT LINK REDIRECT ---
// app.get('/q/:id', async (req, res) => {
//   try {
//     const shortId = String(req.params.id || '').trim().toLowerCase();
//     if (!/^[a-z0-9]{10,12}$/.test(shortId)) return res.status(400).send('Invalid short link format');

//     const query = `SELECT hash FROM qr_registrations WHERE short_id = $1 LIMIT 1;`;
//     const result = await pool.query(query, [shortId]);

//     if (result.rows.length === 0) return res.status(404).send('Short link not found');

//     const hash = result.rows[0].hash;
//     res.redirect(`/qr-verify/${hash}`);
//   } catch (err) {
//     console.error('Short link resolution error:', err.message);
//     res.status(500).send('Failed to resolve short link');
//   }
// });



// app.listen(port, () => console.log(`QR API server listening at http://0.0.0.0:${port}`));



// chat gpttttttttttttttttttttttttttttt


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
    console.log('Database table initialized');
  } catch (err) {
    console.error('Database init error:', err.message);
  }
}

initDatabase();

// Helper: generate a short random ID (e.g. "abc123def456")
function generateShortId() {
  return Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 8);
}

app.listen(port, () => console.log(`API server listening on http://0.0.0.0:${port}`));

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



