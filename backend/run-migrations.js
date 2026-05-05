const { Pool } = require('pg');
const { readFileSync } = require('fs');
const { join } = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigrations() {
  try {
    console.log('🚀 Starting database migrations...');
    
    // Read schema file
    const schemaPath = join(__dirname, 'migrations', 'schema-neon.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Connect
    const client = await pool.connect();
    console.log('✅ Connected to database');
    
    // Execute schema
    try {
      await client.query(schema);
      console.log('✅ Schema executed successfully!');
    } catch (error) {
      console.error('❌ Error:', error.message);
      throw error;
    }
    
    client.release();
    
    // Verify tables
    console.log('\n📊 Verifying tables...');
    const verifyClient = await pool.connect();
    const result = await verifyClient.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log(`✅ Found ${result.rows.length} tables:`);
    result.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });
    
    verifyClient.release();
    
    console.log('\n✅ Database migrations completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigrations();

