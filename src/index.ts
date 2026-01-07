import Koa from 'koa'
import cors from '@koa/cors'
import bodyParser from 'koa-bodyparser'
import router from './routes'
import { koaSwagger } from 'koa2-swagger-ui'
import * as fs from 'fs'
import * as yaml from 'yaml'
import * as path from 'path'

const app = new Koa()
const port = process.env.PORT || 3000

// Load OpenAPI spec
const openAPISpec = yaml.parse(
  fs.readFileSync(path.join(__dirname, '../openapi.yaml'), 'utf8')
)

// Error handling middleware
app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err) {
    const error = err as Error
    console.error('Error:', error.message)
    ctx.status = 500
    ctx.body = { error: 'Internal server error' }
  }
})

// Middleware
app.use(cors())
app.use(bodyParser())

// Swagger UI documentation (only in development/local)
if (process.env.NODE_ENV !== 'production') {
  app.use(
    koaSwagger({
      routePrefix: '/docs',
      swaggerOptions: {
        spec: openAPISpec,
      },
    })
  )
  console.log('📚 API Documentation available at http://localhost:3000/docs')
}

// Routes
app.use(router.routes())
app.use(router.allowedMethods())

// Export app for testing
export default app

// Start server (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`)
    console.log(`Health check: http://localhost:${port}/health`)
  })
}
