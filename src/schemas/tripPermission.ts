import { z } from 'zod'

export const permissionLevelSchema = z.enum(['read', 'write'])

export const tripPermissionSchema = z.object({
  id: z.number().int(),
  trip_id: z.number().int(),
  organization_id: z.number().int().nullable(),
  user_id: z.number().int().nullable(),
  permission_level: permissionLevelSchema,
  created_at: z.string().datetime().optional(),
})

export const tripPermissionCreateSchema = tripPermissionSchema
  .omit({
    id: true,
    created_at: true,
  })
  .refine(
    (data) => (data.organization_id !== null) !== (data.user_id !== null),
    {
      message: 'Either organization_id or user_id must be set (but not both)',
    }
  )

export type TripPermission = z.infer<typeof tripPermissionSchema>
export type TripPermissionCreate = z.infer<typeof tripPermissionCreateSchema>
export type PermissionLevel = z.infer<typeof permissionLevelSchema>
