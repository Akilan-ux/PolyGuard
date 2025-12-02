// Migration script to set up PolyGuard merchant database schema
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');

const DATABASE_URL = "postgresql://neondb_owner:npg_FTYS4XhWbd5l@ep-shiny-sunset-ae0ezxj1-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// PBKDF2 password hashing function
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
}

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Starting database migration...\n');
    
    // Create merchants table
    console.log('Creating merchants table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS merchants (
        id SERIAL PRIMARY KEY,
        user_name VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        password_salt VARCHAR(64) NOT NULL,
        company_uen VARCHAR(50) NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        business_type VARCHAR(100) NOT NULL,
        company_website VARCHAR(255),
        job_position VARCHAR(100) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        email VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending',
        approved_by INTEGER,
        approved_at TIMESTAMP,
        rejection_reason TEXT,
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP
      );
    `);
    console.log('✓ Merchants table created');

    // Create indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_merchants_company_name ON merchants(company_name);');

    // Create QR codes table
    console.log('Creating merchant_qr_codes table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS merchant_qr_codes (
        id SERIAL PRIMARY KEY,
        merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        qr_code_svg TEXT NOT NULL,
        qr_url VARCHAR(500) NOT NULL,
        label VARCHAR(255),
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        scan_count INTEGER DEFAULT 0,
        last_scanned TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        regenerated_at TIMESTAMP
      );
    `);
    console.log('✓ QR codes table created');

    await client.query('CREATE INDEX IF NOT EXISTS idx_qr_merchant ON merchant_qr_codes(merchant_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_qr_active ON merchant_qr_codes(is_active);');

    // Create hashes table
    console.log('Creating merchant_hashes table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS merchant_hashes (
        id SERIAL PRIMARY KEY,
        merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        original_message TEXT NOT NULL,
        message_hash VARCHAR(64) NOT NULL,
        purpose VARCHAR(255),
        is_verified BOOLEAN DEFAULT FALSE,
        verification_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP
      );
    `);
    console.log('✓ Hashes table created');

    await client.query('CREATE INDEX IF NOT EXISTS idx_hash_merchant ON merchant_hashes(merchant_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_hash_value ON merchant_hashes(message_hash);');

    // Create transaction logs table
    console.log('Creating transaction_logs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS transaction_logs (
        id SERIAL PRIMARY KEY,
        merchant_id INTEGER REFERENCES merchants(id) ON DELETE CASCADE,
        transaction_type VARCHAR(20) NOT NULL,
        qr_code_id INTEGER REFERENCES merchant_qr_codes(id) ON DELETE SET NULL,
        hash_id INTEGER REFERENCES merchant_hashes(id) ON DELETE SET NULL,
        scanned_hash VARCHAR(64),
        user_info JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        verification_result VARCHAR(20),
        result_message TEXT,
        geo_location JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Transaction logs table created');

    await client.query('CREATE INDEX IF NOT EXISTS idx_logs_merchant ON transaction_logs(merchant_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_logs_type ON transaction_logs(transaction_type);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON transaction_logs(created_at DESC);');
    
    console.log('✓ All tables and indexes created successfully');
    
    // Create admin account with proper PBKDF2 hashing
    console.log('\nSetting up admin account...');
    const adminSalt = crypto.randomBytes(32).toString('hex');
    const adminPassword = 'Admin123!'; // Change this in production!
    const adminHash = hashPassword(adminPassword, adminSalt);
    
    await client.query(`
      INSERT INTO merchants (
        user_name, 
        password_hash, 
        password_salt,
        company_uen, 
        company_name, 
        business_type, 
        job_position, 
        phone_number,
        email,
        status,
        is_admin,
        approved_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (user_name) 
      DO UPDATE SET 
        password_hash = EXCLUDED.password_hash,
        password_salt = EXCLUDED.password_salt
    `, [
      'admin',
      adminHash,
      adminSalt,
      'ADMIN001',
      'PolyGuard Admin',
      'Platform',
      'System Administrator',
      '+65-0000-0000',
      'admin@polyguard.com',
      'approved',
      true
    ]);
    
    console.log('✓ Admin account created/updated');
    console.log('  Username: admin');
    console.log('  Password: Admin123!');
    console.log('  (Please change this password after first login!)');
    
    // Verify tables
    console.log('\nVerifying database tables...');
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log('\nCreated tables:');
    tables.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    // Check views
    const views = await client.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    if (views.rows.length > 0) {
      console.log('\nCreated views:');
      views.rows.forEach(row => {
        console.log(`  - ${row.table_name}`);
      });
    }
    
    console.log('\n✓ Database migration completed successfully!');
    
  } catch (err) {
    console.error('\n✗ Migration failed:', err.message);
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
