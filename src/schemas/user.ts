import { z } from 'zod'

export const userSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  password: z.string(),
  organization_id: z.number().int(),
  created_at: z.string().datetime().optional(),
})

export type User = z.infer<typeof userSchema>
