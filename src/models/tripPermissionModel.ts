import { executeQuery } from '../db'
import { TripPermission, TripPermissionCreate } from '../schemas/tripPermission'

async function create(data: TripPermissionCreate): Promise<TripPermission> {
  const query = `
    INSERT INTO trip_permissions (trip_id, organization_id, user_id, permission_level)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `
  const result = await executeQuery<TripPermission>(query, [
    data.trip_id,
    data.organization_id,
    data.user_id,
    data.permission_level,
  ])
  return result.rows[0]
}

async function findByTripId(tripId: number): Promise<TripPermission[]> {
  const query = 'SELECT * FROM trip_permissions WHERE trip_id = $1'
  const result = await executeQuery<TripPermission>(query, [tripId])
  return result.rows
}

async function hasPermission(tripId: number, userId: number, organizationId: number, requiredLevel?: 'read' | 'write'): Promise<boolean> {
  let query = `
    SELECT permission_level FROM trip_permissions
    WHERE trip_id = $1
    AND (organization_id = $2 OR user_id = $3)
  `
  const result = await executeQuery<{ permission_level: string }>(query, [tripId, organizationId, userId])

  if (result.rows.length === 0) {
    return false
  }

  // If no specific level required, any permission grants access
  if (!requiredLevel) {
    return true
  }

  // Check if any permission meets the required level
  // 'write' permission also grants 'read' access
  return result.rows.some(row =>
    row.permission_level === 'write' ||
    (requiredLevel === 'read' && row.permission_level === 'read')
  )
}

export default {
  create,
  findByTripId,
  hasPermission,
}
