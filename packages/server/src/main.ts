import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createActionLog } from './action-log.ts'
import { createActionRoutes } from './action-routes.ts'
import { createAnswerRoutes } from './answer-routes.ts'
import { createTimelineSource } from './agent-timeline.ts'
import { createApp } from './app.ts'
import { createBoardService } from './board-service.ts'
import { portsDir } from './claims.ts'
import { configPath, listenConfig, portFromEnv } from './config.ts'
import { createGhReader, defaultGhExec } from './gh.ts'
import { addRepo } from './repos-config.ts'
import { createSessionToken, writeSessionToken } from './session-token.ts'
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

// A fresh token each launch, written before anything listens. No token file, no API.
const token = createSessionToken()
try {
  await writeSessionToken(dirname(configFile), token)
} catch (err) {
  console.error(`pod-board: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}

// The action log sits next to the token: `<config dir>/actions.jsonl`, read once here.
const log = createActionLog({ file: join(dirname(configFile), 'actions.jsonl'), now: Date.now })
const gh = createGhReader({ exec: defaultGhExec })
const service = createBoardService({ ...settings, platform, gh, actions: log.recent })
const watcher = createBoardWatcher({ service, ...settings, poll: env.POD_BOARD_POLL === '1' })
await watcher.start()

const app = createApp({
  ports: [listen.port, webPort],
  token,
  source: watcher,
  addRepo: (p) => addRepo(configFile, p, platform),
  timeline: createTimelineSource({ board: () => watcher.board(), ...settings, now: Date.now }).timeline,
  actions: new Hono()
    .route(
      '/',
      createActionRoutes({
        board: () => watcher.board(),
        gh,
        exec: defaultGhExec,
        refreshGh: (board) => service.refreshGh(board),
        rebuild: () => watcher.rebuild(),
        log,
      }),
    )
    .route('/', createAnswerRoutes({ board: () => watcher.board(), rebuild: () => watcher.rebuild(), log })),
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
