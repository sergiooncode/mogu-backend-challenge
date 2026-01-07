import request from 'supertest'
import app from '../src/index'
import { executeQuery } from '../src/db'

const uniqueEmail = () => `test.${Date.now()}@example.com`

describe('PATCH /bookings/:id/cancel', () => {
  afterEach(async () => {
    // Clean database between tests
    await executeQuery('TRUNCATE trips, travelers, bookings, payments CASCADE')
  })

  it('should cancel booking and create refund when completed payment exists', async () => {
    // Arrange: Create fixtures directly in database
    const tripResult = await executeQuery<{ id: number }>(
      `INSERT INTO trips (title, destination, start_date, end_date)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['Test Trip', 'Paris', '2024-06-01', '2024-06-15']
    )
    const tripId = tripResult.rows[0].id

    const travelerResult = await executeQuery<{ id: number }>(
      `INSERT INTO travelers (first_name, last_name, email)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['John', 'Doe', uniqueEmail()]
    )
    const travelerId = travelerResult.rows[0].id

    const bookingResult = await executeQuery<{ id: number }>(
      `INSERT INTO bookings (trip_id, traveler_id, status)
       VALUES ($1, $2, 'confirmed')
       RETURNING id`,
      [tripId, travelerId]
    )
    const bookingId = bookingResult.rows[0].id

    // Create completed payment
    const paymentResult = await executeQuery<{ id: number; amount: string }>(
      `INSERT INTO payments (booking_id, amount, currency, status)
       VALUES ($1, $2, $3, 'completed')
       RETURNING id, amount`,
      [bookingId, 1500.00, 'EUR']
    )
    const paymentAmount = paymentResult.rows[0].amount

    // Act: Cancel booking
    const response = await request(app.callback())
      .patch(`/bookings/${bookingId}/cancel`)
      .expect(200)

    // Assert: Booking is cancelled
    expect(response.body.booking).toMatchObject({
      id: bookingId,
      trip_id: tripId,
      traveler_id: travelerId,
      status: 'cancelled',
    })

    // Assert: Refund was created with negative amount
    expect(response.body.refund).toBeDefined()
    expect(response.body.refund).toMatchObject({
      booking_id: bookingId,
      amount: `-${paymentAmount}`,
      currency: 'EUR',
      status: 'refunded',
    })
    expect(response.body.refund.id).toBeDefined()
    expect(response.body.refund.created_at).toBeDefined()
  })

  it('should cancel booking without refund when no completed payment exists', async () => {
    // Arrange: Create booking without completed payment
    const tripResult = await executeQuery<{ id: number }>(
      `INSERT INTO trips (title, destination, start_date, end_date)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['Test Trip', 'Barcelona', '2024-07-01', '2024-07-15']
    )
    const tripId = tripResult.rows[0].id

    const travelerResult = await executeQuery<{ id: number }>(
      `INSERT INTO travelers (first_name, last_name, email)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['Jane', 'Smith', uniqueEmail()]
    )
    const travelerId = travelerResult.rows[0].id

    const bookingResult = await executeQuery<{ id: number }>(
      `INSERT INTO bookings (trip_id, traveler_id, status)
       VALUES ($1, $2, 'pending')
       RETURNING id`,
      [tripId, travelerId]
    )
    const bookingId = bookingResult.rows[0].id

    // Act: Cancel booking
    const response = await request(app.callback())
      .patch(`/bookings/${bookingId}/cancel`)
      .expect(200)

    // Assert: Booking is cancelled
    expect(response.body.booking).toMatchObject({
      id: bookingId,
      status: 'cancelled',
    })

    // Assert: No refund created
    expect(response.body.refund).toBeUndefined()
  })

  it('should cancel booking without refund when payment is pending', async () => {
    // Arrange: Create booking with pending payment
    const tripResult = await executeQuery<{ id: number }>(
      `INSERT INTO trips (title, destination, start_date, end_date)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['Test Trip', 'Rome', '2024-08-01', '2024-08-15']
    )
    const tripId = tripResult.rows[0].id

    const travelerResult = await executeQuery<{ id: number }>(
      `INSERT INTO travelers (first_name, last_name, email)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['Bob', 'Johnson', uniqueEmail()]
    )
    const travelerId = travelerResult.rows[0].id

    const bookingResult = await executeQuery<{ id: number }>(
      `INSERT INTO bookings (trip_id, traveler_id, status)
       VALUES ($1, $2, 'pending')
       RETURNING id`,
      [tripId, travelerId]
    )
    const bookingId = bookingResult.rows[0].id

    // Create pending payment
    await executeQuery(
      `INSERT INTO payments (booking_id, amount, currency, status)
       VALUES ($1, $2, $3, 'pending')`,
      [bookingId, 800.00, 'EUR']
    )

    // Act: Cancel booking
    const response = await request(app.callback())
      .patch(`/bookings/${bookingId}/cancel`)
      .expect(200)

    // Assert: Booking is cancelled
    expect(response.body.booking.status).toBe('cancelled')

    // Assert: No refund created (payment wasn't completed)
    expect(response.body.refund).toBeUndefined()
  })

  it('should return 400 when booking is already cancelled', async () => {
    // Arrange: Create already cancelled booking
    const tripResult = await executeQuery<{ id: number }>(
      `INSERT INTO trips (title, destination, start_date, end_date)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['Test Trip', 'London', '2024-09-01', '2024-09-15']
    )
    const tripId = tripResult.rows[0].id

    const travelerResult = await executeQuery<{ id: number }>(
      `INSERT INTO travelers (first_name, last_name, email)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['Alice', 'Williams', uniqueEmail()]
    )
    const travelerId = travelerResult.rows[0].id

    const bookingResult = await executeQuery<{ id: number }>(
      `INSERT INTO bookings (trip_id, traveler_id, status)
       VALUES ($1, $2, 'cancelled')
       RETURNING id`,
      [tripId, travelerId]
    )
    const bookingId = bookingResult.rows[0].id

    // Act: Attempt to cancel already cancelled booking
    const response = await request(app.callback())
      .patch(`/bookings/${bookingId}/cancel`)
      .expect(400)

    // Assert: Error message
    expect(response.body).toEqual({
      error: 'Booking is already cancelled',
    })
  })

  it('should return 404 when booking does not exist', async () => {
    // Act: Attempt to cancel non-existent booking
    const response = await request(app.callback())
      .patch('/bookings/999999/cancel')
      .expect(404)

    // Assert: Error message
    expect(response.body).toEqual({
      error: 'Booking not found',
    })
  })

  it('should ensure refund amount matches original payment amount', async () => {
    // Arrange: Create booking with specific payment amount
    const tripResult = await executeQuery<{ id: number }>(
      `INSERT INTO trips (title, destination, start_date, end_date)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['Test Trip', 'Berlin', '2024-10-01', '2024-10-15']
    )
    const tripId = tripResult.rows[0].id

    const travelerResult = await executeQuery<{ id: number }>(
      `INSERT INTO travelers (first_name, last_name, email)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['Charlie', 'Brown', uniqueEmail()]
    )
    const travelerId = travelerResult.rows[0].id

    const bookingResult = await executeQuery<{ id: number }>(
      `INSERT INTO bookings (trip_id, traveler_id, status)
       VALUES ($1, $2, 'confirmed')
       RETURNING id`,
      [tripId, travelerId]
    )
    const bookingId = bookingResult.rows[0].id

    const originalAmount = 2345.67
    await executeQuery(
      `INSERT INTO payments (booking_id, amount, currency, status)
       VALUES ($1, $2, $3, 'completed')`,
      [bookingId, originalAmount, 'EUR']
    )

    // Act: Cancel booking
    const response = await request(app.callback())
      .patch(`/bookings/${bookingId}/cancel`)
      .expect(200)

    // Assert: Refund amount is negative of original
    const refundAmount = parseFloat(response.body.refund.amount)
    expect(refundAmount).toBe(-originalAmount)
  })
})
