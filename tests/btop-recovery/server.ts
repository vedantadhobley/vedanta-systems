import express from 'express'
import { createBtopRouter } from '../../src/server/routes/btop'

// No checkout .env, unrelated project routers, credentials, or public ingress.
const app = express()
app.use('/api/btop', createBtopRouter({ natsUrl: 'nats://nats:4222', nodes: ['luv'] }))
app.listen(3000, '0.0.0.0')
