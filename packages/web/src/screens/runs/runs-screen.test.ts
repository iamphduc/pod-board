import { describe, expect, it } from 'vitest'
import { buildRepoModel, listRuns, type Board, type BoardRepo, type Claim, type PrStatus, type RunSummary } from '@pod-board/model'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadFixture } from '../../../../model/test/load-fixture.ts'
import type { StreamState } from '../../board-stream.ts'
import { hashFor, type View } from '../../selection.ts'
import { RunsScreen } from './RunsScreen.tsx'
import type { TabStorage } from './tab-memory.ts'

// chess-web as in next-step.test.ts: plan sparring-ladder on wave 3 of sprint ladder, three PENDING entries for you.
const NOW = Date.UTC(2026, 9, 20, 12)
const PLAN = 'sparring-ladder'
const QUEUE = 'pod-docs/handoff-queue.md'
const LADDER = 'pod-docs/sprints/ladder.md'

type Files = Record<string, string>
type Edit = (files: Files) => void

const entry = (type: string, route: string, fields: string, body: string) => `- \`[2026-10-19 · ${type} · ${route}${fields ? ` · ${fields}` : ''}]\` ${body} **Resolution:** pending`
// An autopilot halt: the run stops, so its wave PR waits on you, and the halted plan shows no reply.
const HALT = entry('BLOCKED', 'orchestrator → human', `plan: ${PLAN}`, 'Gate 1: T1 is blocked, the rates file is missing.')

const onlyQueue = (...lines: string[]): Edit => (f) => {
  f[QUEUE] = ['# Handoff Queue', '', ...lines, ''].join('\n')
}
const manual: Edit = (f) => {
  for (const doc of ['pod-docs/plans/sparring-ladder.md', LADDER]) f[doc] = f[doc]!.replace(/^<!-- autopilot-run.*-->\r?\n/m, '')
}
const t1Pushed: Edit = (f) => {
  f[LADDER] = f[LADDER]!.replace('| ladder-T1 | — | pending | — |', '| ladder-T1 | #78 | pushed | medium |')
}
const gh = (number: number, state: PrStatus['state'], over: Partial<PrStatus> = {}): PrStatus => ({ number, state, checks: 'pass', checkedAt: NOW, ...over })

function chess(edits: Edit[] = [], extra: Partial<BoardRepo> = {}): BoardRepo {
  const files = loadFixture('chess-web')
  for (const e of edits) e(files)
  return { id: 'chess', name: 'chess-web', path: '/c', source: 'registered', model: buildRepoModel(files), agents: [], prs: [], claims: [], ...extra }
}
const boardOf = (repo: BoardRepo): Board => ({ generatedAt: NOW, gh: 'ok', repos: [repo], actions: [] })

/** A tab store holding `value`; writes are kept so a test could read them. */
function storage(value: string | null = null): TabStorage {
  let v = value
  return {
    getItem: () => v,
    setItem: (_k, x) => {
      v = x
    },
    removeItem: () => {
      v = null
    },
  }
}

type Render = { repo: BoardRepo; run?: RunSummary; plan?: string; view?: View; stream?: StreamState; tab?: string | null; agent?: string }

/** The screen's markup for a Board of one repo, the run picked by plan (or given). */
function render({ repo, run, plan = PLAN, view = 'pipeline', stream = 'live', tab = null, agent }: Render): { html: string; run: RunSummary } {
  const board = boardOf(repo)
  const runs = listRuns(board, NOW)
  const selected = run ?? runs.find((r) => r.plan === plan)
  if (!selected) throw new Error(`no run ${plan}`)
  const html = renderToStaticMarkup(
    createElement(RunsScreen, { board, stream, runs, selected, view, slice: undefined, agent, now: NOW, storage: storage(tab) }),
  )
  return { html, run: selected }
}

