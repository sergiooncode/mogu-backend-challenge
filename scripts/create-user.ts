import { pool } from '../src/db'
import bcrypt from 'bcrypt'

interface CreateUserArgs {
  email: string
  password: string
  organizationName: string
}

async function createUser(args: CreateUserArgs) {
  const client = await pool.connect()

  try {
    console.log('Creating user...')

    // Hash password
    const hashedPassword = await bcrypt.hash(args.password, 10)
    console.log(`Password hashed: ${hashedPassword}`)

    // Create organization
    const orgResult = await client.query(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING id, name',
      [args.organizationName]
    )
    const organization = orgResult.rows[0]
    console.log(`✓ Organization created: ${organization.name} (ID: ${organization.id})`)

    // Create user
    const userResult = await client.query(
      `INSERT INTO users (email, password, organization_id)
       VALUES ($1, $2, $3)
       RETURNING id, email, organization_id, created_at`,
      [args.email, hashedPassword, organization.id]
    )
    const user = userResult.rows[0]
    console.log(`✓ User created: ${user.email} (ID: ${user.id})`)
    console.log(`  Organization ID: ${user.organization_id}`)
    console.log(`  Created at: ${user.created_at}`)

    console.log('\n✅ User successfully created!')
    console.log('\nYou can now login with:')
    console.log(`  Email: ${args.email}`)
    console.log(`  Password: ${args.password}`)
  } catch (error) {
    console.error('Failed to create user:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

// Parse command line arguments
const email = process.argv[2]
const password = process.argv[3]
const organizationName = process.argv[4] || 'Default Organization'

if (!email || !password) {
  console.error('Usage: ts-node scripts/create-user.ts <email> <password> [organization-name]')
  console.error('Example: ts-node scripts/create-user.ts test@example.com password123 "My Company"')
  process.exit(1)
}

createUser({ email, password, organizationName })
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
