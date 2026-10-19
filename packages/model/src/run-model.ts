// The run model: one repo's pod docs read into plans → sprints → waves → slices,
// plus the handoff queue. Built on the ported pod-flow parsers (left unchanged)
// and the format readers. Pure: it takes the files' text, never reads them.
// The rules and why are in pod-docs/feature-details/run-model.md.

import { docsVersion, needsYou, planExtras, prRef, sliceDeps, type DocsVersion, type PrRef } from './formats.ts'
import { isDone, parsePlan, parseQueue, parseSprint, readTable, type PlanDoc, type QueueEntry, type Row, type SprintDoc } from './pod-flow/model.ts'

/** Repo-relative path → file text. Keys may use `/` or `\`. A file not in the map doesn't exist. */
export type RepoFiles = Record<string, string>

export type QueueItem = QueueEntry & { needsYou: boolean }

export type SliceModel = {
  code: string
  title: string
  branch: string
  status: string
  confidence: string
  pr: PrRef
  dependsOn: string[]
  /** From the slice's `**Model:**` line: its first word, lowercased. */
  model?: string
  /** From the slice's `**Files owned:**` field, in order, without `(new)`. */
  filesOwned: string[]
  /** From the slice's `**One-way door:**` line; absent when it says none. */
  oneWayDoor?: string
}

export type WaveModel = { wave: number; slices: SliceModel[] }

export type SprintModel = {
  slug: string
  goal: string
  status: 'planned' | 'active' | 'done' | 'unknown'
  hasDoc: boolean
  isArchived: boolean
  waves: WaveModel[]
  currentWave?: number
}

export type PlanModel = {
  slug: string
  title: string
  status: string
  portBase?: number
  go: 'unknown'
  sprints: SprintModel[]
  queue: QueueItem[]
  currentSprint?: string
}

export type RepoModel = { docs: DocsVersion; plans: PlanModel[]; queue: QueueItem[] }

const README = 'pod-docs/README.md'
const QUEUE = 'pod-docs/handoff-queue.md'

/** The run model of one repo. Never throws: a missing or odd file gives unknown, empty, or absent fields. */
export function buildRepoModel(files: RepoFiles): RepoModel {
  const repo = normalizeKeys(files)
  const docs = docsVersion(repo.get(README))
  if (!docs.supported) return { docs, plans: [], queue: [] }

  const queue = parseQueue(repo.get(QUEUE) ?? '').map((entry) => ({ ...entry, needsYou: needsYou(entry) }))
  const planDocs = readPlans(repo)
  const sprintDocs = readSprints(repo)
  const joined = joinSprints(planDocs, sprintDocs)
  const plans = planDocs.map(({ doc, md }) => buildPlan(doc, md, joined.get(doc.slug) ?? [], queue))
  return { docs, plans, queue }
}

function normalizeKeys(files: RepoFiles): Map<string, string> {
  const map = new Map<string, string>()
  for (const [key, text] of Object.entries(files)) map.set(key.replaceAll('\\', '/'), text)
  return map
}

