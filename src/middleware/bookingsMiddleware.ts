import { Context } from 'koa'
import BookingModel from '../models/bookingModel'
import TripModel from '../models/tripModel'
import TravelerModel from '../models/travelerModel'
import { bookingCreateSchema, bookingUpdateSchema } from '../schemas/booking'
import { pool } from '../db'
import { Payment } from '../schemas/payment'
import { Booking } from '../schemas/booking'

export async function getBookings(ctx: Context) {
  const status = ctx.query.status as string | undefined
  const tripId = ctx.query.trip_id as string | undefined

  const bookings = await BookingModel.findAll({
    status,
    trip_id: tripId ? parseInt(tripId, 10) : undefined,
  })
  ctx.body = bookings
}

export async function getBooking(ctx: Context) {
  const id = parseInt(ctx.params.id, 10)
  const booking = await BookingModel.findById(id)

  if (!booking) {
    ctx.status = 404
    ctx.body = { error: 'Booking not found' }
    return
  }

  ctx.body = booking
}

export async function createBooking(ctx: Context) {
  const validation = bookingCreateSchema.safeParse(ctx.request.body)

  if (!validation.success) {
    ctx.status = 400
    ctx.body = { error: 'Validation failed', details: validation.error.flatten().fieldErrors }
    return
  }

  const { trip_id, traveler_id } = validation.data

  // Verify trip exists
  const trip = await TripModel.findById(trip_id)
  if (!trip) {
    ctx.status = 400
    ctx.body = { error: 'Trip not found' }
    return
  }

  // Verify traveler exists
  const traveler = await TravelerModel.findById(traveler_id)
  if (!traveler) {
    ctx.status = 400
    ctx.body = { error: 'Traveler not found' }
    return
  }

  const booking = await BookingModel.create(validation.data)
  ctx.status = 201
  ctx.body = booking
}

export async function updateBooking(ctx: Context) {
  const id = parseInt(ctx.params.id, 10)
  const validation = bookingUpdateSchema.safeParse(ctx.request.body)

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

  // Verify trip exists if updating
  if (validation.data.trip_id !== undefined) {
    const trip = await TripModel.findById(validation.data.trip_id)
    if (!trip) {
      ctx.status = 400
      ctx.body = { error: 'Trip not found' }
      return
    }
  }

  // Verify traveler exists if updating
  if (validation.data.traveler_id !== undefined) {
    const traveler = await TravelerModel.findById(validation.data.traveler_id)
    if (!traveler) {
      ctx.status = 400
      ctx.body = { error: 'Traveler not found' }
      return
    }
  }

  const booking = await BookingModel.update(id, validation.data)

  if (!booking) {
    ctx.status = 404
    ctx.body = { error: 'Booking not found' }
    return
  }

  ctx.body = booking
}

export async function deleteBooking(ctx: Context) {
  const id = parseInt(ctx.params.id, 10)
  const deleted = await BookingModel.remove(id)

  if (!deleted) {
    ctx.status = 404
    ctx.body = { error: 'Booking not found' }
    return
  }

  ctx.status = 204
}

export async function cancelBooking(ctx: Context) {
  const id = parseInt(ctx.params.id, 10)

  // Validate ID
  if (isNaN(id)) {
    ctx.status = 400
    ctx.body = { error: 'Invalid booking ID' }
    return
  }

  // Get booking first
  const booking = await BookingModel.findById(id)

  if (!booking) {
    ctx.status = 404
    ctx.body = { error: 'Booking not found' }
    return
  }

  // Validation: Check if already cancelled
  if (booking.status === 'cancelled') {
    ctx.status = 400
    ctx.body = { error: 'Booking is already cancelled' }
    return
  }

  // Use transaction for atomicity
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Update booking status to cancelled
    const updateBookingQuery = `
      UPDATE bookings
      SET status = 'cancelled'
      WHERE id = $1
      RETURNING *
    `
    const bookingResult = await client.query<Booking>(updateBookingQuery, [id])
    const cancelledBooking = bookingResult.rows[0]

    // Find completed payment for this booking
    const findPaymentQuery = `
      SELECT * FROM payments
      WHERE booking_id = $1 AND status = 'completed'
      LIMIT 1
    `
    const paymentResult = await client.query<Payment>(findPaymentQuery, [id])
    const completedPayment = paymentResult.rows[0]

    let refund: Payment | null = null

    // If completed payment exists, create refund
    if (completedPayment) {
      const createRefundQuery = `
        INSERT INTO payments (booking_id, amount, currency, status)
        VALUES ($1, $2, $3, 'refunded')
        RETURNING *
      `
      const refundResult = await client.query<Payment>(createRefundQuery, [
        id,
        -completedPayment.amount, // Negative amount for refund
        completedPayment.currency,
      ])
      refund = refundResult.rows[0]
    }

    await client.query('COMMIT')

    // Return response with booking and refund (if created)
    ctx.body = {
      booking: cancelledBooking,
      refund: refund || undefined,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
