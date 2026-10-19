// The board the server sends to the web app: every repo with its run model,
// its pod agents, its PRs, and its port claims. Types only; times are epoch ms.
// The shapes are the sprint's shared contract (pod-docs/sprints/server-runs.md).

import type { RepoModel } from './run-model.ts'

/** One pod agent, read from its transcript. Never holds transcript text, tool input, or tool output. */
export type AgentRun = {
  id: string
  session: string
  type: string
  description: string
  sprint?: string
  slice?: string
  branch?: string
  plan?: string
  round?: number
  model?: string
  startedAt?: number
  lastAt?: number
  tokens: number
  ended: boolean
}

export type AgentState = 'running' | 'ended' | 'stale'

export type PrStatus = {
  number: number
  state: 'open' | 'merged' | 'closed'
  checks: 'pass' | 'fail' | 'pending' | 'none'
  url?: string
  checkedAt: number
}

export type GhStatus = 'ok' | 'missing' | 'logged-out' | 'unknown'

export type Claim = { portBase: number; repoPath: string; plan: string }

export type BoardRepo = {
  id: string
  name: string
  path: string
  source: 'registered' | 'claim' | 'both'
  error?: string
  model: RepoModel
  agents: AgentRun[]
  prs: PrStatus[]
  claims: Claim[]
}

export type Board = {
  generatedAt: number
  gh: GhStatus
  ghCheckedAt?: number
  /** Set on every build where the config file exists but can't be read; the last repo list is still used. */
  configError?: 'config unreadable'
  repos: BoardRepo[]
}
