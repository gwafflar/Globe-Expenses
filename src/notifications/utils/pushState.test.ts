import { describe, expect, it } from 'vitest'
import {
  EMPTY_BANNER_HISTORY,
  MAX_NOT_NOW,
  canShowBanner,
  derivePushState,
  type PushFacts,
} from './pushState'

// An Android phone, supported, never asked.
const facts = (overrides: Partial<PushFacts> = {}): PushFacts => ({
  ios: false,
  standalone: false,
  supported: true,
  permission: 'default',
  optedOut: false,
  hasSubscription: false,
  ...overrides,
})

describe('derivePushState (spec §9.2)', () => {
  it('iOS in a Safari tab needs the Home Screen install, whatever else is true', () => {
    expect(derivePushState(facts({ ios: true, standalone: false, supported: false }))).toBe('ios-needs-install')
    expect(derivePushState(facts({ ios: true, standalone: false, supported: true, permission: 'granted' }))).toBe(
      'ios-needs-install',
    )
  })

  it('the installed app on iOS behaves like any other device', () => {
    expect(derivePushState(facts({ ios: true, standalone: true }))).toBe('prompt')
  })

  it('a browser without push APIs is unsupported', () => {
    expect(derivePushState(facts({ supported: false }))).toBe('unsupported')
  })

  it('not asked yet → prompt; denied → blocked', () => {
    expect(derivePushState(facts())).toBe('prompt')
    expect(derivePushState(facts({ permission: 'denied' }))).toBe('blocked')
  })

  it('granted + subscribed + not opted out → on', () => {
    expect(derivePushState(facts({ permission: 'granted', hasSubscription: true }))).toBe('on')
  })

  it('granted but opted out → off, even though a subscription may linger', () => {
    expect(derivePushState(facts({ permission: 'granted', hasSubscription: true, optedOut: true }))).toBe('off')
  })

  it('granted but no subscription (e.g. right after signing out and in) → off', () => {
    expect(derivePushState(facts({ permission: 'granted', hasSubscription: false }))).toBe('off')
  })
})

describe('canShowBanner — no-nagging rule (spec §9.4)', () => {
  it('shows when there is something to offer and the moment is new', () => {
    expect(canShowBanner(EMPTY_BANNER_HISTORY, 'a', 'prompt')).toBe(true)
    expect(canShowBanner(EMPTY_BANNER_HISTORY, 'b', 'ios-needs-install')).toBe(true)
  })

  it.each(['on', 'off', 'blocked', 'unsupported'] as const)('never shows when the state is %s', (state) => {
    expect(canShowBanner(EMPTY_BANNER_HISTORY, 'a', state)).toBe(false)
  })

  it('each moment shows at most once', () => {
    const history = { shown: ['a' as const], notNow: 0 }
    expect(canShowBanner(history, 'a', 'prompt')).toBe(false)
    expect(canShowBanner(history, 'b', 'prompt')).toBe(true)
  })

  it('after two "Not now" answers, every banner stops', () => {
    expect(MAX_NOT_NOW).toBe(2)
    expect(canShowBanner({ shown: ['a'], notNow: 1 }, 'b', 'prompt')).toBe(true)
    expect(canShowBanner({ shown: ['a', 'b'], notNow: 2 }, 'e1', 'prompt')).toBe(false)
  })
})
