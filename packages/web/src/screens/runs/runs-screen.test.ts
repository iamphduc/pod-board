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
const T1_BLOCKED = entry('BLOCKED', 'engineer → human', 'sprint: ladder · slice: T1', "T1 can't reach the rates file.")

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
    // No `live` chip anywhere, and the bar has + Repo and the menu.
    expect(text(html)).not.toMatch(/\blive\b/i)
    expect(html).toMatch(/<button[^>]*class="btn sm lead"[^>]*aria-expanded="false"[^>]*>[\s\S]*?Repo<\/button>/)
    expect(html).toMatch(/aria-label="Menu"/)
    // The old views are gone.
    expect(text(html)).not.toMatch(/Wave board|Waiting on you|Add a repo/)
  })

  it('shows the connection status only while lost', () => {
    const repo = chess([onlyQueue()])
    expect(text(render({ repo, stream: 'lost' }).html)).toMatch(/lost · retrying/)
    expect(text(render({ repo, stream: 'connecting' }).html)).not.toMatch(/connecting|retrying/)
  })

  it('blocked first, rest counted', () => {
    const { html } = render({ repo: chess([onlyQueue(T1_BLOCKED), manual, t1Pushed], { prs: [gh(78, 'open')] }) })
    const card = cardOf(html)
    expect(card).toMatch(/<button[^>]*class="btn primary"[^>]*>Answer<\/button>/)
    expect(card).not.toMatch(/>Merge</)
    expect(text(card)).toMatch(/Blocked/)
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
