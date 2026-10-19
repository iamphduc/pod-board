import { homedir, tmpdir } from 'node:os'
import { serve } from '@hono/node-server'
import { createTimelineSource } from './agent-timeline.ts'
import { createApp } from './app.ts'
import { createBoardService } from './board-service.ts'
import { portsDir } from './claims.ts'
import { configPath, listenConfig, portFromEnv } from './config.ts'
import { createGhReader } from './gh.ts'
import { addRepo } from './repos-config.ts'
import { claudeDir, transcriptDays } from './transcript-files.ts'
import { createBoardWatcher } from './watcher.ts'

const env = process.env
const platform = process.platform

let settings
try {
  settings = {
    listen: listenConfig(env),
    webPort: portFromEnv(env, 'POD_BOARD_WEB_PORT', 3001),
    configFile: configPath(env, platform, homedir()),
    portsDir: portsDir(env, tmpdir()),
    claudeDir: claudeDir(env, homedir()),
    transcriptDays: transcriptDays(env),
  }
} catch (err) {
  console.error(`pod-board: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
const { listen, webPort, configFile } = settings

const service = createBoardService({ ...settings, platform, gh: createGhReader() })
const watcher = createBoardWatcher({ service, ...settings, poll: env.POD_BOARD_POLL === '1' })
await watcher.start()

const app = createApp({
  ports: [listen.port, webPort],
  source: watcher,
  addRepo: (p) => addRepo(configFile, p, platform),
  timeline: createTimelineSource({ board: () => watcher.board(), ...settings, now: Date.now }).timeline,
})

const server = serve({ fetch: app.fetch, hostname: listen.hostname, port: listen.port }, () => {
  console.log(`pod-board API listening on http://${listen.hostname}:${listen.port}`)
  console.log(`pod-board config: ${configFile}`)
})

const stop = () => {
  server.close()
  void watcher.close().finally(() => process.exit(0))
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
