import { z } from 'zod'

export const tripPermissionSchema = z.object({
  id: z.number().int(),
  trip_id: z.number().int(),
  organization_id: z.number().int(),
  created_at: z.string().datetime().optional(),
})

export const tripPermissionCreateSchema = tripPermissionSchema.omit({
  id: true,
  created_at: true,
})

export type TripPermission = z.infer<typeof tripPermissionSchema>
export type TripPermissionCreate = z.infer<typeof tripPermissionCreateSchema>
