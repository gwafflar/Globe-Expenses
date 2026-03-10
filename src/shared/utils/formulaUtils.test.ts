// src/shared/utils/formulaUtils.test.ts
import { describe, it, expect } from 'vitest'
import { evaluateFormula, isValidFormula } from './formulaUtils'

describe('evaluateFormula', () => {
  // Basic arithmetic
  it('evaluates a plain number', () => expect(evaluateFormula('6.5')).toBe(6.5))
  it('evaluates addition', () => expect(evaluateFormula('2 + 1.5')).toBe(3.5))
  it('evaluates subtraction', () => expect(evaluateFormula('5 - 2')).toBe(3))
  it('evaluates multiplication', () => expect(evaluateFormula('2 * 2.5')).toBe(5))
  it('evaluates division', () => expect(evaluateFormula('9 / 3')).toBe(3))

  // Operator precedence — the critical one
  it('respects precedence: * before +', () => expect(evaluateFormula('2 + 3 * 4')).toBe(14))
  it('respects precedence: / before -', () => expect(evaluateFormula('10 - 6 / 2')).toBe(7))

  // Parentheses
  it('handles parentheses', () => expect(evaluateFormula('(2 + 3) * 4')).toBe(20))
  it('handles nested parentheses', () => expect(evaluateFormula('((2+1)*3)')).toBe(9))

  // The example from the spec
  // (Thanks Claude for remembering me this delicious roti chanai that I had for breakfast at George Town, Malaysia)
  it('handles the roti chanai example', () => expect(evaluateFormula('2*2.5 + 1.5')).toBe(6.5))

  // Comma as decimal separator
  it('accepts comma as decimal separator', () => expect(evaluateFormula('2,5 + 1,5')).toBe(4))

  // Edge cases — all should return null
  it('returns null for empty string', () => expect(evaluateFormula('')).toBeNull())
  it('returns null for non-numeric input', () => expect(evaluateFormula('abc')).toBeNull())
  it('returns null for division by zero', () => expect(evaluateFormula('5/0')).toBeNull())
  it('returns null for unclosed parenthesis', () => expect(evaluateFormula('(2+3')).toBeNull())
  it('returns null for trailing operator', () => expect(evaluateFormula('2+')).toBeNull())
  it('returns null for whitespace only', () => expect(evaluateFormula('   ')).toBeNull())
})

describe('isValidFormula', () => {
  it('returns true for a valid positive formula', () => expect(isValidFormula('2*2.5+1.5')).toBe(true))
  it('returns false for zero result', () => expect(isValidFormula('0')).toBe(false))
  it('returns false for negative result', () => expect(isValidFormula('1-5')).toBe(false))
  it('returns false for invalid input', () => expect(isValidFormula('abc')).toBe(false))
})