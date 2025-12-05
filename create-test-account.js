const { Pool } = require('pg');
const crypto = require('crypto');

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_FTYS4XhWbd5l@ep-shiny-sunset-ae0ezxj1-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function createTestAccount() {
  try {
    console.log('Creating test account...');

    // 1. Create or update the merchant account
    const merchantResult = await pool.query(`
      INSERT INTO merchants (
        user_name, password_hash, password_salt, company_uen, company_name,
        business_type, company_website, job_position, phone_number, email,
        status, is_admin
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'approved', false)
      ON CONFLICT (user_name) 
      DO UPDATE SET 
        password_hash = EXCLUDED.password_hash,
        company_name = EXCLUDED.company_name,
        status = 'approved'
      RETURNING id, user_name, company_name
    `, [
      'test1', 
      'test1234', 
      '', 
      '202512030001T', 
      'Test1',
      'Technology',
      'https://test1.com',
      'Manager',
      '+65 9123 4567',
      'test1@test1.com'
    ]);

    const merchant = merchantResult.rows[0];
    console.log('✓ Merchant created:', merchant);

    // 2. Clear existing data for this merchant
    await pool.query('DELETE FROM merchant_qr_codes WHERE merchant_id = $1', [merchant.id]);
    await pool.query('DELETE FROM merchant_hashes WHERE merchant_id = $1', [merchant.id]);
    await pool.query('DELETE FROM transaction_logs WHERE merchant_id = $1', [merchant.id]);

    // 3. Create 9 QR codes
    console.log('Creating 9 QR codes...');
    const qrCodes = [];
    for (let i = 1; i <= 9; i++) {
      const qrResult = await pool.query(`
        INSERT INTO merchant_qr_codes (
          merchant_id, qr_code_svg, qr_url, label, description,
          scan_count, payment_method, payment_details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        merchant.id,
        '<svg>QR Code ' + i + '</svg>',
        `https://polyguard.netlify.app/payment-page.html?company=test1`,
        `QR Code ${i}`,
        `Test QR Code ${i}`,
        Math.floor(Math.random() * 20) + 5, // Random scans between 5-25
        i % 3 === 0 ? 'PayNow' : i % 3 === 1 ? 'PayLah!' : 'Bank Account',
        i % 3 === 0 ? '+65 9123 4567' : i % 3 === 1 ? '+65 8765 4321' : 'DBS 123-456789-0'
      ]);
      qrCodes.push(qrResult.rows[0].id);
    }
    console.log('✓ Created 9 QR codes');

    // 4. Create 15 hashes
    console.log('Creating 15 hashes...');
    const hashes = [];
    for (let i = 1; i <= 15; i++) {
      const crypto = require('crypto');
      const message = `Test Message ${i} from Test1 Company`;
      const hash = crypto.createHash('sha256').update(message, 'utf8').digest('hex');
      
      const hashResult = await pool.query(`
        INSERT INTO merchant_hashes (
          merchant_id, original_message, message_hash, purpose, verification_count
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [
        merchant.id,
        message,
        hash,
        `Test Hash ${i}`,
        Math.floor(Math.random() * 30) + 5 // Random verifications between 5-35
      ]);
      hashes.push(hashResult.rows[0].id);
    }
    console.log('✓ Created 15 hashes');

    // 5. Create transaction logs for QR scans (139 total)
    console.log('Creating 139 QR scan transaction logs...');
    for (let i = 0; i < 139; i++) {
      const randomQrId = qrCodes[Math.floor(Math.random() * qrCodes.length)];
      await pool.query(`
        INSERT INTO transaction_logs (
          merchant_id, transaction_type, qr_code_id, 
          verification_result, result_message
        ) VALUES ($1, 'qr_scan', $2, 'success', 'QR code scanned')
      `, [merchant.id, randomQrId]);
    }
    console.log('✓ Created 139 QR scan logs');

    // 6. Create transaction logs for hash verifications (249 total)
    console.log('Creating 249 hash verification transaction logs...');
    for (let i = 0; i < 249; i++) {
      const randomHashId = hashes[Math.floor(Math.random() * hashes.length)];
      const randomHash = crypto.createHash('sha256').update(`Random ${i}`, 'utf8').digest('hex');
      await pool.query(`
        INSERT INTO transaction_logs (
          merchant_id, transaction_type, hash_id, scanned_hash,
          verification_result, result_message
        ) VALUES ($1, 'hash_verification', $2, $3, 'success', 'Hash verified successfully')
      `, [merchant.id, randomHashId, randomHash]);
    }
    console.log('✓ Created 249 hash verification logs');

    // 7. Verify the counts
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM merchant_qr_codes WHERE merchant_id = $1) as qr_count,
        (SELECT COUNT(*) FROM merchant_hashes WHERE merchant_id = $1) as hash_count,
        (SELECT COUNT(*) FROM transaction_logs WHERE merchant_id = $1 AND transaction_type = 'qr_scan') as qr_scan_count,
        (SELECT COUNT(*) FROM transaction_logs WHERE merchant_id = $1 AND transaction_type = 'hash_verification') as hash_verification_count
    `, [merchant.id]);

    console.log('\n✅ Test account created successfully!');
    console.log('================================');
    console.log('Username: test1');
    console.log('Password: test1234');
    console.log('Company: Test1');
    console.log('Status: approved');
    console.log('\nStatistics:');
    console.log('Total QR Codes:', stats.rows[0].qr_count);
    console.log('Total Hashes:', stats.rows[0].hash_count);
    console.log('Total QR Scans:', stats.rows[0].qr_scan_count);
    console.log('Hash Verifications:', stats.rows[0].hash_verification_count);
    console.log('================================\n');

    await pool.end();
  } catch (err) {
    console.error('Error creating test account:', err);
    await pool.end();
    process.exit(1);
  }
}

createTestAccount();
