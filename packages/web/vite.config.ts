import { homedir } from 'node:os'
import { dirname } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configPath, DEFAULT_API_PORT, portFromEnv } from '@pod-board/server/config'
import { tokenMetaPlugin } from '@pod-board/server/session-token'

const apiPort = portFromEnv(process.env, 'POD_BOARD_API_PORT', DEFAULT_API_PORT)
const webPort = portFromEnv(process.env, 'POD_BOARD_WEB_PORT', 3001)
// The API writes its session token next to its config file; the dev server reads it on each page load.
const configDir = dirname(configPath(process.env, process.platform, homedir()))

export default defineConfig({
  plugins: [react(), tokenMetaPlugin(configDir)],
  server: {
    host: '127.0.0.1',
    port: webPort,
    strictPort: true,
    // Vite's default CORS lets any localhost origin read responses, the proxied API's
    // included. The board is same-origin only: no response carries Access-Control-Allow-*.
    cors: false,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
  preview: { host: '127.0.0.1', port: webPort, strictPort: true, cors: false },
})
