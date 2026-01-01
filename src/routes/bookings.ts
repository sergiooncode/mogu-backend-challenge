import Router from '@koa/router'
import { getBookings, getBooking, createBooking, updateBooking, deleteBooking, cancelBooking } from '../middleware/bookingsMiddleware'

const router = new Router({ prefix: '/bookings' })

router.get('/', getBookings)
router.get('/:id', getBooking)
router.post('/', createBooking)
router.patch('/:id/cancel', cancelBooking)
router.put('/:id', updateBooking)
router.delete('/:id', deleteBooking)

export default router
