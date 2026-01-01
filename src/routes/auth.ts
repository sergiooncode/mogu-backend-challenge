import Router from '@koa/router'
import { login } from '../middleware/authMiddleware'

const router = new Router({ prefix: '/auth' })

router.post('/login', login)

export default router
