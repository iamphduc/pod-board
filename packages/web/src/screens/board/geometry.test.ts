import { describe, expect, it } from 'vitest'
import { backPath, downPath, edgePath, headPath, stepPath } from './geometry.ts'

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

describe('step path', () => {
  const origin = { left: 100, top: 50, right: 900, bottom: 650 }
  // Source right edge at x 230, target left edge at x 262: a 32 px gap, its middle at x 246.
  const from = (top: number, bottom: number) => ({ left: 10, top, right: 330, bottom })
  const to = (top: number, bottom: number) => ({ left: 362, top, right: 600, bottom })

  it('leaves the source mid-line, turns down in the middle of the gap with 6 px rounded corners, and enters the target mid-line', () => {
    // y1 = (60 + 140) / 2 - 50 = 50; y2 = (170 + 250) / 2 - 50 = 160
    expect(stepPath(from(60, 140), to(170, 250), origin)).toBe('M230 50 L240 50 Q246 50 246 56 L246 154 Q246 160 252 160 L262 160')
  })

  it('turns up the same way when the target sits higher', () => {
    // y1 = 190 - 50 = 140; y2 = 100 - 50 = 50
    expect(stepPath(from(150, 230), to(60, 140), origin)).toBe('M230 140 L240 140 Q246 140 246 134 L246 56 Q246 50 252 50 L262 50')
  })

  it('is a straight line when both share a mid-line, and keeps small corners inside a small step', () => {
    expect(stepPath(from(60, 140), to(60, 140), origin)).toBe('M230 50 L262 50')
    expect(stepPath(from(60, 140), to(60.3, 140.3), origin)).toBe('M230 50 L262 50.3')
    // A 4 px step: the corner radius shrinks to half of it, 2 px.
    expect(stepPath(from(60, 140), to(64, 144), origin)).toBe('M230 50 L244 50 Q246 50 246 52 L246 52 Q246 54 248 54 L262 54')
  })
})

describe('back path', () => {
  const origin = { left: 100, top: 50, right: 900, bottom: 650 }

  it('runs the same step route back to an earlier column: from two thirds down the left edge to a third down the right edge', () => {
    // From x 370 (left edge) back to x 330 (right edge): gap middle 350 (x 250 in the box).
    const from = { left: 370, top: 60, right: 590, bottom: 120 }
    const to = { left: 110, top: 150, right: 330, bottom: 210 }
    // x1 = 270, y1 = 60 + 40 - 50 = 50; x2 = 230, y2 = 150 + 20 - 50 = 120
    expect(backPath(from, to, origin)).toBe('M270 50 L256 50 Q250 50 250 56 L250 114 Q250 120 244 120 L230 120')
    expect(headPath(230, 120, 'left')).toBe('M235 116 L230 120 L235 124')
  })
})
