const { Pool } = require('pg');

const DATABASE_URL = "postgresql://neondb_owner:npg_FTYS4XhWbd5l@ep-shiny-sunset-ae0ezxj1-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createAdmin() {
  try {
    // Check if admin exists
    const check = await pool.query(
      "SELECT * FROM merchants WHERE user_name = 'admin'"
    );

    if (check.rows.length > 0) {
      console.log('Admin already exists. Updating password...');
      await pool.query(
        "UPDATE merchants SET password_hash = $1, password_salt = $2, status = 'approved', is_admin = true WHERE user_name = 'admin'",
        ['Admin123!', '']
      );
      console.log('✓ Admin password updated to: Admin123!');
    } else {
      console.log('Creating new admin account...');
      await pool.query(`
        INSERT INTO merchants (
          user_name, password_hash, password_salt, company_name,
          status, is_admin
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, ['admin', 'Admin123!', '', 'PolyGuard Admin', 'approved', true]);
      console.log('✓ Admin account created');
    }

    // Verify
    const verify = await pool.query(
      "SELECT user_name, password_hash, is_admin, status FROM merchants WHERE user_name = 'admin'"
    );
    
    console.log('\nAdmin Account Details:');
    console.log('Username:', verify.rows[0].user_name);
    console.log('Password:', verify.rows[0].password_hash);
    console.log('Is Admin:', verify.rows[0].is_admin);
    console.log('Status:', verify.rows[0].status);
    console.log('\nYou can now login with:');
    console.log('Username: admin');
    console.log('Password: Admin123!');

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

createAdmin();
