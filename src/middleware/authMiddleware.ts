import { Context, Next } from 'koa'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import UserModel from '../models/userModel'
import { loginSchema } from '../schemas/auth'

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
