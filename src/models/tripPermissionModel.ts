import { executeQuery } from '../db'
import { TripPermission, TripPermissionCreate } from '../schemas/tripPermission'

async function create(data: TripPermissionCreate): Promise<TripPermission> {
  const query = `
    INSERT INTO trip_permissions (trip_id, organization_id, user_id)
    VALUES ($1, $2, $3)
    RETURNING *
  `
  const result = await executeQuery<TripPermission>(query, [
    data.trip_id,
    data.organization_id,
    data.user_id,
  ])
  return result.rows[0]
}

async function findByTripId(tripId: number): Promise<TripPermission[]> {
  const query = 'SELECT * FROM trip_permissions WHERE trip_id = $1'
  const result = await executeQuery<TripPermission>(query, [tripId])
  return result.rows
}

async function hasPermission(tripId: number, userId: number, organizationId: number): Promise<boolean> {
  const query = `
    SELECT id FROM trip_permissions
    WHERE trip_id = $1
    AND (organization_id = $2 OR user_id = $3)
  `
  const result = await executeQuery<{ id: number }>(query, [tripId, organizationId, userId])
  return result.rows.length > 0
}

export default {
  create,
  findByTripId,
  hasPermission,
}
