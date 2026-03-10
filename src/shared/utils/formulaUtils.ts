// src/shared/utils/formulaUtils.ts
//
// Safe arithmetic formula evaluator — no eval().
//
// Supports: +  -  *  /  parentheses  decimal numbers  (e.g. "2*2.5 + (1+0.5)")
// Returns null for any invalid or unsafe input (empty string, syntax error, division by zero).
//
// Implementation: classic recursive-descent parser.
// Operator precedence is encoded by the call hierarchy:
//   parseExpression  →  handles + and -  (lowest precedence)
//   parseTerm        →  handles * and /  (higher precedence)
//   parseFactor      →  handles numbers and parenthesised sub-expressions
//
// This means "2+3*4" correctly yields 14, not 20.

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a formula string and return the numeric result.
 * Returns null if the formula is invalid (bad syntax, division by zero, empty).
 *
 * @example
 *   evaluateFormula("2*2.5 + 1.5")  // → 6.5
 *   evaluateFormula("(10+5)/3")     // → 5
 *   evaluateFormula("abc")          // → null
 */
export function evaluateFormula(raw: string): number | null {
  // Strip whitespace and commas (common decimal separator variant)
  const expr = raw.trim().replace(/,/g, '.')
  if (!expr) return null

  try {
    const parser = new Parser(expr)
    const result = parser.parseExpression()
    // After parsing, there should be nothing left in the string.
    // If there is, the formula had unexpected trailing characters.
    if (!parser.isEnd()) return null
    if (!isFinite(result)) return null  // catches Infinity from x/0
    return result
  } catch {
    return null
  }
}

/**
 * Check whether a formula string evaluates to a valid positive number.
 * Useful for form validation before submission.
 */
export function isValidFormula(raw: string): boolean {
  const result = evaluateFormula(raw)
  return result !== null && result > 0
}

// ---------------------------------------------------------------------------
// Internal parser class
// ---------------------------------------------------------------------------

class Parser {
  private input: string
  // `pos` tracks where we are in the string as we parse character by character.
  private pos: number = 0

  constructor(input: string) {
    this.input = input
  }

  isEnd(): boolean {
    return this.pos >= this.input.length
  }

  // Look at the current character without consuming it.
  private peek(): string {
    return this.input[this.pos] ?? ''
  }

  // Consume the current character and advance.
  private consume(): string {
    return this.input[this.pos++]
  }

  // Skip any whitespace characters at the current position.
  private skipSpaces(): void {
    while (!this.isEnd() && this.peek() === ' ') {
      this.pos++
    }
  }

  // ---------------------------------------------------------------------------
  // Grammar rules (each method = one precedence level)
  // ---------------------------------------------------------------------------

  // Handles: expression = term (('+' | '-') term)*
  // This is the entry point and the lowest-precedence level.
  parseExpression(): number {
    this.skipSpaces()
    let value = this.parseTerm()

    while (!this.isEnd()) {
      this.skipSpaces()
      const op = this.peek()
      if (op !== '+' && op !== '-') break
      this.consume() // eat the operator
      this.skipSpaces()
      const right = this.parseTerm()
      value = op === '+' ? value + right : value - right
    }

    return value
  }

  // Handles: term = factor (('*' | '/') factor)*
  private parseTerm(): number {
    let value = this.parseFactor()

    while (!this.isEnd()) {
      this.skipSpaces()
      const op = this.peek()
      if (op !== '*' && op !== '/') break
      this.consume()
      this.skipSpaces()
      const right = this.parseFactor()
      if (op === '/' && right === 0) throw new Error('Division by zero')
      value = op === '*' ? value * right : value / right
    }

    return value
  }

  // Handles: factor = number | '(' expression ')' | unary minus
  private parseFactor(): number {
    this.skipSpaces()

    // Unary minus: e.g. -5 or -(2+3)
    if (this.peek() === '-') {
      this.consume()
      this.skipSpaces()
      return -this.parseFactor()
    }

    // Parenthesised sub-expression
    if (this.peek() === '(') {
      this.consume() // eat '('
      const value = this.parseExpression()
      this.skipSpaces()
      if (this.peek() !== ')') throw new Error('Missing closing parenthesis')
      this.consume() // eat ')'
      return value
    }

    // Number literal (integer or decimal)
    return this.parseNumber()
  }

  // Parse a numeric literal like "3", "2.5", ".5"
  private parseNumber(): number {
    let numStr = ''
    // Optional leading decimal point
    if (this.peek() === '.') numStr += '.'
    while (!this.isEnd() && /[\d.]/.test(this.peek())) {
      numStr += this.consume()
    }
    if (!numStr || numStr === '.') throw new Error('Expected number')
    const n = parseFloat(numStr)
    if (isNaN(n)) throw new Error('Invalid number')
    return n
  }
}