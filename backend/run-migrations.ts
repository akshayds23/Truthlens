import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigrations() {
  try {
    console.log('🚀 Starting database migrations...');
    
    // Read schema file
    const schemaPath = join(__dirname, 'migrations', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Connect and run
    const client = await pool.connect();
    console.log('✅ Connected to database');
    
    // Split by semicolon and run each statement
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      try {
        await client.query(statement);
        console.log('✓', statement.substring(0, 50) + '...');
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          console.log('⚠️ ', statement.substring(0, 50) + '... (already exists)');
        } else {
          throw error;
        }
      }
    }
    
    client.release();
    console.log('✅ Database migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
