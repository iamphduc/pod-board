import { describe, expect, it } from 'vitest'
import { edgePath } from './geometry.ts'

describe('edge path', () => {
  const origin = { left: 100, top: 50, right: 900, bottom: 650 }

  it('right and down, against an offset origin', () => {
    const from = { left: 110, top: 60, right: 330, bottom: 120 }
    const to = { left: 370, top: 200, right: 590, bottom: 261 }
    // x1 = 230, y1 = 40, x2 = 270, y2 = 180.5, m = 250
    expect(edgePath(from, to, origin)).toBe('M230 40 C250 40 250 180.5 270 180.5')
  })

  it('right and up, with at most one decimal', () => {
    const from = { left: 370, top: 300.33, right: 590.27, bottom: 360 }
    const to = { left: 630.1, top: 60, right: 850, bottom: 100 }
    // x1 = 490.27, y1 = 280.165, x2 = 530.1, y2 = 30, m = 510.185
    expect(edgePath(from, to, origin)).toBe('M490.3 280.2 C510.2 280.2 510.2 30 530.1 30')
  })
})
