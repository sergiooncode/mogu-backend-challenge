import { Context, Next } from 'koa'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import UserModel from '../models/userModel'
import { loginSchema, registerSchema } from '../schemas/auth'
import { executeQuery } from '../db'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

interface JWTPayload {
  userId: number
  email: string
  organizationId: number
}

// Extend Koa context to include user info
declare module 'koa' {
  interface Context {
    user?: JWTPayload
  }
}

export async function login(ctx: Context) {
  const validation = loginSchema.safeParse(ctx.request.body)

  if (!validation.success) {
    ctx.status = 400
    ctx.body = { error: 'Validation failed', details: validation.error.flatten().fieldErrors }
    return
  }

  const { email, password } = validation.data

  // Find user by email
  const user = await UserModel.findByEmail(email)

  if (!user) {
    ctx.status = 401
    ctx.body = { error: 'Invalid credentials' }
    return
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password)

  if (!isPasswordValid) {
    ctx.status = 401
    ctx.body = { error: 'Invalid credentials' }
    return
  }

  // Generate JWT token
  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      organizationId: user.organization_id
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  )

  ctx.body = {
    token,
    user: {
      id: user.id,
      email: user.email,
      organization_id: user.organization_id,
    },
  }
}

export async function register(ctx: Context) {
  const validation = registerSchema.safeParse(ctx.request.body)

  if (!validation.success) {
    ctx.status = 400
    ctx.body = { error: 'Validation failed', details: validation.error.flatten().fieldErrors }
    return
  }

  const { email, password, organization_name } = validation.data

  // Check if user already exists
  const existingUser = await UserModel.findByEmail(email)
  if (existingUser) {
    ctx.status = 409
    ctx.body = { error: 'User with this email already exists' }
    return
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10)

  try {
    // Create organization
    const orgResult = await executeQuery<{ id: number }>(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
      [organization_name]
    )
    const organizationId = orgResult.rows[0].id

    // Create user
    const userResult = await executeQuery<{ id: number; email: string; organization_id: number }>(
      'INSERT INTO users (email, password, organization_id) VALUES ($1, $2, $3) RETURNING id, email, organization_id',
      [email, hashedPassword, organizationId]
    )
    const user = userResult.rows[0]

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        organizationId: user.organization_id
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    ctx.status = 201
    ctx.body = {
      token,
      user: {
        id: user.id,
        email: user.email,
        organization_id: user.organization_id,
      },
    }
  } catch (error: any) {
    // Handle unique constraint violation (race condition)
    if (error.code === '23505') {
      ctx.status = 409
      ctx.body = { error: 'User with this email already exists' }
      return
    }
    throw error
  }
}

export async function requireAuth(ctx: Context, next: Next) {
  const authHeader = ctx.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    ctx.status = 401
    ctx.body = { error: 'No token provided' }
    return
  }

  const token = authHeader.substring(7) // Remove 'Bearer ' prefix

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    ctx.user = decoded
    await next()
  } catch (error) {
    ctx.status = 401
    ctx.body = { error: 'Invalid or expired token' }
  }
}
