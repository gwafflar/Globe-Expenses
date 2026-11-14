/**
 * Push limiter decision (docs/NOTIFICATIONS_SPEC.md §6.1). PURE.
 *
 * One counter per (recipient, space). The first N events in a burst push
 * normally, the next one pushes a single "more changes" message, and everything
 * after that is silent until WINDOW has passed with no event at all.
 */

/** Normal pushes allowed per burst. */
export const PUSH_LIMIT_N = 2
/** Quiet time after which the counter is treated as 0 again. */
export const PUSH_WINDOW_MS = 60_000

export interface ThrottleState {
  count: number
  /** Milliseconds since epoch of the last event, or null if there was none. */
  lastEventAtMs: number | null
}

export type PushDecision = 'normal' | 'final' | 'none'

/**
 * @param state  the stored counter, or null when the document does not exist
 * @returns the decision for this event and the counter to store back
 */
export function decidePush(
  state: ThrottleState | null,
  nowMs: number,
): { decision: PushDecision; next: ThrottleState } {
  let count = state?.count ?? 0
  // Lazy reset: nothing clears the counter on a timer. The next event simply
  // notices that the last one is older than the window. A missing timestamp
  // (the client's reset-on-open wrote only `count: 0`) counts as "long ago".
  const last = state?.lastEventAtMs ?? null
  if (last === null || nowMs - last > PUSH_WINDOW_MS) count = 0

  const decision: PushDecision = count < PUSH_LIMIT_N ? 'normal' : count === PUSH_LIMIT_N ? 'final' : 'none'
  // The window is quiet-based: every event, pushed or not, restarts it.
  return { decision, next: { count: count + 1, lastEventAtMs: nowMs } }
}
