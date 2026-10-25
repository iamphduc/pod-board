import { describe, expect, it } from 'vitest'
import { nextBoundaryState } from './error-boundary.ts'

describe('nextBoundaryState', () => {
  it('an unfailed boundary follows the reset key', () => {
    expect(nextBoundaryState({ failed: false, key: 1 }, 2)).toEqual({ failed: false, key: 2 })
  })
  it('a failed boundary stays failed while the key is the same', () => {
    expect(nextBoundaryState({ failed: true, key: 1 }, 1)).toEqual({ failed: true, key: 1 })
  })
  it('a failed boundary resets when the key changes', () => {
    expect(nextBoundaryState({ failed: true, key: 1 }, 2)).toEqual({ failed: false, key: 2 })
  })
  it('an undefined key before the first board still resets on the first board', () => {
    expect(nextBoundaryState({ failed: true, key: undefined }, 5)).toEqual({ failed: false, key: 5 })
  })
})
