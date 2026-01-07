import dotenv from 'dotenv'
import { pool } from '../src/db'
import { runMigrations } from '../scripts/migrate'

// Load test environment variables
dotenv.config({ path: '.env.test' })

// Global test setup
beforeAll(async () => {
  // Run actual migrations to ensure test schema matches production
  await runMigrations(false) // Don't close pool - tests need it
})

afterAll(async () => {
  // Close database connection pool to allow Jest to exit
  await pool.end()
})