/** The Next step card's own markup. */
function cardOf(html: string): string {
  const m = /<section class="card[^"]*next-step[^"]*"[\s\S]*?<\/section>/.exec(html)
  expect(m, 'the Next step card').not.toBeNull()
  return m![0]
}
const text = (html: string) => html.replace(/<[^>]*>/g, ' ')
const count = (html: string, re: RegExp) => [...html.matchAll(new RegExp(re.source, 'g'))].length
/** Each tab button's label and its aria-expanded. */
function tabsOf(html: string): { label: string; expanded: string }[] {
  return [...html.matchAll(/<button[^>]*class="tab"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => ({
    label: text(m[1]!).replace(/\s+/g, ' ').trim(),
    expanded: /aria-expanded="(true|false)"/.exec(m[0])?.[1] ?? '',
  }))
}

describe('runs screen', () => {
  it('card then closed tabs', () => {
    const { html } = render({ repo: chess([onlyQueue(), manual, t1Pushed], { prs: [gh(78, 'open')] }) })
    const card = cardOf(html)
    // The card: Merge as its one primary button, the only primary button on the page.
    expect(count(html, /class="btn primary[^"]*"/)).toBe(1)
    expect(card).toMatch(/<button[^>]*class="btn primary"[^>]*>Merge<\/button>/)
    expect(card).toMatch(/id="merge-pr-78"/)
    expect(text(card)).toMatch(/Merge PR #78/)
    expect(text(card)).toMatch(/Needs you/)
    // The header above it: crumb, name, strip and wave.
    expect(html.indexOf('run-header')).toBeGreaterThan(-1)
    expect(html.indexOf('run-header')).toBeLessThan(html.indexOf('next-step'))
    expect(text(html)).toMatch(/Wave 3 of 3/)
    // Tabs follow the card, all closed, with no panel.
    expect(html.indexOf('class="tabs"')).toBeGreaterThan(html.indexOf('next-step'))
    const tabs = tabsOf(html)
    expect(tabs.map((t) => t.label.replace(/ \d+$/, ''))).toEqual(['Waiting', 'Plan', 'Log'])
    expect(tabs.every((t) => t.expanded === 'false')).toBe(true)
    expect(html).not.toMatch(/tab-panel/)
    // No `live` chip anywhere, and no top bar.
    expect(text(html)).not.toMatch(/\blive\b/i)
    expect(html).not.toMatch(/class="bar"/)
    // The old views are gone.
    expect(text(html)).not.toMatch(/Wave board|Waiting on you|Add a repo/)
  })

  it('shows the connection status only while lost', () => {
    const repo = chess([onlyQueue()])
    expect(text(render({ repo, stream: 'lost' }).html)).toMatch(/lost · retrying/)
    expect(text(render({ repo, stream: 'connecting' }).html)).not.toMatch(/connecting|retrying/)
  })

  it('blocked first, rest counted', () => {
    const { html } = render({ repo: chess([onlyQueue(HALT), t1Pushed], { prs: [gh(78, 'open')] }) })
    const card = cardOf(html)
    expect(card).toMatch(/<button[^>]*class="btn primary"[^>]*>Answer<\/button>/)
    expect(card).not.toMatch(/>Merge</)
    expect(text(card)).toMatch(/Blocked/)
    // The PR is the one other item.
    expect(tabsOf(html)[0]!.label).toBe('Waiting 1')
  })

  it('nothing to do', () => {
    const { html } = render({ repo: chess([onlyQueue()]) })
    const card = cardOf(html)
    expect(card).toMatch(/^<section class="card calm next-step"/)
    expect(text(card)).toMatch(/Nothing to do/)
    expect(card).not.toMatch(/<button/)
    expect(tabsOf(html)[0]!.label).toBe('Waiting 0')
  })

  it('remembered tab', () => {
    // A stored plan tab opens the Plan panel, with the wave board link.
    const plan = render({ repo: chess([onlyQueue()]), tab: 'plan' })
    expect(tabsOf(plan.html).find((t) => t.label === 'Plan')?.expanded).toBe('true')
    expect(plan.html).toMatch(/plan-tab/)
    expect(plan.html).toContain(`href="${hashFor(plan.run, 'board')}"`)
    // A stored waiting tab opens the Waiting panel.
    expect(render({ repo: chess([onlyQueue()]), tab: 'waiting' }).html).toMatch(/waiting-tab/)

    // A plan-less row: no Plan tab, and the stored plan shows nothing.
    const row: RunSummary = { repoId: 'chess', repo: 'chess-web', where: 'no active plan', state: 'idle' }
    const bare = render({ repo: chess(), run: row, tab: 'plan' })
    expect(tabsOf(bare.html).map((t) => t.label.replace(/ \d+$/, ''))).toEqual(['Waiting', 'Log'])
    expect(bare.html).not.toMatch(/tab-panel/)

    // The agent view shows Log, whatever is stored.
    const name = 'fix-scroll'
    const claim: Claim = { portBase: 3100, repoPath: '/c', plan: name }
    const fix = render({ repo: chess([], { claims: [claim] }), plan: name, view: 'agent', agent: 'f1', tab: null })
    expect(tabsOf(fix.html).find((t) => t.label === 'Log')?.expanded).toBe('true')
    expect(fix.html).toMatch(/log-tab/)
    // A fix run has steps, so its Plan tab stays; it has no wave board link.
    expect(tabsOf(fix.html).map((t) => t.label.replace(/ \d+$/, ''))).toEqual(['Waiting', 'Plan', 'Log'])
  })

  it('wave board view', () => {
    const { html, run } = render({ repo: chess(), view: 'board', tab: 'log' })
    expect(html).toMatch(/class="wave-board"/)
    expect(html).toMatch(new RegExp(`<a[^>]*href="${hashFor(run).replace(/[/#]/g, (c) => `\\${c}`)}"[^>]*>Back to the run</a>`))
    expect(html).toMatch(/run-header/)
    expect(html).not.toMatch(/next-step/)
    expect(html).not.toMatch(/class="tabs"/)
    expect(html).not.toMatch(/tab-panel/)
  })
})

/** The sidebar's own markup. */
function sideOf(html: string): string {
  const m = /<aside class="side"[\s\S]*?<\/aside>/.exec(html)
  expect(m, 'the sidebar').not.toBeNull()
  return m![0]
}
const headerOf = (html: string) => /<header class="run-header"[\s\S]*?<\/header>/.exec(html)?.[0] ?? ''

describe('sidebar', () => {
  const ADD = /<button[^>]*class="btn sm lead add-repo"[^>]*>[\s\S]*?<svg[\s\S]*?<\/svg>Add repo<\/button>/

  it('runs top to bottom: title, runs head, runs list, Add repo', () => {
    const { html } = render({ repo: chess([onlyQueue()]) })
    const side = sideOf(html)
    const at = (needle: string) => side.indexOf(needle)
    expect(at('Pod Board')).toBeGreaterThan(-1)
    expect(at('Runs · ')).toBeGreaterThan(at('Pod Board'))
    expect(at('class="run-list"')).toBeGreaterThan(at('Runs · '))
    expect(side).toMatch(ADD)
    expect(side.search(ADD)).toBeGreaterThan(at('class="run-list"'))
    // The button opens a dialog, and nothing is open at start.
    expect(side).toMatch(/aria-haspopup="dialog"/)
    expect(html).not.toMatch(/<dialog/)
  })

  it('keeps the short rows: no plan or sprint subtitle', () => {
    const side = sideOf(render({ repo: chess([onlyQueue()]) }).html)
    expect(text(side)).toMatch(/chess-web/)
    expect(side).toMatch(/class="status /)
    expect(text(side)).not.toMatch(/sparring-ladder|ladder|wave/i)
  })

  it('shows lost · retrying beside the title only while lost', () => {
    const repo = chess([onlyQueue()])
    const lost = sideOf(render({ repo, stream: 'lost' }).html)
    expect(lost).toMatch(/class="side-head"[\s\S]*Pod Board[\s\S]*lost · retrying/)
    expect(sideOf(render({ repo, stream: 'live' }).html)).not.toMatch(/retrying/)
  })

  it('puts the menu at the right end of the run header', () => {
    const { html } = render({ repo: chess([onlyQueue()]) })
    expect(sideOf(html)).not.toMatch(/aria-label="Menu"/)
    const header = headerOf(html)
    expect(header).toMatch(/aria-label="Menu"/)
    expect(header.indexOf('aria-label="Menu"')).toBeGreaterThan(header.indexOf('class="run-name"'))
    expect(count(html, /aria-label="Menu"/)).toBe(1)
  })

  it('keeps the menu on the wave board header', () => {
    expect(headerOf(render({ repo: chess(), view: 'board' }).html)).toMatch(/aria-label="Menu"/)
  })

  it('keeps the menu reachable with no repos', () => {
    // No run, so no header: the theme must still be reachable.
    const board: Board = { generatedAt: NOW, gh: 'ok', repos: [], actions: [] }
    const html = renderToStaticMarkup(
      createElement(RunsScreen, { board, stream: 'live', runs: [], selected: undefined, view: 'pipeline', slice: undefined, now: NOW, storage: storage() }),
    )
    expect(html).toMatch(/<main[\s\S]*aria-label="Menu"/)
    expect(text(html)).toMatch(/No repos yet/)
    expect(text(html)).toMatch(/Add repo/)
    expect(text(html)).not.toMatch(/in the bar/)
    expect(sideOf(html)).toMatch(ADD)
  })
})
