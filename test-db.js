const { Pool } = require('pg');

const DATABASE_URL = "postgresql://neondb_owner:npg_FTYS4XhWbd5l@ep-shiny-sunset-ae0ezxj1-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testConnection() {
  try {
    console.log('Testing database connection...');
    const result = await pool.query('SELECT NOW()');
    console.log('Connection successful! Current time:', result.rows[0]);
    
    console.log('\nChecking if qr_registrations table exists...');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'qr_registrations'
      );
    `);
    console.log('Table exists:', tableCheck.rows[0].exists);
    
    if (tableCheck.rows[0].exists) {
      console.log('\nFetching existing records...');
      const records = await pool.query('SELECT id, hash, company, created_at FROM qr_registrations');
      console.log('Records found:', records.rows.length);
      records.rows.forEach((row, idx) => {
        console.log(`  ${idx + 1}. Hash: ${row.hash}, Company: ${row.company}, Created: ${row.created_at}`);
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

testConnection();
