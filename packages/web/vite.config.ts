import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { DEFAULT_API_PORT, portFromEnv } from '@pod-board/server/config'

const apiPort = portFromEnv(process.env, 'POD_BOARD_API_PORT', DEFAULT_API_PORT)
const webPort = portFromEnv(process.env, 'POD_BOARD_WEB_PORT', 3001)

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: webPort,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
  preview: { host: '127.0.0.1', port: webPort, strictPort: true },
})
