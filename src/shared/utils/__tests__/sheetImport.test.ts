import { describe, it, expect } from 'vitest'
import { parseDate } from '../sheetImport'

describe('parseDate', () => {
  it('parses a JS Date object', () => {
    expect(parseDate(new Date(2025, 6, 23))).toBe('23-07-2025')
  })

  it('parses an Excel serial number (45861 → 2025-07-23)', () => {
    expect(parseDate(45861)).toBe('23-07-2025')
  })

  it('parses a post-October serial (46123 → 2026-04-11)', () => {
    expect(parseDate(46123)).toBe('11-04-2026')
  })

  it('parses a DD/MM/YYYY string', () => {
    expect(parseDate('23/07/2025')).toBe('23-07-2025')
  })

  it('parses a DD-MM-YYYY string (Firestore format)', () => {
    expect(parseDate('23-07-2025')).toBe('23-07-2025')
  })

  it('returns undefined for undefined input', () => {
    expect(parseDate(undefined)).toBeUndefined()
  })

  it('returns undefined for null input', () => {
    expect(parseDate(null)).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(parseDate('')).toBeUndefined()
  })

  it('returns undefined for zero', () => {
    expect(parseDate(0)).toBeUndefined()
  })

  it('returns undefined for negative number', () => {
    expect(parseDate(-1)).toBeUndefined()
  })
})
