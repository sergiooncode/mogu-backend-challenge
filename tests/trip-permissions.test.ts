import request from 'supertest'
import app from '../src/index'
import { executeQuery } from '../src/db'
import bcrypt from 'bcrypt'

describe('Trip Permissions API', () => {
  let org1Id: number
  let org2Id: number
  let user1Token: string
  let user2Token: string
  let tripId: number

  beforeEach(async () => {
    // Create two organizations
    const org1Result = await executeQuery<{ id: number }>(
      `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
      ['Organization 1']
    )
    org1Id = org1Result.rows[0].id

    const org2Result = await executeQuery<{ id: number }>(
      `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
      ['Organization 2']
    )
    org2Id = org2Result.rows[0].id

    // Create users for each organization
    const hashedPassword = await bcrypt.hash('password123', 10)
    const email1 = `user1.${Date.now()}@org1.com`
    const email2 = `user2.${Date.now()}@org2.com`

    await executeQuery(
      `INSERT INTO users (email, password, organization_id) VALUES ($1, $2, $3)`,
      [email1, hashedPassword, org1Id]
    )

    await executeQuery(
      `INSERT INTO users (email, password, organization_id) VALUES ($1, $2, $3)`,
      [email2, hashedPassword, org2Id]
    )

    // Login to get tokens
    const user1Response = await request(app.callback())
      .post('/auth/login')
      .send({ email: email1, password: 'password123' })
    user1Token = user1Response.body.token

    const user2Response = await request(app.callback())
      .post('/auth/login')
      .send({ email: email2, password: 'password123' })
    user2Token = user2Response.body.token
  })

  afterEach(async () => {
    await executeQuery('TRUNCATE trips, travelers, bookings, payments, users, organizations, trip_permissions CASCADE')
  })

  describe('POST /trips - private by default', () => {
    it('should create trip as private (no permissions granted)', async () => {
      const response = await request(app.callback())
        .post('/trips')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          title: 'Team Trip',
          destination: 'Barcelona',
          start_date: '2024-07-01',
          end_date: '2024-07-10',
        })
        .expect(201)

      tripId = response.body.id

      // Verify no permissions were created (trip is private)
      const permissionResult = await executeQuery<{ organization_id: number }>(
        'SELECT organization_id FROM trip_permissions WHERE trip_id = $1',
        [tripId]
      )

      expect(permissionResult.rows.length).toBe(0)

      // Verify owner is set
      expect(response.body.created_by_user_id).toBeDefined()
    })
  })

  describe('POST /trips/:id/share', () => {
    beforeEach(async () => {
      // Create a trip for user1's organization
      const tripResponse = await request(app.callback())
        .post('/trips')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          title: 'Team Trip',
          destination: 'Barcelona',
          start_date: '2024-07-01',
          end_date: '2024-07-10',
        })
      tripId = tripResponse.body.id
    })

    it('should share a trip with another organization', async () => {
      const response = await request(app.callback())
        .post(`/trips/${tripId}/share`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ organization_id: org2Id, permission_level: 'read' })
        .expect(201)

      expect(response.body).toMatchObject({
        trip_id: tripId,
        organization_id: org2Id,
        permission_level: 'read',
      })

      // Verify permission was created
      const permissionResult = await executeQuery<{ id: number; permission_level: string }>(
        'SELECT id, permission_level FROM trip_permissions WHERE trip_id = $1 AND organization_id = $2',
        [tripId, org2Id]
      )
      expect(permissionResult.rows.length).toBe(1)
      expect(permissionResult.rows[0].permission_level).toBe('read')
    })

    it('should return 409 when trip already shared with organization', async () => {
      // Share once
      await request(app.callback())
        .post(`/trips/${tripId}/share`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ organization_id: org2Id })
        .expect(201)

      // Try to share again
      const response = await request(app.callback())
        .post(`/trips/${tripId}/share`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ organization_id: org2Id })
        .expect(409)

      expect(response.body.error).toBe('Trip already shared with this organization')
    })

    it('should return 404 when trip does not exist', async () => {
      const response = await request(app.callback())
        .post('/trips/99999/share')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ organization_id: org2Id })
        .expect(404)

      expect(response.body.error).toBe('Trip not found')
    })

    it('should return 401 when not authenticated', async () => {
      await request(app.callback())
        .post(`/trips/${tripId}/share`)
        .send({ organization_id: org2Id })
        .expect(401)
    })

    it('should return 400 for invalid trip ID', async () => {
      const response = await request(app.callback())
        .post('/trips/invalid/share')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ organization_id: org2Id })
        .expect(400)

      expect(response.body.error).toBe('Invalid trip ID')
    })
  })

  describe('GET /trips/:id - permission check', () => {
    beforeEach(async () => {
      // Create a trip for user1's organization
      const tripResponse = await request(app.callback())
        .post('/trips')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          title: 'Team Trip',
          destination: 'Barcelona',
          start_date: '2024-07-01',
          end_date: '2024-07-10',
        })
      tripId = tripResponse.body.id
    })

    it('should allow organization with permission to view trip', async () => {
      const response = await request(app.callback())
        .get(`/trips/${tripId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200)

      expect(response.body.id).toBe(tripId)
      expect(response.body.title).toBe('Team Trip')
    })

    it('should deny access to organization without permission', async () => {
      const response = await request(app.callback())
        .get(`/trips/${tripId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(403)

      expect(response.body.error).toContain('Access denied')
    })

    it('should allow access after trip is shared', async () => {
      // Share trip with org2
      await request(app.callback())
        .post(`/trips/${tripId}/share`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ organization_id: org2Id })

      // User2 should now have access
      const response = await request(app.callback())
        .get(`/trips/${tripId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(200)

      expect(response.body.id).toBe(tripId)
    })
  })

  describe('PUT /trips/:id - permission check', () => {
    beforeEach(async () => {
      // Create a trip for user1's organization
      const tripResponse = await request(app.callback())
        .post('/trips')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          title: 'Team Trip',
          destination: 'Barcelona',
          start_date: '2024-07-01',
          end_date: '2024-07-10',
        })
      tripId = tripResponse.body.id
    })

    it('should allow organization with permission to update trip', async () => {
      const response = await request(app.callback())
        .put(`/trips/${tripId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ title: 'Updated Team Trip' })
        .expect(200)

      expect(response.body.title).toBe('Updated Team Trip')
    })

    it('should deny update to organization without permission', async () => {
      const response = await request(app.callback())
        .put(`/trips/${tripId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ title: 'Hacked Trip' })
        .expect(403)

      expect(response.body.error).toContain('Access denied')
    })

    it('should allow update after trip is shared with write permission', async () => {
      // Share trip with org2 with write permission
      await request(app.callback())
        .post(`/trips/${tripId}/share`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ organization_id: org2Id, permission_level: 'write' })

      // User2 should now be able to update
      const response = await request(app.callback())
        .put(`/trips/${tripId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ destination: 'Madrid' })
        .expect(200)

      expect(response.body.destination).toBe('Madrid')
    })
  })

  describe('POST /trips/:id/share - user-specific', () => {
    let user3Id: number
    let user3Token: string

    beforeEach(async () => {
      // Create a trip for user1's organization
      const tripResponse = await request(app.callback())
        .post('/trips')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          title: 'Team Trip',
          destination: 'Barcelona',
          start_date: '2024-07-01',
          end_date: '2024-07-10',
        })
      tripId = tripResponse.body.id

      // Create a third user in org2 (same org as user2)
      const hashedPassword = await bcrypt.hash('password123', 10)
      const email3 = `user3.${Date.now()}@org2.com`

      const user3Result = await executeQuery<{ id: number }>(
        `INSERT INTO users (email, password, organization_id) VALUES ($1, $2, $3) RETURNING id`,
        [email3, hashedPassword, org2Id]
      )
      user3Id = user3Result.rows[0].id

      const user3Response = await request(app.callback())
        .post('/auth/login')
        .send({ email: email3, password: 'password123' })
      user3Token = user3Response.body.token
    })

    it('should share trip with specific user', async () => {
      const response = await request(app.callback())
        .post(`/trips/${tripId}/share`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ user_id: user3Id })
        .expect(201)

      expect(response.body).toMatchObject({
        trip_id: tripId,
        user_id: user3Id,
        organization_id: null,
      })
    })

    it('should allow user-specific access but not org-wide access', async () => {
      // Share with user3 specifically
      await request(app.callback())
        .post(`/trips/${tripId}/share`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ user_id: user3Id })

      // User3 should have access
      await request(app.callback())
        .get(`/trips/${tripId}`)
        .set('Authorization', `Bearer ${user3Token}`)
        .expect(200)

      // User2 (same org as user3) should NOT have access
      const response = await request(app.callback())
        .get(`/trips/${tripId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(403)

      expect(response.body.error).toContain('Access denied')
    })

    it('should return 409 when trip already shared with user', async () => {
      // Share once
      await request(app.callback())
        .post(`/trips/${tripId}/share`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ user_id: user3Id })
        .expect(201)

      // Try to share again
      const response = await request(app.callback())
        .post(`/trips/${tripId}/share`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ user_id: user3Id })
        .expect(409)

      expect(response.body.error).toBe('Trip already shared with this user')
    })

    it('should return 400 when both organization_id and user_id provided', async () => {
      const response = await request(app.callback())
        .post(`/trips/${tripId}/share`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ organization_id: org2Id, user_id: user3Id })
        .expect(400)

      expect(response.body.error).toBe('Validation failed')
    })

    it('should return 400 when neither organization_id nor user_id provided', async () => {
      const response = await request(app.callback())
        .post(`/trips/${tripId}/share`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({})
        .expect(400)

      expect(response.body.error).toBe('Validation failed')
    })
  })
})
