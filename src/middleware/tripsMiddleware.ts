import { Context } from 'koa'
import TripModel from '../models/tripModel'
import TripPermissionModel from '../models/tripPermissionModel'
import { tripCreateSchema, tripUpdateSchema } from '../schemas/trip'
import { tripPermissionCreateSchema } from '../schemas/tripPermission'

export async function getTrips(ctx: Context) {
  if (!ctx.user) {
    ctx.status = 401
    ctx.body = { error: 'Unauthorized' }
    return
  }

  const { userId, organizationId } = ctx.user
  const destination = ctx.query.destination as string | undefined

  // Only return trips user owns OR has permission to see
  const trips = await TripModel.findAllForUser(userId, organizationId, destination)
  ctx.body = trips
}

export async function getTrip(ctx: Context) {
  const id = parseInt(ctx.params.id, 10)
  const trip = await TripModel.findById(id)

  if (!trip) {
    ctx.status = 404
    ctx.body = { error: 'Trip not found' }
    return
  }

  // Check if user is owner OR has permission (read or write)
  if (ctx.user?.userId && ctx.user?.organizationId) {
    const isOwner = trip.created_by_user_id === ctx.user.userId
    const hasAccess = isOwner || await TripPermissionModel.hasPermission(id, ctx.user.userId, ctx.user.organizationId, 'read')

    if (!hasAccess) {
      ctx.status = 403
      ctx.body = { error: 'Access denied: You do not have permission to view this trip' }
      return
    }
  }

  ctx.body = trip
}

export async function createTrip(ctx: Context) {
  const validation = tripCreateSchema.safeParse(ctx.request.body)

  if (!validation.success) {
    ctx.status = 400
    ctx.body = { error: 'Validation failed', details: validation.error.flatten().fieldErrors }
    return
  }

  // Create trip with creator ownership (trips are private by default)
  const trip = await TripModel.create(validation.data, ctx.user?.userId)

  ctx.status = 201
  ctx.body = trip
}

export async function updateTrip(ctx: Context) {
  const id = parseInt(ctx.params.id, 10)
  const validation = tripUpdateSchema.safeParse(ctx.request.body)

  if (!validation.success) {
    ctx.status = 400
    ctx.body = { error: 'Validation failed', details: validation.error.flatten().fieldErrors }
    return
  }

  if (Object.keys(validation.data).length === 0) {
    ctx.status = 400
    ctx.body = { error: 'No fields to update' }
    return
  }

  // Check if trip exists
  const existingTrip = await TripModel.findById(id)
  if (!existingTrip) {
    ctx.status = 404
    ctx.body = { error: 'Trip not found' }
    return
  }

  // Check if user is owner OR has write permission
  if (ctx.user?.userId && ctx.user?.organizationId) {
    const isOwner = existingTrip.created_by_user_id === ctx.user.userId
    const hasWriteAccess = isOwner || await TripPermissionModel.hasPermission(id, ctx.user.userId, ctx.user.organizationId, 'write')

    if (!hasWriteAccess) {
      ctx.status = 403
      ctx.body = { error: 'Access denied: You need write permission to update this trip' }
      return
    }
  }

  const trip = await TripModel.update(id, validation.data)
  ctx.body = trip
}

export async function deleteTrip(ctx: Context) {
  const id = parseInt(ctx.params.id, 10)
  const deleted = await TripModel.remove(id)

  if (!deleted) {
    ctx.status = 404
    ctx.body = { error: 'Trip not found' }
    return
  }

  ctx.status = 204
}

export async function shareTrip(ctx: Context) {
  const id = parseInt(ctx.params.id, 10)

  if (isNaN(id)) {
    ctx.status = 400
    ctx.body = { error: 'Invalid trip ID' }
    return
  }

  const body = ctx.request.body as { organization_id?: number; user_id?: number; permission_level?: string }
  const validation = tripPermissionCreateSchema.safeParse({
    trip_id: id,
    organization_id: body.organization_id ?? null,
    user_id: body.user_id ?? null,
    permission_level: body.permission_level || 'read',
  })

  if (!validation.success) {
    ctx.status = 400
    ctx.body = { error: 'Validation failed', details: validation.error.flatten().fieldErrors }
    return
  }

  // Verify trip exists
  const trip = await TripModel.findById(id)
  if (!trip) {
    ctx.status = 404
    ctx.body = { error: 'Trip not found' }
    return
  }

  try {
    const permission = await TripPermissionModel.create(validation.data)
    ctx.status = 201
    ctx.body = permission
  } catch (error: any) {
    // Handle unique constraint violation (already shared)
    if (error.code === '23505') {
      const target = body.organization_id ? 'organization' : 'user'
      ctx.status = 409
      ctx.body = { error: `Trip already shared with this ${target}` }
      return
    }
    throw error
  }
}
