import request from 'supertest'
import app from '../src/index'
import { executeQuery } from '../src/db'
import bcrypt from 'bcrypt'

const uniqueEmail = () => `test.${Date.now()}@example.com`

describe('Authentication', () => {
  afterEach(async () => {
    // Clean database between tests
    await executeQuery('TRUNCATE trips, travelers, bookings, payments, users, organizations CASCADE')
  })

  describe('POST /auth/register', () => {
    it('should register a new user and return token', async () => {
      const email = uniqueEmail()
      const password = 'password123'
      const organization_name = 'New Organization'

      const response = await request(app.callback())
        .post('/auth/register')
        .send({ email, password, organization_name })
        .expect(201)

      expect(response.body.token).toBeDefined()
      expect(typeof response.body.token).toBe('string')
      expect(response.body.user).toMatchObject({
        email,
      })
      expect(response.body.user.id).toBeDefined()
      expect(response.body.user.organization_id).toBeDefined()

      // Verify user was created in database
      const userResult = await executeQuery(
        'SELECT * FROM users WHERE email = $1',
        [email]
      )
      expect(userResult.rows.length).toBe(1)

      // Verify organization was created
      const orgResult = await executeQuery(
        'SELECT * FROM organizations WHERE name = $1',
        [organization_name]
      )
      expect(orgResult.rows.length).toBe(1)
    })

    it('should return 409 if email already exists', async () => {
      const email = uniqueEmail()
      const password = 'password123'

      // Register first user
      await request(app.callback())
        .post('/auth/register')
        .send({ email, password, organization_name: 'Org 1' })
        .expect(201)

      // Try to register with same email
      const response = await request(app.callback())
        .post('/auth/register')
        .send({ email, password, organization_name: 'Org 2' })
        .expect(409)

      expect(response.body.error).toContain('already exists')
    })

    it('should return 400 for invalid email', async () => {
      const response = await request(app.callback())
        .post('/auth/register')
        .send({
          email: 'invalid-email',
          password: 'password123',
          organization_name: 'Test Org'
        })
        .expect(400)

      expect(response.body.error).toBe('Validation failed')
    })

    it('should return 400 for password shorter than 8 characters', async () => {
      const response = await request(app.callback())
        .post('/auth/register')
        .send({
          email: uniqueEmail(),
          password: 'short',
          organization_name: 'Test Org'
        })
        .expect(400)

      expect(response.body.error).toBe('Validation failed')
      expect(response.body.details.password).toBeDefined()
    })

    it('should return 400 if organization_name is missing', async () => {
      const response = await request(app.callback())
        .post('/auth/register')
        .send({
          email: uniqueEmail(),
          password: 'password123'
        })
        .expect(400)

      expect(response.body.error).toBe('Validation failed')
    })

    it('should hash password before storing', async () => {
      const email = uniqueEmail()
      const password = 'password123'

      await request(app.callback())
        .post('/auth/register')
        .send({ email, password, organization_name: 'Test Org' })
        .expect(201)

      // Verify password is hashed
      const userResult = await executeQuery<{ password: string }>(
        'SELECT password FROM users WHERE email = $1',
        [email]
      )
      const storedPassword = userResult.rows[0].password

      expect(storedPassword).not.toBe(password)
      expect(storedPassword.startsWith('$2b$')).toBe(true) // bcrypt hash format
    })
  })

  describe('POST /auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      // Arrange: Create organization and user
      const orgResult = await executeQuery<{ id: number }>(
        `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
        ['Test Organization']
      )
      const orgId = orgResult.rows[0].id

      const email = uniqueEmail()
      const password = 'password123'
      const hashedPassword = await bcrypt.hash(password, 10)

      const userResult = await executeQuery<{ id: number }>(
        `INSERT INTO users (email, password, organization_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [email, hashedPassword, orgId]
      )
      const userId = userResult.rows[0].id

      // Act: Login
      const response = await request(app.callback())
        .post('/auth/login')
        .send({ email, password })
        .expect(200)

      // Assert: Token and user info returned
      expect(response.body.token).toBeDefined()
      expect(typeof response.body.token).toBe('string')
      expect(response.body.user).toMatchObject({
        id: userId,
        email: email,
        organization_id: orgId,
      })
    })

    it('should return 401 for non-existent user', async () => {
      // Act: Login with non-existent email
      const response = await request(app.callback())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        })
        .expect(401)

      // Assert: Error message
      expect(response.body).toEqual({ error: 'Invalid credentials' })
    })

    it('should return 401 for incorrect password', async () => {
      // Arrange: Create user
      const orgResult = await executeQuery<{ id: number }>(
        `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
        ['Test Organization']
      )
      const orgId = orgResult.rows[0].id

      const email = uniqueEmail()
      const correctPassword = 'password123'
      const hashedPassword = await bcrypt.hash(correctPassword, 10)

      await executeQuery(
        `INSERT INTO users (email, password, organization_id)
         VALUES ($1, $2, $3)`,
        [email, hashedPassword, orgId]
      )

      // Act: Login with wrong password
      const response = await request(app.callback())
        .post('/auth/login')
        .send({
          email,
          password: 'wrongpassword',
        })
        .expect(401)

      // Assert: Error message
      expect(response.body).toEqual({ error: 'Invalid credentials' })
    })

    it('should return 400 for invalid email format', async () => {
      // Act: Login with invalid email
      const response = await request(app.callback())
        .post('/auth/login')
        .send({
          email: 'not-an-email',
          password: 'password123',
        })
        .expect(400)

      // Assert: Validation error
      expect(response.body.error).toBe('Validation failed')
      expect(response.body.details).toHaveProperty('email')
    })

    it('should return 400 for missing password', async () => {
      // Act: Login without password
      const response = await request(app.callback())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
        })
        .expect(400)

      // Assert: Validation error
      expect(response.body.error).toBe('Validation failed')
      expect(response.body.details).toHaveProperty('password')
    })

    it('should return 400 for missing email', async () => {
      // Act: Login without email
      const response = await request(app.callback())
        .post('/auth/login')
        .send({
          password: 'password123',
        })
        .expect(400)

      // Assert: Validation error
      expect(response.body.error).toBe('Validation failed')
      expect(response.body.details).toHaveProperty('email')
    })
  })

  describe('Auth Middleware - requireAuth', () => {
    let token: string
    let userId: number

    beforeEach(async () => {
      // Create user and get token
      const orgResult = await executeQuery<{ id: number }>(
        `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
        ['Test Organization']
      )
      const orgId = orgResult.rows[0].id

      const email = uniqueEmail()
      const password = 'password123'
      const hashedPassword = await bcrypt.hash(password, 10)

      const userResult = await executeQuery<{ id: number }>(
        `INSERT INTO users (email, password, organization_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [email, hashedPassword, orgId]
      )
      userId = userResult.rows[0].id

      // Login to get token
      const loginResponse = await request(app.callback())
        .post('/auth/login')
        .send({ email, password })

      token = loginResponse.body.token
    })

    it('should allow access with valid token', async () => {
      // Act: Create trip with valid token
      const response = await request(app.callback())
        .post('/trips')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Authenticated Trip',
          destination: 'Paris',
          start_date: '2024-06-01',
          end_date: '2024-06-15',
        })
        .expect(201)

      // Assert: Trip created
      expect(response.body).toMatchObject({
        title: 'Authenticated Trip',
        destination: 'Paris',
      })
    })

    it('should return 401 when no token provided', async () => {
      // Act: Create trip without token
      const response = await request(app.callback())
        .post('/trips')
        .send({
          title: 'Unauthenticated Trip',
          destination: 'London',
          start_date: '2024-07-01',
          end_date: '2024-07-15',
        })
        .expect(401)

      // Assert: Error message
      expect(response.body).toEqual({ error: 'No token provided' })
    })

    it('should return 401 for invalid token', async () => {
      // Act: Create trip with invalid token
      const response = await request(app.callback())
        .post('/trips')
        .set('Authorization', 'Bearer invalid-token-here')
        .send({
          title: 'Trip',
          destination: 'Rome',
          start_date: '2024-08-01',
          end_date: '2024-08-15',
        })
        .expect(401)

      // Assert: Error message
      expect(response.body).toEqual({ error: 'Invalid or expired token' })
    })

    it('should return 401 for token without Bearer prefix', async () => {
      // Act: Create trip with token but no Bearer prefix
      const response = await request(app.callback())
        .post('/trips')
        .set('Authorization', token)
        .send({
          title: 'Trip',
          destination: 'Berlin',
          start_date: '2024-09-01',
          end_date: '2024-09-15',
        })
        .expect(401)

      // Assert: Error message
      expect(response.body).toEqual({ error: 'No token provided' })
    })

    it('should return 401 for malformed authorization header', async () => {
      // Act: Create trip with malformed header
      const response = await request(app.callback())
        .post('/trips')
        .set('Authorization', 'NotBearer token')
        .send({
          title: 'Trip',
          destination: 'Madrid',
          start_date: '2024-10-01',
          end_date: '2024-10-15',
        })
        .expect(401)

      // Assert: Error message
      expect(response.body).toEqual({ error: 'No token provided' })
    })
  })

  describe('Protected Routes', () => {
    it('should allow GET /trips without authentication', async () => {
      // Act: Get trips without token
      const response = await request(app.callback())
        .get('/trips')
        .expect(200)

      // Assert: Response is array
      expect(Array.isArray(response.body)).toBe(true)
    })

    it('should protect POST /trips and require authentication', async () => {
      // Act: Try to create trip without authentication
      const response = await request(app.callback())
        .post('/trips')
        .send({
          title: 'Unauthorized Trip',
          destination: 'Vienna',
          start_date: '2024-11-01',
          end_date: '2024-11-15',
        })
        .expect(401)

      // Assert: Error message
      expect(response.body).toEqual({ error: 'No token provided' })

      // Assert: Trip was not created
      const tripsCheck = await executeQuery('SELECT COUNT(*) as count FROM trips')
      expect(parseInt(tripsCheck.rows[0].count)).toBe(0)
    })
  })
})
