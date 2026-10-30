import { describe, expect, it } from 'vitest'
import { backPath, downPath, edgePath, headPath } from './geometry.ts'

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

describe('down path and heads', () => {
  const origin = { left: 100, top: 50, right: 900, bottom: 650 }

  it('runs straight down from the middle of one card bottom edge to the middle of the next card top edge', () => {
    const from = { left: 110, top: 60, right: 330, bottom: 138 }
    const to = { left: 110, top: 154, right: 330, bottom: 232 }
    // x = 220 - 100 = 120; y1 = 138 - 50 = 88; y2 = 154 - 50 = 104
    expect(downPath(from, to, origin)).toBe('M120 88 L120 104')
  })

  it('draws a small chevron with its tip on the point', () => {
    expect(headPath(270, 180.5, 'right')).toBe('M265 176.5 L270 180.5 L265 184.5')
    expect(headPath(120, 104, 'down')).toBe('M116 99 L120 104 L124 99')
  })
})

describe('back path', () => {
  const origin = { left: 100, top: 50, right: 900, bottom: 650 }

  it('runs from the left edge of a card back to the right edge of one in an earlier column, a third of the way down', () => {
    const from = { left: 370, top: 60, right: 590, bottom: 120 }
    const to = { left: 110, top: 150, right: 330, bottom: 210 }
    // x1 = 270, y1 = 40, x2 = 230, y2 = 150 + 20 - 50 = 120, m = 250
    expect(backPath(from, to, origin)).toBe('M270 40 C250 40 250 120 230 120')
    expect(headPath(230, 120, 'left')).toBe('M235 116 L230 120 L235 124')
  })
})
