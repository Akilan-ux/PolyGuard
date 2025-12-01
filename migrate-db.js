const { Pool } = require('pg');

const DATABASE_URL = "postgresql://neondb_owner:npg_FTYS4XhWbd5l@ep-shiny-sunset-ae0ezxj1-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function migrate() {
  try {
    console.log('Adding short_id column if not exists...');
    await pool.query(`
      ALTER TABLE qr_registrations
      ADD COLUMN IF NOT EXISTS short_id VARCHAR(12) UNIQUE;
    `);
    console.log('Column added or already exists');

    console.log('Creating index on short_id...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_qr_short_id ON qr_registrations(short_id);
    `);
    console.log('Index created');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