/** The `.md` files directly in `folder`, by name without `.md`, sorted. */
function mdIn(repo: Map<string, string>, folder: string): { slug: string; md: string }[] {
  const found: { slug: string; md: string }[] = []
  for (const [key, md] of repo) {
    if (!key.startsWith(folder) || !key.endsWith('.md')) continue
    const slug = key.slice(folder.length, -'.md'.length)
    if (slug !== '' && !slug.includes('/')) found.push({ slug, md })
  }
  return found.sort((a, b) => compare(a.slug, b.slug))
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Every plan doc, live and archived, sorted by slug. The same slug in both → the archived copy. */
function readPlans(repo: Map<string, string>): { doc: PlanDoc; md: string }[] {
  const bySlug = new Map<string, string>()
  for (const { slug, md } of mdIn(repo, 'pod-docs/plans/')) bySlug.set(slug, md)
  for (const { slug, md } of mdIn(repo, 'pod-docs/plans/archive/')) bySlug.set(slug, md)
  return [...bySlug]
    .sort(([a], [b]) => compare(a, b))
    .map(([slug, md]) => {
      const doc = parsePlan(md, slug)
      // A table row with an empty Sprint cell names nothing, so it's skipped.
      return { doc: { ...doc, sprints: doc.sprints.filter((s) => s.slug !== '') }, md }
    })
}

type SprintFile = { doc: SprintDoc; md: string }

/** Every sprint doc by its slug. The same slug live and archived → the archived copy. */
function readSprints(repo: Map<string, string>): Map<string, SprintFile> {
  const bySlug = new Map<string, SprintFile>()
  const add = (folder: string, isArchived: boolean) => {
    for (const { slug, md } of mdIn(repo, folder)) {
      const doc = parseSprint(md, isArchived, slug)
      if (doc) bySlug.set(doc.slug, { doc, md })
    }
  }
  add('pod-docs/sprints/', false)
  add('pod-docs/sprints/archive/', true)
  return bySlug
}

/**
 * Each plan's sprint docs. A doc joins the plan its `From plan:` names; with none, the first plan
 * (by slug) whose sprint table lists it. A doc naming a plan that doesn't exist, or listed by no plan, is dropped.
 */
function joinSprints(plans: { doc: PlanDoc }[], sprints: Map<string, SprintFile>): Map<string, SprintFile[]> {
  const joined = new Map<string, SprintFile[]>()
  for (const file of sprints.values()) {
    const owner = file.doc.plan
      ? plans.find((p) => p.doc.slug === file.doc.plan)
      : plans.find((p) => p.doc.sprints.some((s) => s.slug === file.doc.slug))
    if (!owner) continue
    joined.set(owner.doc.slug, [...(joined.get(owner.doc.slug) ?? []), file])
  }
  return joined
}

function buildPlan(doc: PlanDoc, md: string, files: SprintFile[], queue: QueueItem[]): PlanModel {
  const docBySlug = new Map(files.map((f) => [f.doc.slug, f]))
  const rows = doc.sprints.map((row) => buildSprint(row, docBySlug.get(row.slug)))
  // Docs whose `From plan:` names this plan but whose table doesn't list them come after the table rows.
  const listed = new Set(doc.sprints.map((s) => s.slug))
  const extra = files.filter((f) => !listed.has(f.doc.slug)).map((f) => buildSprint(undefined, f))
  const sprints = [...rows, ...extra]

  const slugs = new Set(sprints.map((s) => s.slug))
  const plan: PlanModel = {
    slug: doc.slug,
    title: doc.title,
    status: doc.status,
    ...planExtras(md),
    sprints,
    queue: queue.filter((e) => (e.plan ? e.plan === doc.slug : e.sprint !== undefined && slugs.has(e.sprint))),
  }
  const current = doc.status === 'archived' ? undefined : sprints.find((s) => s.status !== 'done')
  if (current) plan.currentSprint = current.slug
  return plan
}

type PlanRow = PlanDoc['sprints'][number]

function buildSprint(row: PlanRow | undefined, file: SprintFile | undefined): SprintModel {
  const slug = row?.slug ?? file?.doc.slug ?? ''
  const sprint: SprintModel = {
    slug,
    goal: row?.goal ?? '',
    status: sprintStatus(row?.status, file?.doc.isArchived),
    hasDoc: file !== undefined,
    isArchived: file?.doc.isArchived ?? false,
    waves: file ? buildWaves(file) : [],
  }
  // A done sprint has no current wave, even with a blocked or skipped slice left on its board.
  const open = sprint.status === 'done' ? [] : (file?.doc.rows.filter((r) => !isDone(r)).map((r) => r.wave) ?? [])
  if (open.length > 0) sprint.currentWave = Math.min(...open)
  return sprint
}

/** Row `done` or archived doc → done; row `active` or a live doc → active; row `planned` → planned; else unknown. */
function sprintStatus(row: string | undefined, isArchived: boolean | undefined): SprintModel['status'] {
  const status = row?.trim().toLowerCase()
  if (status === 'done' || isArchived === true) return 'done'
  if (status === 'active' || isArchived === false) return 'active'
  if (status === 'planned') return 'planned'
  return 'unknown'
}

function buildWaves({ doc, md }: SprintFile): WaveModel[] {
  // parseSprint drops the Depends on column, so it's read from the same table, row for row.
  const { headers, rows } = readTable(md, 'Wave')
  const depsAt = headers.indexOf('depends on')
  const waves = new Map<number, SliceModel[]>()
  doc.rows.forEach((row, i) => {
    const cell = depsAt < 0 ? '' : (rows[i]?.[depsAt] ?? '')
    const slices = waves.get(row.wave) ?? []
    slices.push(buildSlice(row, cell, sliceDetail(md, row.slice)))
    waves.set(row.wave, slices)
  })
  return [...waves].sort(([a], [b]) => a - b).map(([wave, slices]) => ({ wave, slices }))
}

function buildSlice(row: Row, depsCell: string, detail: SliceDetail): SliceModel {
  return {
    code: row.slice,
    title: row.title,
    branch: row.branch,
    status: row.status,
    confidence: row.confidence,
    pr: prRef(row.pr, row.status),
    dependsOn: sliceDeps(depsCell),
    ...detail,
  }
}

type SliceDetail = Pick<SliceModel, 'model' | 'filesOwned' | 'oneWayDoor'>

/**
 * The slice's fields from its `### <code>: <title>` section (exact code match; the first such section),
 * which runs to the next `##` or `###` heading. No section → no model or door, and no files.
 */
export function sliceDetail(md: string, code: string): SliceDetail {
  const lines = md.split(/\r?\n/)
  const start = lines.findIndex((line) => {
    const heading = /^###\s+([^:]+):/.exec(line)
    return heading?.[1]?.trim() === code
  })
  if (start < 0) return { filesOwned: [] }
  const end = lines.findIndex((line, i) => i > start && /^#{2,3}\s/.test(line))
  const section = lines.slice(start + 1, end < 0 ? undefined : end)

  const detail: SliceDetail = { filesOwned: filesOwned(field(section, 'Files owned')) }
  const model = field(section, 'Model')?.split(/\s+/)[0]?.replace(/[.,;:]+$/, '').toLowerCase()
  if (model) detail.model = model
  const door = field(section, 'One-way door')?.trim()
  if (door && !/^none\b/i.test(door)) detail.oneWayDoor = door
  return detail
}

/**
 * A `- **<name>:** …` field of a slice section: its text, then the text of the deeper lines under it.
 * Only a top-level bullet counts, so `**Model:**` inside another field's text isn't the field.
 */
function field(section: string[], name: string): string | undefined {
  const label = `- **${name}:**`
  const at = section.findIndex((line) => line.startsWith(label))
  const first = section[at]
  if (first === undefined) return undefined
  const text = [first.slice(label.length).trim()]
  for (const line of section.slice(at + 1)) {
    if (!/^\s+\S/.test(line)) break
    text.push(line.trim())
  }
  return text.filter((t) => t !== '').join('\n')
}

/** Backticked paths in order; with none, the text split on commas. `(new)` and bullet labels drop out. */
function filesOwned(text: string | undefined): string[] {
  if (!text) return []
  const ticked = [...text.matchAll(/`([^`]+)`/g)].map((m) => cleanPath(m[1] ?? ''))
  const paths = ticked.length > 0 ? ticked : text.replace(/^-\s*\*\*[^*]+:\*\*/gm, ',').split(/[,\n]/).map(cleanPath)
  // A dash alone names no file.
  return paths.filter((p) => p !== '' && !/^[-—–]+$/.test(p))
}

const cleanPath = (p: string) => p.replace(/\(new\)/gi, '').trim()
