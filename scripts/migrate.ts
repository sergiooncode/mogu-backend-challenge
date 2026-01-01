import { pool } from '../src/db'
import * as fs from 'fs'
import * as path from 'path'

export async function runMigrations(closePool = true) {
  const client = await pool.connect()

  try {
    console.log('Running migrations...')

    // Create schema_migrations table to track applied migrations
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Get all migration files
    const migrationsDir = path.join(__dirname, 'migrations')
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()

    console.log(`Found ${migrationFiles.length} migration files`)

    for (const file of migrationFiles) {
      // Extract version number from filename (e.g., 001_initial_schema.sql -> 1)
      const version = parseInt(file.split('_')[0], 10)

      // Check if migration has already been applied
      const result = await client.query(
        'SELECT version FROM schema_migrations WHERE version = $1',
        [version]
      )

      if (result.rows.length > 0) {
        console.log(`⏭️  Skipping migration ${file} (already applied)`)
        continue
      }

      // Read and execute migration
      console.log(`▶️  Running migration ${file}...`)
      const migrationSQL = fs.readFileSync(
        path.join(migrationsDir, file),
        'utf8'
      )

      await client.query(migrationSQL)

      // Record migration as applied
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [version]
      )

      console.log(`✅ Migration ${file} completed`)
    }

    console.log('All migrations completed successfully')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    client.release()
    if (closePool) {
      await pool.end()
    }
  }
}

// Only run migrations and exit if this file is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}
