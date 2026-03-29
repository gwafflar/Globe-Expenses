import { describe, it, expect } from 'vitest'
import { buildColumnMap } from '../sheetColumns'

describe('buildColumnMap', () => {
  it('places exchangeRate, costMain, and costLocal correctly for N=2', () => {
    const cm = buildColumnMap(2)
    expect(cm.exchangeRate).toBe(9)
    expect(cm.costMain).toBe(10)
    expect(cm.costLocal[0]).toBe(13)
    expect(cm.costLocal[1]).toBe(14)
    expect(cm.paidLocal[0]).toBe(15)
    expect(cm.paidLocal[1]).toBe(16)
  })

  it('places exchangeRate at col I for N=1', () => {
    const cm = buildColumnMap(1)
    expect(cm.exchangeRate).toBe(9)
    expect(cm.costMain).toBe(10)
    expect(cm.costLocal[0]).toBe(13)
  })
})
