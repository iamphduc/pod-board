import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '@pod-board/model'
import { createBoardStream, type StreamSource, type StreamState } from './board-stream.ts'

type Listener = (ev: { data?: unknown }) => void

/** A stand-in EventSource: the test fires its events by hand. */
class FakeSource implements StreamSource {
  closed = false
  private listeners = new Map<string, Listener[]>()
  addEventListener(type: string, fn: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn])
  }
  close() {
    this.closed = true
  }
  fire(type: string, data?: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data })
  }
}

const board = (generatedAt: number): Board => ({ generatedAt, gh: 'ok', repos: [] })

describe('reconnects and keeps the last board', () => {
  let sources: FakeSource[]
  let boards: Board[]
  let states: StreamState[]
  const last = () => {
    expect(sources.length, 'no source opened').toBeGreaterThan(0)
    return sources[sources.length - 1]!
  }

  beforeEach(() => {
    vi.useFakeTimers()
    sources = []
    boards = []
    states = []
  })
  afterEach(() => vi.useRealTimers())

  const start = () =>
    createBoardStream(
      () => {
        const s = new FakeSource()
        sources.push(s)
        return s
      },
      (b) => boards.push(b),
      (s) => states.push(s),
    )

  it('starts connecting, then goes live on the first board', () => {
    start()
    expect(states).toEqual(['connecting'])
    expect(sources).toHaveLength(1)
    last().fire('board', JSON.stringify(board(1)))
    expect(boards).toEqual([board(1)])
    expect(states).toEqual(['connecting', 'live'])
    last().fire('board', JSON.stringify(board(2)))
    expect(boards).toEqual([board(1), board(2)])
    expect(states).toEqual(['connecting', 'live'])
  })

  it('on error shows lost, closes the source, and keeps the last board', () => {
    start()
    last().fire('board', JSON.stringify(board(1)))
    last().fire('error')
    expect(states.at(-1)).toBe('lost')
    expect(sources[0]!.closed).toBe(true)
    expect(boards).toEqual([board(1)])
  })

  it('waits 1, 2, 4, 8, 16, then 30 s at most between tries', () => {
    start()
    const waits = [1000, 2000, 4000, 8000, 16000, 30000, 30000]
    for (const [i, ms] of waits.entries()) {
      last().fire('error')
      expect(sources).toHaveLength(i + 1)
      vi.advanceTimersByTime(ms - 1)
      expect(sources).toHaveLength(i + 1)
      vi.advanceTimersByTime(1)
      expect(sources).toHaveLength(i + 2)
    }
  })

  it('stays lost while retrying, and goes live again when a board arrives', () => {
    start()
    last().fire('error')
    vi.advanceTimersByTime(1000)
    expect(states).toEqual(['connecting', 'lost'])
    last().fire('board', JSON.stringify(board(3)))
    expect(states).toEqual(['connecting', 'lost', 'live'])
    expect(boards).toEqual([board(3)])
  })

  it('resets the delay to 1 s after a success', () => {
    start()
    last().fire('error')
    vi.advanceTimersByTime(1000)
    last().fire('error')
    vi.advanceTimersByTime(2000)
    last().fire('error')
    vi.advanceTimersByTime(4000)
    last().fire('board', JSON.stringify(board(1)))
    last().fire('error')
    expect(sources).toHaveLength(4)
    vi.advanceTimersByTime(1000)
    expect(sources).toHaveLength(5)
  })

  it('a burst of errors from one source schedules one reconnect', () => {
    start()
    const first = last()
    first.fire('error')
    first.fire('error')
    vi.advanceTimersByTime(1000)
    expect(sources).toHaveLength(2)
    first.fire('error')
    vi.advanceTimersByTime(60_000)
    expect(sources).toHaveLength(2)
  })

  it('ignores bad data: not JSON, not a board, or no data', () => {
    start()
    last().fire('board', JSON.stringify(board(1)))
    for (const bad of ['{nope', 'null', '[]', '42', JSON.stringify({ repos: 'x' }), JSON.stringify({ generatedAt: 1 }), undefined]) {
      last().fire('board', bad)
    }
    expect(boards).toEqual([board(1)])
    expect(states).toEqual(['connecting', 'live'])
  })

  it('bad data on a new connection does not count as a success', () => {
    start()
    last().fire('error')
    vi.advanceTimersByTime(1000)
    last().fire('board', '{nope')
    expect(states.at(-1)).toBe('lost')
  })

  it('stop closes the source, cancels the retry, and drops later events', () => {
    const stream = start()
    last().fire('error')
    stream.stop()
    vi.advanceTimersByTime(60_000)
    expect(sources).toHaveLength(1)
    const live = start()
    const s = last()
    live.stop()
    expect(s.closed).toBe(true)
    s.fire('board', JSON.stringify(board(9)))
    expect(boards).toEqual([])
  })

  it('a failing factory counts as an error and is retried', () => {
    let calls = 0
    const got: StreamState[] = []
    createBoardStream(
      () => {
        calls += 1
        if (calls === 1) throw new Error('no EventSource')
        const s = new FakeSource()
        sources.push(s)
        return s
      },
      () => {},
      (s) => got.push(s),
    )
    expect(got).toEqual(['connecting', 'lost'])
    vi.advanceTimersByTime(1000)
    expect(calls).toBe(2)
  })
})
