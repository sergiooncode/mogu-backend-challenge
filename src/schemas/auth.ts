import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  organization_name: z.string().min(1, 'Organization name is required'),
})

export type LoginRequest = z.infer<typeof loginSchema>
export type RegisterRequest = z.infer<typeof registerSchema>
