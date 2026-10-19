import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { listenConfig } from './config.ts'

const { hostname, port } = listenConfig(process.env)

serve({ fetch: createApp().fetch, hostname, port }, () => {
  console.log(`pod-board API listening on http://${hostname}:${port}`)
})
