import Router from '@koa/router'
import { getTrips, getTrip, createTrip, updateTrip, deleteTrip, shareTrip } from '../middleware/tripsMiddleware'
import { requireAuth } from '../middleware/authMiddleware'

const router = new Router({ prefix: '/trips' })

router.get('/', getTrips)
router.get('/:id', requireAuth, getTrip)
router.post('/', requireAuth, createTrip)
router.post('/:id/share', requireAuth, shareTrip)
router.put('/:id', requireAuth, updateTrip)
router.delete('/:id', deleteTrip)

export default router
