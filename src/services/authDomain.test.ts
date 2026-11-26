import { describe, it, expect } from 'vitest'
import { resolveAuthDomain } from './authDomain'

describe('resolveAuthDomain', () => {
  const configured = 'globe-expenses.firebaseapp.com'

  it('uses the web.app domain when served from it (same-origin redirect)', () => {
    expect(resolveAuthDomain('globe-expenses.web.app', 'globe-expenses', configured))
      .toBe('globe-expenses.web.app')
  })

  it('uses the firebaseapp.com domain when served from it', () => {
    expect(resolveAuthDomain('globe-expenses.firebaseapp.com', 'globe-expenses', configured))
      .toBe('globe-expenses.firebaseapp.com')
  })

  it('keeps the configured domain on localhost', () => {
    expect(resolveAuthDomain('localhost', 'globe-expenses', configured)).toBe(configured)
  })

  it('keeps the configured domain on preview channels (redirect URI not registered)', () => {
    expect(resolveAuthDomain('globe-expenses--notifications-abc123.web.app', 'globe-expenses', configured))
      .toBe(configured)
  })

  it('keeps the configured domain when projectId is missing', () => {
    expect(resolveAuthDomain('globe-expenses.web.app', undefined, configured)).toBe(configured)
  })
})
