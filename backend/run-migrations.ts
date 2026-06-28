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
    
    // Read schema file (use neon version if database is on neon.tech)
    const isNeon = (process.env.DATABASE_URL || '').includes('neon.tech');
    const schemaFileName = isNeon ? 'schema-neon.sql' : 'schema.sql';
    const schemaPath = join(__dirname, 'migrations', schemaFileName);
    console.log(`Reading migration file: ${schemaFileName}`);
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Connect and run
    const client = await pool.connect();
    console.log('✅ Connected to database');
    
    // Strip SQL comments and split by semicolon
    const cleanSchema = schema
      .replace(/--.*$/gm, '') // Remove -- comments
      .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove /* */ comments

    const statements = cleanSchema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
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
