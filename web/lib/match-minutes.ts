/**
 * Pure minute-calculation helpers extracted from the match live-scoring page.
 *
 * All functions are side-effect-free and take plain values — no React state,
 * no mutations.  This makes them trivially unit-testable with Vitest.
 *
 * ── Terminology ──────────────────────────────────────────────────────────────
 *  timerMs            — elapsed milliseconds since the quarter started (counts UP)
 *  playerEnteredAtMs  — {playerId → timerMs at which the player last entered}
 *  playerExitedAtMs   — {playerId → timerMs at which the player left the court}
 *  playerExitedWithTotalMs — {playerId → total accumulated ms at the moment of exit}
 *  existingMin        — already-committed integer minutes for a player
 */

// ── Sub-out minute calculation ────────────────────────────────────────────────

/**
 * Compute the new `minutes` value when a home player leaves the court.
 *
 * @param timerMs        Current timer value (elapsed ms).
 * @param enteredAtMs    timerMs when the player last entered the court.
 * @param existingMin    Minutes already committed for this player this match.
 * @returns              New integer minutes to persist (>= existingMin).
 */
export function calcSubOutMinutes(
  timerMs: number,
  enteredAtMs: number,
  existingMin: number,
): number {
  const rawStintMs = timerMs - enteredAtMs;
  const totalAtExit = Math.max(0, existingMin * 60_000 + rawStintMs);
  return Math.floor(totalAtExit / 60_000);
}

/**
 * Returns the exact total-ms at the moment of exit (stored in
 * playerExitedWithTotalMs so backward time-edits can reduce it correctly).
 */
export function calcSubOutTotalMs(
  timerMs: number,
  enteredAtMs: number,
  existingMin: number,
): number {
  const rawStintMs = timerMs - enteredAtMs;
  return Math.max(0, existingMin * 60_000 + rawStintMs);
}

// ── Flush (quarter change / time edit) ───────────────────────────────────────

/** Result of flushing a single on-court player's open-ended stint. */
export interface FlushOnCourtResult {
  /** New committed integer minutes. */
  newMin: number;
  /**
   * Value to store as the player's new `playerEnteredAtMs` going into the
   * next quarter: `nextEnteredAtMs - remainderMs` so sub-minute seconds are
   * never lost across quarter boundaries.
   */
  nextEnteredAtMs: number;
}

/**
 * Flush an on-court (still playing) player's open-ended stint.
 *
 * @param currentTimerMs   Timer at the moment of the flush (quarter end / edit).
 * @param enteredAtMs      timerMs when the player last entered.
 * @param existingMin      Minutes already committed before this flush.
 * @param nextTimerOrigin  New timerMs origin for the next period (0 for a quarter
 *                         change, `newTimerMs` for a time edit).
 */
export function flushOnCourtPlayer(
  currentTimerMs: number,
  enteredAtMs: number,
  existingMin: number,
  nextTimerOrigin: number,
): FlushOnCourtResult {
  const rawStintMs = currentTimerMs - enteredAtMs;
  const totalMs = Math.max(0, existingMin * 60_000 + rawStintMs);
  const newMin = Math.floor(totalMs / 60_000);
  const remainderMs = totalMs % 60_000;
  return {
    newMin,
    nextEnteredAtMs: nextTimerOrigin - remainderMs,
  };
}

// ── Off-court (substituted-out) bounded recalculation ────────────────────────

/**
 * Recalculate minutes for a player who is OFF the court after a time edit.
 *
 * Their time accrual is capped at their exit point; backward edits can reduce
 * it but forward edits beyond the exit do nothing.
 *
 * @param currentTimerMs  New timer value after the edit.
 * @param exitTimerMs     timerMs when the player left the court.
 * @param totalAtExit     Total accumulated ms at the moment of exit (immutable
 *                        snapshot stored in playerExitedWithTotalMs).
 * @param existingMin     Minutes already committed before this recalc.
 */
export function recalcOffCourtPlayer(
  currentTimerMs: number,
  exitTimerMs: number,
  totalAtExit: number,
  existingMin: number,
): number {
  const targetMs = Math.max(0, totalAtExit + Math.min(0, currentTimerMs - exitTimerMs));
  return Math.floor(targetMs / 60_000);
}

// ── Staging constraint ────────────────────────────────────────────────────────

/**
 * Returns whether a bench player can be staged for substitution.
 *
 * The rule: the effective court size after applying all staged changes must
 * stay below 5 before adding this player.
 *
 * @param onCourtSize    Current number of players physically on court.
 * @param stagedOutCount Number of on-court players already staged to leave.
 * @param stagedInCount  Number of bench players already staged to enter.
 */
export function canStageBenchPlayer(
  onCourtSize: number,
  stagedOutCount: number,
  stagedInCount: number,
): boolean {
  const effectiveSize = onCourtSize - stagedOutCount + stagedInCount;
  return effectiveSize < 5;
}
